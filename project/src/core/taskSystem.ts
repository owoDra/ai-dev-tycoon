import { stageOfPhase } from '../content/assignModes';
import { balance } from '../content/balance';
import { getTask } from '../content/index';
import { humansAtWork } from './clock';
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
 * 人間の工程は humanQueueSystem が進める。AI は人間が帰った後も手元の工程を進めるが、次の工程が人間の指示出しや確認なら翌朝まで待つ
 * （Agent Workflow で指示出しを省ける Task と、AI PM が担当を決める案件だけが夜も続けて進む）。
 */
export const taskSystem: System = (state, ctx) => {
  const tick = balance.time.tickMinutes;
  const atWork = humansAtWork(state.clock);
  let next: GameState = state;
  for (const [projectId, project] of Object.entries(state.projects)) {
    if (project.completedAt !== null) continue;
    next = startReadyTasks(next, projectId, ctx);
    for (const taskId of Object.keys(project.tasks)) {
      const run = next.projects[projectId]?.tasks[taskId];
      if (run?.status !== 'running' || !run.phase) continue;
      const ai = isAiWorking(run);
      // リードタイムは、人間が働いている時間と AI が手を動かしている時間だけ数える（夜に人間を待つ時間は数えない）
      if (ai || atWork) {
        const stage = stageOfPhase[run.phase];
        next = updateTask(next, projectId, taskId, (r) => ({
          ...r,
          lead: { ...r.lead, [stage]: r.lead[stage] + tick },
        }));
      }
      if (!ai) continue;
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
