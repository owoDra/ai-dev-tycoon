import { balance } from '../content/balance';
import { getProject } from '../content/index';
import { openInquiries } from '../core/board';
import { goalProgress, type PromotionProgress } from '../core/company';
import { cashOf, companyRunning } from '../core/funds';
import { maxProjects, runningProjects } from '../core/orders';
import type { GameState } from '../core/state';
import { unassignedProjects } from '../core/turn';

/*
 * 今日やること（Phase 39・41）。いまの会社で判断が要るものを大事な順に並べ、ホームに上から数件だけ出す。
 * 最後に「次の目標」（昇格の条件のうち一番遠いものと、それを伸ばす一手）を必ず1件置くので、迷ったらここを見ればよい
 */

/** 押したときの行き先 */
export type TodoTarget =
  | { readonly type: 'board' }
  | { readonly type: 'project'; readonly projectId: string }
  | { readonly type: 'company' }
  | { readonly type: 'nextDay' };

export type TodoItem =
  /** 資金がマイナス（倒産までの猶予） */
  | { readonly id: 'cash'; readonly daysLeft: number; readonly target: TodoTarget }
  /** 担当が決まっていない作業がある案件 */
  | { readonly id: 'assign'; readonly project: string; readonly target: TodoTarget }
  /** 納期が近い案件 */
  | { readonly id: 'deadline'; readonly project: string; readonly daysLeft: number; readonly target: TodoTarget }
  /** 空きがあり、引き合いが届いている */
  | { readonly id: 'order'; readonly count: number; readonly target: TodoTarget }
  /** 判断することがなく、日を進めればよい */
  | { readonly id: 'advance'; readonly target: TodoTarget }
  /** 次の目標（昇格の条件のうち、達成率の一番低いもの） */
  | {
      readonly id: 'goal';
      readonly tier: string;
      readonly need: 'profit' | 'reputation' | 'delivered';
      readonly now: number;
      readonly required: number;
      readonly target: TodoTarget;
    };

const DAY = balance.time.minutesPerDay;
/** 納期が近いとみなす残りの営業日 */
const NEAR_DEADLINE_DAYS = 1;

/** 昇格の条件のうち、達成率の一番低いもの（すべて満たしていれば null） */
function weakestRequirement(goal: PromotionProgress): 'profit' | 'reputation' | 'delivered' | null {
  const ids = (['delivered', 'reputation', 'profit'] as const).filter((id) => goal[id].now < goal[id].need);
  const ratio = (id: (typeof ids)[number]) => goal[id].now / Math.max(1, goal[id].need);
  return ids.reduce<(typeof ids)[number] | null>(
    (best, id) => (best === null || ratio(id) < ratio(best) ? id : best),
    null,
  );
}

/** 今日やること（大事な順）。会社が営業していなければ（チュートリアル中・単発のプレイ）空 */
export function todoList(state: GameState): TodoItem[] {
  if (!companyRunning(state)) return [];
  const items: TodoItem[] = [];
  if (cashOf(state) < 0) {
    items.push({
      id: 'cash',
      daysLeft: Math.max(0, balance.funds.graceDays - state.funds.shortDays),
      target: { type: 'company' },
    });
  }
  for (const projectId of unassignedProjects(state)) {
    items.push({ id: 'assign', project: getProject(projectId).name, target: { type: 'project', projectId } });
  }
  for (const run of Object.values(state.projects)) {
    if (run.completedAt !== null) continue;
    const daysLeft = Math.ceil((run.startedAt + run.deadlineDays * DAY - state.clock) / DAY);
    if (daysLeft <= NEAR_DEADLINE_DAYS) {
      items.push({
        id: 'deadline',
        project: getProject(run.projectId).name,
        daysLeft: Math.max(0, daysLeft),
        target: { type: 'project', projectId: run.projectId },
      });
    }
  }
  const inquiries = openInquiries(state).length;
  if (inquiries > 0 && runningProjects(state) < maxProjects(state)) {
    items.push({ id: 'order', count: inquiries, target: { type: 'board' } });
  }
  if (items.length === 0) items.push({ id: 'advance', target: { type: 'nextDay' } });
  const goal = goalProgress(state);
  const need = weakestRequirement(goal);
  if (need) {
    items.push({
      id: 'goal',
      tier: goal.tier.name,
      need,
      now: goal[need].now,
      required: goal[need].need,
      target: { type: 'company' },
    });
  }
  return items;
}
