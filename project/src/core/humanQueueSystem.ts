import { balance } from '../content/balance';
import { getHuman } from '../content/index';
import { dailyCost, laborCost } from './formulas';
import { type GameState, updateTask } from './state';
import type { System } from './system';
import { finishStep } from './taskFlow';

/**
 * 人間の待ち行列。人間1人は同時に1件しか処理できず、先頭の工程だけを進める。
 * 工程を終えたら待ち行列から外し、Task の次の工程へ進める。
 */
export const humanQueueSystem: System = (state, ctx) => {
  const tick = balance.time.tickMinutes;
  let next: GameState = state;
  for (const humanId of Object.keys(state.humanQueues)) {
    const head = next.humanQueues[humanId]?.[0];
    if (!head) continue;
    const { projectId, taskId } = head;
    const cost = laborCost(tick, dailyCost(getHuman(humanId)));
    next = updateTask(next, projectId, taskId, (r) => ({
      ...r,
      remaining: r.remaining - tick,
      humanMinutes: r.humanMinutes + tick,
      laborCost: r.laborCost + cost,
    }));
    if ((next.projects[projectId]?.tasks[taskId]?.remaining ?? 0) > 0) continue;
    next = { ...next, humanQueues: { ...next.humanQueues, [humanId]: (next.humanQueues[humanId] ?? []).slice(1) } };
    next = finishStep(next, projectId, taskId, ctx);
  }
  return next;
};
