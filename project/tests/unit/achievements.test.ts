import { describe, expect, it } from 'vitest';
import { achievementDefs } from '../../src/content/achievements';
import { balance } from '../../src/content/balance';
import { getProject } from '../../src/content/index';
import type { AchievementCondition } from '../../src/content/types';
import { achievementHolds, checkAchievements, isAchieved, managedBy } from '../../src/core/achievements';
import type { GameEvent } from '../../src/core/events';
import { fiscalReport } from '../../src/core/fiscal';
import { generatedProjectId } from '../../src/core/projectGen';
import {
  createInitialState,
  createTaskRun,
  type FiscalReport,
  type GameState,
  type ManagementRun,
  type ProjectRun,
} from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { achievementsView } from '../../src/view/fiscal';
import { growCompany } from '../helpers/growth';

const DAY = balance.time.minutesPerDay;
const company = (tier: GameState['tier'] = 'solo') =>
  createInitialState('achieve', { board: true, tutorial: false, talent: true, tier });

const STATE = { kind: 'state' } as const;

/** 納品した案件を持つ state。management は運営の記録、escaped は見逃した Task の数、days は納品までの営業日 */
function delivered(
  size: 'S' | 'M' | 'L' | 'XL',
  management: Partial<ManagementRun>,
  options: { escaped?: number; days?: number } = {},
): { state: GameState; projectId: string } {
  const projectId = generatedProjectId(`achieve-${size}`, size);
  const def = getProject(projectId);
  const tasks = Object.fromEntries(
    def.tasks.map((t, i) => [
      t.id,
      {
        ...createTaskRun(),
        status: 'done' as const,
        quality: 1,
        escaped: i < (options.escaped ?? 0),
        humanMinutes: 60,
      },
    ]),
  );
  const run: ProjectRun = {
    projectId,
    startedAt: 0,
    completedAt: (options.days ?? 1) * DAY,
    revenue: def.revenue,
    deadlineDays: def.deadlineDays,
    tasks,
    management: { minutes: 0, laborCost: 0, aiCost: 0, playerAssigned: 0, ...management },
  };
  return { state: { ...company(), projects: { [projectId]: run } }, projectId };
}

const report = (state: GameState, patch: Partial<FiscalReport>): FiscalReport => ({ ...fiscalReport(state), ...patch });

describe('実績の定義（content/achievements.ts）', () => {
  it('id は重ならず、どれにも名前と説明がある。条件の種類は判定できるものだけ', () => {
    const ids = achievementDefs.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of achievementDefs) {
      expect(ja.achievements.defs[d.id]?.name, d.id).toBeTruthy();
      expect(ja.achievements.defs[d.id]?.desc, d.id).toBeTruthy();
    }
    // 企画書の例「AI PM だけで XL 案件を納品」がデータで定義されている
    expect(achievementDefs.find((d) => d.id === 'aiPmXl')?.when).toEqual({
      type: 'delivery',
      size: 'XL',
      manager: 'ai',
    });
  });
});

