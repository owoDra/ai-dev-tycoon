import { stageOfPhase } from '../content/assignModes';
import { balance } from '../content/balance';
import { getTask } from '../content/index';
import { contextApplies, updateSession } from './context';
import { aiCostFactor } from './contextWork';
import { aiCost } from './formulas';
import { type GameState, updateTask } from './state';
import type { System } from './system';
import { aiActor, finishStep, isAiWorking, startReadyTasks } from './taskFlow';
import { consumeUsage, usageSpeed } from './team';

/**
 * Task の進行。担当が決まった時点で依存が解決している Task を開始し、実行中の Task のリードタイムを数え、AI の工程（と修復）を進めて完了を判定する。
 * AI Worker は複数の Task を同時に処理できるが、そのぶん運用者の Seat の使用量を速く使い、上限を超えると遅くなる（core/team.ts）。
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
      if (!isAiWorking(run)) continue;
      const workerId = run.assignment?.workerId ?? '';
      // 運用者の Seat の使用量が上限に達していれば、進む量（と、それに比例する費用と使用量）が減る
      const progress = tick * usageSpeed(next, workerId);
      const model = aiActor(next, run, getTask(projectId, taskId)).model;
      let cost = aiCost(progress, model);
      let usage = progress * model.usagePerMinute;
      // Context が働く案件では、Context の使用率に応じて費用と使用量が増え、Session の履歴が溜まる
      if (contextApplies(projectId)) {
        const factor = aiCostFactor(next, workerId, projectId, taskId);
        cost *= factor;
        usage *= factor;
        next = updateSession(next, workerId, (s) => ({ ...s, age: s.age + tick }));
      }
      next = consumeUsage(next, workerId, usage);
      next = updateTask(next, projectId, taskId, (r) => ({
        ...r,
        remaining: r.remaining - progress,
        aiMinutes: r.aiMinutes + tick,
        aiCost: r.aiCost + cost,
      }));
      if (run.remaining - progress <= 0) next = finishStep(next, projectId, taskId, ctx);
    }
  }
  return next;
};

/**
 * ステップの最後に、このステップで依存が解決した Task を開始する。
 * 完了と同じ時刻に開始し（待ち時間なし）、進捗は次のステップから進む。
 * 完了を処理したシステムや担当者の並び順によって、開始直後に進む量が変わらないよう、最後にまとめて判定する。
 */
export const taskUnlockSystem: System = (state, ctx) => {
  let next: GameState = state;
  for (const [projectId, project] of Object.entries(state.projects)) {
    if (project.completedAt === null) next = startReadyTasks(next, projectId, ctx);
  }
  return next;
};
