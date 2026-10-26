import { stageOfPhase } from '../content/assignModes';
import { balance } from '../content/balance';
import { aiCost } from './formulas';
import { type GameState, updateTask } from './state';
import type { System } from './system';
import { aiActor, currentStep, finishStep, startReadyTasks } from './taskFlow';

/**
 * Task の進行。依存が解決した Task を開始し、実行中の Task のリードタイムを数え、AI の工程を進めて完了を判定する。
 * AI Worker は複数の Task を同時に処理できる（同時実行数の制限は Phase 13 の Seat で入れる）。
 * 人間の工程は humanQueueSystem が進める。
 */
export const taskSystem: System = (state, ctx) => {
  const tick = balance.time.tickMinutes;
  let next: GameState = state;
  for (const [projectId, project] of Object.entries(state.projects)) {
    if (project.completedAt !== null) continue;
    next = startReadyTasks(next, projectId, ctx);
    for (const taskId of Object.keys(project.tasks)) {
      const run = next.projects[projectId]?.tasks[taskId];
      if (run?.status !== 'running' || !run.phase) continue;
      const stage = stageOfPhase[run.phase];
      next = updateTask(next, projectId, taskId, (r) => ({ ...r, lead: { ...r.lead, [stage]: r.lead[stage] + tick } }));
      if (currentStep(run)?.actor !== 'ai') continue;
      const cost = aiCost(tick, aiActor(run).model);
      next = updateTask(next, projectId, taskId, (r) => ({
        ...r,
        remaining: r.remaining - tick,
        aiMinutes: r.aiMinutes + tick,
        aiCost: r.aiCost + cost,
      }));
      if (run.remaining - tick <= 0) next = finishStep(next, projectId, taskId, ctx);
    }
  }
  return next;
};
