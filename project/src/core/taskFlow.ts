import { getAssignMode } from '../content/assignModes';
import { getAiWorker, getHuman, getModel, getProject, getTask, humans } from '../content/index';
import type { ModeStep } from '../content/types';
import {
  type ActorProfile,
  escapedQuality,
  repairMinutes,
  reworkMinutes,
  stepMinutes,
  successProbability,
} from './formulas';
import { type GameState, type TaskRun, updateTask } from './state';
import type { SystemContext } from './system';
import { forcedAiOutcome } from './tutorial';

/*
 * Task の工程を進める共通処理。taskSystem（開始・AI の工程）と humanQueueSystem（人間の工程）から呼ぶ。
 */

function runOf(state: GameState, projectId: string, taskId: string): TaskRun {
  const run = state.projects[projectId]?.tasks[taskId];
  if (!run) throw new Error(`開始していない Task: ${projectId}/${taskId}`);
  return run;
}

/** 現在の工程の定義。手戻り・修復の最中や、実行中でなければ null */
export function currentStep(run: TaskRun): ModeStep | null {
  if (!run.assignment || run.status !== 'running' || run.phase === 'rework' || run.phase === 'repair') return null;
  return getAssignMode(run.assignment.mode).steps[run.stepIndex] ?? null;
}

/** AI が手を動かしているか（AI の工程か、自動テストで見つかった失敗の修復中） */
export function isAiWorking(run: TaskRun): boolean {
  return run.status === 'running' && (run.phase === 'repair' || currentStep(run)?.actor === 'ai');
}

/** AI の工程を担う Model */
export function aiActor(run: TaskRun): ActorProfile & { readonly kind: 'ai' } {
  if (!run.assignment) throw new Error('担当が決まっていない Task');
  return { kind: 'ai', model: getModel(getAiWorker(run.assignment.workerId).modelId) };
}

/** 人間の工程を誰に任せるか。人間だけのモードなら指名された人、それ以外は待ち行列の残り時間が最も短い人 */
function chooseHuman(state: GameState, run: TaskRun): string {
  const assigned = run.assignment?.workerId;
  if (assigned && humans.some((h) => h.id === assigned)) return assigned;
  let best = humans[0]?.id ?? '';
  let bestLoad = Number.POSITIVE_INFINITY;
  for (const h of humans) {
    const load = (state.humanQueues[h.id] ?? []).reduce(
      (sum, q) => sum + (state.projects[q.projectId]?.tasks[q.taskId]?.remaining ?? 0),
      0,
    );
    if (load < bestLoad) {
      best = h.id;
      bestLoad = load;
    }
  }
  return best;
}

function enqueue(state: GameState, humanId: string, projectId: string, taskId: string, front: boolean): GameState {
  const item = { projectId, taskId, queuedAt: state.clock };
  const queue = state.humanQueues[humanId] ?? [];
  return { ...state, humanQueues: { ...state.humanQueues, [humanId]: front ? [item, ...queue] : [...queue, item] } };
}

/** 依存 Task がすべて連鎖するモード（Agent Workflow）で処理されたか */
function isChained(state: GameState, projectId: string, taskId: string): boolean {
  const deps = getTask(projectId, taskId).deps;
  const tasks = state.projects[projectId]?.tasks;
  return (
    deps.length > 0 &&
    deps.every((d) => {
      const mode = tasks?.[d]?.assignment?.mode;
      return mode !== undefined && getAssignMode(mode).chains;
    })
  );
}

/** stepIndex 番目以降で最初に処理する工程へ入る。工程が残っていなければ Task を完了する */
export function enterStep(
  state: GameState,
  projectId: string,
  taskId: string,
  stepIndex: number,
  ctx: SystemContext,
): GameState {
  const run = runOf(state, projectId, taskId);
  if (!run.assignment) return state;
  const steps = getAssignMode(run.assignment.mode).steps;
  let i = stepIndex;
  while (steps[i]?.skipWhenChained && isChained(state, projectId, taskId)) i++;
  const step = steps[i];
  if (!step) return completeTask(state, projectId, taskId, ctx);

  const task = getTask(projectId, taskId);
  if (step.actor === 'ai') {
    const remaining = stepMinutes(task, step, aiActor(run));
    return updateTask(state, projectId, taskId, (r) => ({ ...r, stepIndex: i, phase: step.phase, remaining }));
  }
  const humanId = chooseHuman(state, run);
  const remaining = stepMinutes(task, step, { kind: 'human', skill: getHuman(humanId).skill });
  const next = updateTask(state, projectId, taskId, (r) => ({
    ...r,
    stepIndex: i,
    phase: step.phase,
    remaining,
    humanId,
  }));
  return enqueue(next, humanId, projectId, taskId, false);
}

