import { achievementDefs } from '../content/achievements';
import { getProject } from '../content/index';
import type { AchievementCondition, AchievementDef, ProjectSize } from '../content/types';
import { tierAtLeast } from './companyEvents';
import { isDelivered } from './contract';
import type { GameEvent } from './events';
import { deadlineMinutes } from './formulas';
import { valuationOf } from './funds';
import { scoreProject } from './scoring';
import type { FiscalReport, GameState, ProjectRun } from './state';
import { isDelegated } from './teams';

/*
 * 実績（content/achievements.ts）。条件は宣言的なデータで、ここで判定して達成を state.achievements に記録する。
 * delivery の条件は納品のたびに、fiscal の条件は決算のたびに、ほかは営業日の始まり・納品・決算のときに判定する。
 */

const SIZES: readonly ProjectSize[] = ['S', 'M', 'L', 'XL'];

/** 判定のきっかけ。納品した案件か、締めた期の決算と前期の決算 */
export type AchievementTrigger =
  | { readonly kind: 'state' }
  | { readonly kind: 'delivery'; readonly projectId: string }
  | { readonly kind: 'fiscal'; readonly report: FiscalReport; readonly previous: FiscalReport | null };

export const isAchieved = (state: GameState, id: string) => state.achievements.some((a) => a.id === id);

/** 案件を運営した人。AI PM だけ・人間 PM だけ（プレイヤーが担当を決めていない）・管理者なし。混ざっていれば null */
export function managedBy(run: ProjectRun): 'ai' | 'human' | 'player' | null {
  const m = run.management;
  if (m.minutes === 0 && m.aiCost === 0) return 'player';
  if (m.playerAssigned > 0) return null;
  if (m.aiCost > 0 && m.minutes === 0) return 'ai';
  if (m.minutes > 0 && m.aiCost === 0) return 'human';
  return null;
}

/** 失敗を見逃さず、納期内に納品したか */
function flawless(run: ProjectRun): boolean {
  if (run.completedAt === null || !isDelivered(run) || run.burningAt !== null) return false;
  const onTime = run.completedAt - run.startedAt <= deadlineMinutes(run);
  return onTime && Object.values(run.tasks).every((t) => !t.escaped);
}

function holdsDelivery(state: GameState, c: Extract<AchievementCondition, { type: 'delivery' }>, projectId: string) {
  const run = state.projects[projectId];
  if (!run || !isDelivered(run)) return false;
  const size = getProject(projectId).brief?.size;
  if (c.size !== undefined && (size === undefined || SIZES.indexOf(size) < SIZES.indexOf(c.size))) return false;
  if (c.manager !== undefined && managedBy(run) !== c.manager) return false;
  if (c.flawless && !flawless(run)) return false;
  const ppd = scoreProject(state, projectId)?.profitPerPersonDay ?? 0;
  return c.minProfitPerPersonDay === undefined || ppd >= c.minProfitPerPersonDay;
}

/** 実績の条件を判定する（純粋関数） */
export function achievementHolds(state: GameState, c: AchievementCondition, trigger: AchievementTrigger): boolean {
  switch (c.type) {
    case 'delivery':
      return trigger.kind === 'delivery' && holdsDelivery(state, c, trigger.projectId);
    case 'fiscal': {
      if (trigger.kind !== 'fiscal') return false;
      const { report, previous } = trigger;
      const ppd = c.minProfitPerPersonDay !== undefined && report.profitPerPersonDay >= c.minProfitPerPersonDay;
      const growth =
        c.growth !== undefined &&
        previous !== null &&
        previous.profit > 0 &&
        report.profit >= previous.profit * c.growth;
      return ppd || growth;
    }
    case 'delivered':
      return state.ledger.delivered + Object.values(state.projects).filter(isDelivered).length >= c.count;
    case 'tier':
      return tierAtLeast(state, c.tier);
    case 'rank':
      return state.rank >= c.rank;
    case 'reputation':
      return state.reputation >= c.min;
    case 'valuation':
      return valuationOf(state) >= c.min;
    case 'autonomy':
      return Object.values(state.autonomy).some((a) => Math.max(a.longest, a.streak) >= c.minutes);
    case 'library':
      return state.library.length >= c.count;
    case 'delegated':
      return state.teams.filter((t) => isDelegated(state, t.id)).length >= c.count;
  }
}

/** まだ達成していない実績のうち、きっかけで判定する種類のもの */
function pending(state: GameState, trigger: AchievementTrigger): AchievementDef[] {
  const kinds: Readonly<Record<AchievementTrigger['kind'], (c: AchievementCondition) => boolean>> = {
    state: (c) => c.type !== 'delivery' && c.type !== 'fiscal',
    delivery: (c) => c.type !== 'fiscal',
    fiscal: (c) => c.type !== 'delivery',
  };
  return achievementDefs.filter((d) => !isAchieved(state, d.id) && kinds[trigger.kind](d.when));
}

/** 条件を満たした実績を記録し、AchievementUnlocked を出す。今の期の達成にも足す */
export function checkAchievements(
  state: GameState,
  trigger: AchievementTrigger,
  emit: (e: GameEvent) => void,
): GameState {
  const done = pending(state, trigger).filter((d) => achievementHolds(state, d.when, trigger));
  if (done.length === 0) return state;
  for (const d of done) emit({ type: 'AchievementUnlocked', id: d.id });
  const ids = done.map((d) => d.id);
  return {
    ...state,
    achievements: [...state.achievements, ...ids.map((id) => ({ id, at: state.clock }))],
    fiscal: { ...state.fiscal, achievements: [...state.fiscal.achievements, ...ids] },
  };
}