describe('実績の判定（core/achievements.ts）', () => {
  it('案件を運営した人を、運営の記録から見分ける', () => {
    const m = (patch: Partial<ManagementRun>) => delivered('M', patch);
    const runOf = (x: ReturnType<typeof m>) => x.state.projects[x.projectId] as ProjectRun;
    expect(managedBy(runOf(m({})))).toBe('player');
    expect(managedBy(runOf(m({ aiCost: 100 })))).toBe('ai');
    expect(managedBy(runOf(m({ minutes: 30, laborCost: 100 })))).toBe('human');
    // プレイヤーが介入して担当を決めた案件は、管理者だけの納品に数えない
    expect(managedBy(runOf(m({ aiCost: 100, playerAssigned: 1 })))).toBeNull();
  });

  it('delivery：規模（以上）・運営した人・見逃しなしで納期内の条件をすべて満たす納品だけ', () => {
    const c: AchievementCondition = { type: 'delivery', size: 'XL', manager: 'ai' };
    const ai = delivered('XL', { aiCost: 100 });
    expect(achievementHolds(ai.state, c, { kind: 'delivery', projectId: ai.projectId })).toBe(true);
    expect(achievementHolds(ai.state, c, STATE)).toBe(false);
    const small = delivered('L', { aiCost: 100 });
    expect(achievementHolds(small.state, c, { kind: 'delivery', projectId: small.projectId })).toBe(false);
    const human = delivered('XL', { minutes: 30 });
    expect(achievementHolds(human.state, c, { kind: 'delivery', projectId: human.projectId })).toBe(false);
    const flawless: AchievementCondition = { type: 'delivery', size: 'L', flawless: true };
    const clean = delivered('XL', {});
    expect(achievementHolds(clean.state, flawless, { kind: 'delivery', projectId: clean.projectId })).toBe(true);
    const escaped = delivered('XL', {}, { escaped: 1 });
    expect(achievementHolds(escaped.state, flawless, { kind: 'delivery', projectId: escaped.projectId })).toBe(false);
    const late = delivered('XL', {}, { days: 99 });
    expect(achievementHolds(late.state, flawless, { kind: 'delivery', projectId: late.projectId })).toBe(false);
  });

  it('fiscal：決算の 利益 / 人日、または前期比の利益の伸びで判定する', () => {
    const s = company();
    const ppd: AchievementCondition = { type: 'fiscal', minProfitPerPersonDay: 300_000 };
    const growth: AchievementCondition = { type: 'fiscal', growth: 2 };
    const high = report(s, { profitPerPersonDay: 300_000 });
    expect(achievementHolds(s, ppd, { kind: 'fiscal', report: high, previous: null })).toBe(true);
    expect(
      achievementHolds(s, ppd, { kind: 'fiscal', report: report(s, { profitPerPersonDay: 299_999 }), previous: null }),
    ).toBe(false);
    const prev = report(s, { profit: 1_000_000 });
    expect(
      achievementHolds(s, growth, { kind: 'fiscal', report: report(s, { profit: 2_000_000 }), previous: prev }),
    ).toBe(true);
    expect(
      achievementHolds(s, growth, { kind: 'fiscal', report: report(s, { profit: 1_900_000 }), previous: prev }),
    ).toBe(false);
    // 前期が赤字なら伸びは数えない
    const loss = report(s, { profit: -1 });
    expect(achievementHolds(s, growth, { kind: 'fiscal', report: report(s, { profit: 5 }), previous: loss })).toBe(
      false,
    );
  });

  it('会社の state の条件：納品数・規模・格付け・評判・時価総額・Autonomy・Workflow・委任', () => {
    const s = company();
    const yes: [AchievementCondition, GameState][] = [
      [
        { type: 'delivered', count: 2 },
        { ...s, ledger: { ...s.ledger, delivered: 2 } },
      ],
      [
        { type: 'tier', tier: 'small' },
        { ...s, tier: 'mid' },
      ],
      [
        { type: 'rank', rank: 2 },
        { ...s, tier: 'large', rank: 2 },
      ],
      [
        { type: 'reputation', min: 100 },
        { ...s, reputation: 100 },
      ],
      [{ type: 'valuation', min: balance.funds.initial }, s],
      [
        { type: 'autonomy', minutes: 240 },
        { ...s, autonomy: { agent: { streak: 240, milestones: 0, intervals: 0, intervalTotal: 0, longest: 0 } } },
      ],
      [
        { type: 'library', count: 1 },
        { ...s, library: [{ id: 'w', name: 'w', mode: 'ai', modelId: 'standard', context: 'needed', parts: [] }] },
      ],
      [
        { type: 'delegated', count: 1 },
        { ...s, teams: [{ id: 't~2', no: 2, members: [], projects: [], manager: { kind: 'ai' }, intervened: false }] },
      ],
    ];
    for (const [c, state] of yes) {
      expect(achievementHolds(state, c, STATE), c.type).toBe(true);
      expect(achievementHolds(s, c, STATE), `${c.type}（初期状態）`).toBe(c.type === 'valuation');
    }
  });

  it('達成は1回だけ記録して AchievementUnlocked を出し、今の期の達成にも入る', () => {
    const s = { ...company('mid'), reputation: 100 };
    const events: GameEvent[] = [];
    const once = checkAchievements(s, STATE, (e) => events.push(e));
    expect(isAchieved(once, 'reputation')).toBe(true);
    expect(isAchieved(once, 'small')).toBe(true);
    expect(isAchieved(once, 'large')).toBe(false);
    expect(events).toContainEqual({ type: 'AchievementUnlocked', id: 'reputation' });
    expect(once.fiscal.achievements).toEqual(once.achievements.map((a) => a.id));
    const again: GameEvent[] = [];
    expect(checkAchievements(once, STATE, (e) => again.push(e))).toBe(once);
    expect(again).toEqual([]);
  });

  it('実際に会社を育てると、初納品と昇格の実績が達成順に記録され、一覧に出る', () => {
    const { state, events } = growCompany('achieve-grow', 30);
    const ids = state.achievements.map((a) => a.id);
    expect(ids).toContain('firstDelivery');
    expect(ids).toContain('startup');
    expect(ids.indexOf('firstDelivery')).toBeLessThan(ids.indexOf('startup'));
    expect(events.filter((e) => e.type === 'AchievementUnlocked').map((e) => (e as { id: string }).id)).toEqual(ids);
    const rows = achievementsView(state);
    expect(rows).toHaveLength(achievementDefs.length);
    expect(rows.find((r) => r.id === 'firstDelivery')?.at).not.toBeNull();
    expect(rows.find((r) => r.id === 'large')?.at).toBeNull();
  });
});
