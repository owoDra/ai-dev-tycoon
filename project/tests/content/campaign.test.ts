import { describe, expect, it } from 'vitest';
import { campaign, campaignProjects } from '../../src/content/campaign';
import { content } from '../../src/content/index';
import { staff } from '../../src/content/staff';
import type { CampaignDef } from '../../src/content/types';
import { validateCampaign } from '../../src/content/validate';

const withStages = (stages: CampaignDef['stages']): CampaignDef => ({ ...campaign, stages });

describe('キャンペーン（content/campaign.ts）', () => {
  it('全案件・社員・条件の参照先が存在し、解放の順序が矛盾しない', () => {
    expect(validateCampaign(content, campaign)).toEqual([]);
  });

  it('チュートリアル → ECサイト → 決済修正 → コーポレートサイト → SaaS機能 → 複数同時進行、の順に受注できる', () => {
    expect(campaign.stages.map((s) => s.projects)).toEqual([
      ['tutorialLp'],
      ['ecRenewal'],
      ['paymentFix'],
      ['corporateSite'],
      ['saasFeature'],
      ['internalTool', 'promoLp'],
    ]);
    // 最後の段階は2件以上を同時に受注する
    expect(campaign.stages.at(-1)?.projects.length).toBeGreaterThanOrEqual(2);
  });

  it('すべての案件がキャンペーンに一度ずつ現れ、固定の社員は全員が最初からいる（ほかの社員は採用市場で増やす）', () => {
    expect([...campaignProjects].sort()).toEqual(content.projects.map((p) => p.id).sort());
    expect([...campaign.team].sort()).toEqual(staff.map((h) => h.id).sort());
  });

  it('未定義の案件・社員・Task の参照や、後の段階の案件を待つ条件を検出する', () => {
    const [first, second] = campaign.stages;
    if (!first || !second) throw new Error('段階が足りない');
    const errors = (stages: CampaignDef['stages']) => validateCampaign(content, withStages(stages)).join('\n');
    expect(errors([first, { ...second, projects: ['nope'] }])).toContain('未定義の案件 nope');
    const teamErrors = (team: readonly string[]) => validateCampaign(content, { ...campaign, team }).join('\n');
    expect(teamErrors(['sato', 'nobody'])).toContain('未定義の社員 nobody');
    expect(teamErrors(['sato', 'sato'])).toContain('ID sato が重複している');
    expect(errors([first, { ...second, projects: ['tutorialLp'] }])).toContain('2回現れる');
    expect(
      errors([first, { ...second, when: { type: 'taskCompleted', projectId: 'tutorialLp', taskId: 'nope' } }]),
    ).toContain('未定義の Task');
    // 自分の段階や後の段階の案件の納品を待つと、いつまでも受注できない
    expect(errors([first, { ...second, when: { type: 'projectCompleted', projectId: 'ecRenewal' } }])).toContain(
      'まだ受注できない案件',
    );
    expect(errors([first, { ...second, when: { type: 'projectsCompleted', count: 2 } }])).toContain('1件しかない');
    expect(errors([{ ...second, when: { type: 'projectCompleted', projectId: 'tutorialLp' } }])).toContain(
      '最初の段階',
    );
  });
});
