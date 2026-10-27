import { describe, expect, it } from 'vitest';
import { campaign, campaignProjects } from '../../src/content/campaign';
import { activeProjects, canStartProject, offeredProjects } from '../../src/core/campaign';
import { type Command, reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { deserialize, serialize } from '../../src/core/serialize';
import { createInitialState, type GameState } from '../../src/core/state';
import { boardView, projectTabs } from '../../src/view/campaign';

/** 案件のすべての Task を完了済みにする（納品は次の Command の適用後に判定される） */
function deliver(state: GameState, projectId: string): GameState {
  const run = state.projects[projectId];
  if (!run) throw new Error(`始まっていない案件 ${projectId}`);
  const tasks = Object.fromEntries(Object.entries(run.tasks).map(([id, t]) => [id, { ...t, status: 'done' as const }]));
  return { ...state, projects: { ...state.projects, [projectId]: { ...run, tasks, completedAt: state.clock } } };
}

/** Command を適用して、出来事も返す */
function apply(state: GameState, command: Command): { state: GameState; events: readonly GameEvent[] } {
  return reduce(state, command);
}

const pause: Command = { type: 'TogglePause' };

describe('キャンペーンの進行（core/campaign.ts）', () => {
  it('最初はチュートリアルだけを受注でき、最初の2人で始まる', () => {
    const s = createInitialState('c', { campaign: true });
    expect(s.tutorial).not.toBeNull();
    expect(offeredProjects(s)).toEqual(['tutorialLp']);
    expect(Object.keys(s.team)).toEqual(campaign.team);
    expect(canStartProject(s, 'ecRenewal')).toBe(false);
    expect(reduce(s, { type: 'StartProject', projectId: 'ecRenewal' }).state).toBe(s);
    expect(reduce(s, { type: 'StartProject', projectId: 'tutorialLp' }).state.projects.tutorialLp).toBeDefined();
  });

  it('案件を納品すると次の案件を受注できるようになり、採用市場から社員を迎えられるようになる', () => {
    let s = reduce(createInitialState('c', { campaign: true }), {
      type: 'StartProject',
      projectId: 'tutorialLp',
    }).state;
    const candidate = s.market.candidates[0] ?? '';
    // チュートリアルの間は採用できない
    expect(reduce(s, { type: 'Hire', staffId: candidate }).state).toBe(s);
    const r = apply(deliver(s, 'tutorialLp'), pause);
    s = r.state;
    expect(offeredProjects(s)).toEqual(['ecRenewal']);
    expect(r.events).toContainEqual({ type: 'ProjectsOffered', projectIds: ['ecRenewal'] });
    expect(r.events).toContainEqual({ type: 'FeatureUnlocked', feature: 'hire' });
    const hired = apply(s, { type: 'Hire', staffId: candidate });
    s = hired.state;
    expect(hired.events).toContainEqual({ type: 'StaffJoined', staffId: candidate });
    expect(s.team[candidate]).toEqual({ seat: 'standard', used: 0 });
    expect(s.humanQueues[candidate]).toEqual([]);
  });

  it('コーポレートサイトの途中で SaaS 機能を受注でき、2件を同時に進められる', () => {
    let s = createInitialState('c', { campaign: true });
    for (const id of ['tutorialLp', 'ecRenewal', 'paymentFix']) {
      s = reduce(s, { type: 'StartProject', projectId: id }).state;
      s = reduce(deliver(s, id), pause).state;
    }
    s = reduce(s, { type: 'StartProject', projectId: 'corporateSite' }).state;
    expect(offeredProjects(s)).toEqual([]);
    const run = s.projects.corporateSite;
    const sitemap = run?.tasks.sitemap;
    if (!run || !sitemap) throw new Error('案件が始まっていない');
    s = {
      ...s,
      projects: {
        ...s.projects,
        corporateSite: { ...run, tasks: { ...run.tasks, sitemap: { ...sitemap, status: 'done' } } },
      },
    };
    s = reduce(s, pause).state;
    expect(offeredProjects(s)).toEqual(['saasFeature']);
    s = reduce(s, { type: 'StartProject', projectId: 'saasFeature' }).state;
    expect(activeProjects(s)).toEqual(['corporateSite', 'saasFeature']);
    expect(projectTabs(s, 'saasFeature').tabs.map((t) => [t.projectId, t.floor, t.selected])).toEqual([
      ['corporateSite', 1, false],
      ['saasFeature', 2, true],
    ]);
  });

  it('すべての案件を納品するとクリアになり、CampaignCleared を一度だけ出す', () => {
    let s = createInitialState('c', { campaign: true });
    const events: GameEvent[] = [];
    for (const id of campaignProjects) {
      s = reduce(s, { type: 'StartProject', projectId: id }).state;
      const r = apply(deliver(s, id), pause);
      s = r.state;
      events.push(...r.events);
    }
    expect(s.campaign?.cleared).toBe(true);
    expect(events.filter((e) => e.type === 'CampaignCleared')).toHaveLength(1);
    // 段階の進行では社員は増えない（採用市場から採用する）
    expect(Object.keys(s.team)).toEqual(campaign.team);
    expect(boardView(s)).toMatchObject({ cleared: true, progress: { done: 7, total: 7 }, offered: [], active: [] });
    expect(apply(s, pause).events.some((e) => e.type === 'CampaignCleared')).toBe(false);
  });

  it('作った Harness（会社の資産）は次の案件へ持ち越し、導入コストを二度払わない', () => {
    let s = createInitialState('c', { campaign: true });
    s = reduce(s, { type: 'StartProject', projectId: 'tutorialLp' }).state;
    s = reduce(deliver(s, 'tutorialLp'), pause).state;
    s = reduce(s, { type: 'StartProject', projectId: 'ecRenewal' }).state;
    s = reduce(s, { type: 'EquipPart', workerId: 'agent', partId: 'skillFrontend' }).state;
    expect(s.ownedParts).toEqual(['skillFrontend']);
    s = reduce(deliver(s, 'ecRenewal'), pause).state;
    s = reduce(s, { type: 'StartProject', projectId: 'paymentFix' }).state;
    expect(s.harnesses.agent?.parts).toEqual(['skillFrontend']);
    s = reduce(s, { type: 'RemovePart', workerId: 'agent', partId: 'skillFrontend' }).state;
    s = reduce(s, { type: 'EquipPart', workerId: 'agent', partId: 'skillFrontend' }).state;
    expect(s.harnessLedger).toHaveLength(1);
    // 解放の進み具合も持ち越す
    expect(s.unlocked).toContain('harness');
  });

  it('キャンペーンでなければ、どの案件でも始められる', () => {
    const s = createInitialState('s');
    expect(s.campaign).toBeNull();
    expect(canStartProject(s, 'saasFeature')).toBe(true);
    expect(offeredProjects(s)).toEqual([]);
  });

  it('セーブして読み込むと、キャンペーンの途中から同じ状態で再開できる', () => {
    let s = createInitialState('c', { campaign: true });
    s = reduce(s, { type: 'StartProject', projectId: 'tutorialLp' }).state;
    s = reduce(deliver(s, 'tutorialLp'), pause).state;
    s = reduce(s, { type: 'StartProject', projectId: 'ecRenewal' }).state;
    const loaded = deserialize(serialize(s));
    expect(loaded).toEqual(s);
    expect(activeProjects(loaded)).toEqual(['ecRenewal']);
  });
});