/**
 * 現在の工程を終えたときの処理。
 * 作業は成功確率で判定し、失敗は defect として隠れたまま次へ進む（チュートリアルでは AI の作業の成否をシナリオで決める）。
 * 人間のレビューは隠れた失敗を発見し、同じ人がすぐに手戻りする（人間の時間を消費）。
 * AI の自動テストは隠れた失敗を発見し、AI がそのまま修復する（人間の時間を使わない）。
 */
export function finishStep(state: GameState, projectId: string, taskId: string, ctx: SystemContext): GameState {
  const run = runOf(state, projectId, taskId);
  if (run.phase === 'rework' || run.phase === 'repair') {
    return enterStep(state, projectId, taskId, run.stepIndex + 1, ctx);
  }
  const step = currentStep(run);
  if (!step) return state;

  if (step.phase === 'review' && run.defect && step.actor === 'ai') {
    ctx.emit({ type: 'EvalCaught', projectId, taskId });
    const remaining = repairMinutes(getTask(projectId, taskId), aiActor(run).model);
    return updateTask(state, projectId, taskId, (r) => ({
      ...r,
      phase: 'repair',
      remaining,
      defect: false,
      reworks: r.reworks + 1,
    }));
  }

  if (step.phase === 'review' && run.defect && run.humanId) {
    const humanId = run.humanId;
    ctx.emit({ type: 'ReworkDetected', projectId, taskId, humanId });
    const remaining = reworkMinutes(getTask(projectId, taskId), getHuman(humanId).skill);
    const next = updateTask(state, projectId, taskId, (r) => ({
      ...r,
      phase: 'rework',
      remaining,
      defect: false,
      reworks: r.reworks + 1,
    }));
    return enqueue(next, humanId, projectId, taskId, true);
  }

  let next = state;
  if (step.phase === 'work') {
    const actor: ActorProfile =
      step.actor === 'ai' ? aiActor(run) : { kind: 'human', skill: getHuman(run.humanId ?? '').skill };
    const forced = step.actor === 'ai' ? forcedAiOutcome(state, projectId, taskId) : null;
    const ok = forced === null ? ctx.rng.chance(successProbability(getTask(projectId, taskId), actor)) : forced;
    if (!ok) {
      ctx.emit({ type: 'TaskFailed', projectId, taskId });
      next = updateTask(next, projectId, taskId, (r) => ({ ...r, defect: true, failures: r.failures + 1 }));
    }
  }
  return enterStep(next, projectId, taskId, run.stepIndex + 1, ctx);
}

function completeTask(state: GameState, projectId: string, taskId: string, ctx: SystemContext): GameState {
  const run = runOf(state, projectId, taskId);
  const quality = run.defect ? escapedQuality(getTask(projectId, taskId)) : 1;
  let next = updateTask(state, projectId, taskId, (r) => ({
    ...r,
    status: 'done',
    phase: null,
    remaining: 0,
    humanId: null,
    escaped: r.defect,
    defect: false,
    quality,
    completedAt: state.clock,
  }));
  ctx.emit({ type: 'TaskCompleted', projectId, taskId, quality });

  const project = next.projects[projectId];
  if (project && Object.values(project.tasks).every((t) => t.status === 'done')) {
    next = { ...next, projects: { ...next.projects, [projectId]: { ...project, completedAt: state.clock } } };
    ctx.emit({ type: 'ProjectCompleted', projectId });
  }
  return next;
}

/** 担当が決まり、依存がすべて完了した Task を開始する */
export function startReadyTasks(state: GameState, projectId: string, ctx: SystemContext): GameState {
  let next = state;
  for (const task of getProject(projectId).tasks) {
    const tasks = next.projects[projectId]?.tasks;
    const run = tasks?.[task.id];
    if (!run?.assignment || run.status !== 'waiting') continue;
    if (!task.deps.every((d) => tasks?.[d]?.status === 'done')) continue;
    next = updateTask(next, projectId, task.id, (r) => ({ ...r, status: 'running', startedAt: next.clock }));
    ctx.emit({ type: 'TaskStarted', projectId, taskId: task.id, mode: run.assignment.mode });
    next = enterStep(next, projectId, task.id, 0, ctx);
  }
  return next;
}
