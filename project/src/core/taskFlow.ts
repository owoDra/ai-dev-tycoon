import { getAssignMode, primaryActor } from '../content/assignModes';
import { balance } from '../content/balance';
import { getAiWorker, getHuman, getProject, getTask, humans } from '../content/index';
import type { HarnessModifiers, ModeStep, TaskDef } from '../content/types';
import { contextApplies, fedDocs, getSession, projectNeededDocs, readContext, updateSession } from './context';
import { aiSuccessWithContext, aiWorkTime } from './contextWork';
import {
  type ActorProfile,
  escapedQuality,
  isIntervention,
  repairMinutes,
  reworkMinutes,
  stepMinutes,
  successProbability,
} from './formulas';
import { evalMinutes, harnessModel, harnessModifiers, harnessSuccess, harnessToolMiss, requestParts } from './harness';
import { rollIncidents } from './incidents';
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

/** モードの工程の外にいる最中（手戻り・修復・Eval の検証と修復） */
const OFF_STEP: ReadonlySet<TaskRun['phase']> = new Set(['rework', 'repair', 'eval', 'evalRepair']);
/** AI が手を動かす、モードの工程の外の工程 */
const AI_OFF_STEP: ReadonlySet<TaskRun['phase']> = new Set(['repair', 'eval', 'evalRepair']);

/** 現在の工程の定義。手戻り・修復・Eval の最中や、実行中でなければ null */
export function currentStep(run: TaskRun): ModeStep | null {
  if (!run.assignment || run.status !== 'running' || OFF_STEP.has(run.phase)) return null;
  return getAssignMode(run.assignment.mode).steps[run.stepIndex] ?? null;
}

/** AI が手を動かしているか（AI の工程か、自動テスト・Eval で見つかった失敗の修復中、Eval の検証中） */
export function isAiWorking(run: TaskRun): boolean {
  return run.status === 'running' && (AI_OFF_STEP.has(run.phase) || currentStep(run)?.actor === 'ai');
}

/** 今回の作業での Harness の補正（守られなかったお願いを除く）。担い手が人間なら補正なし */
export function runModifiers(state: GameState, run: TaskRun, task: TaskDef): HarnessModifiers {
  return harnessModifiers(state, run.assignment?.workerId ?? '', task, { skipped: run.skipped });
}

/** AI の工程を担う Model。AI Worker の Harness の Model に、部品の速度・費用の補正とランニングコストを入れる */
export function aiActor(state: GameState, run: TaskRun, task: TaskDef): ActorProfile & { readonly kind: 'ai' } {
  if (!run.assignment) throw new Error('担当が決まっていない Task');
  const workerId = getAiWorker(run.assignment.workerId).id;
  return { kind: 'ai', model: harnessModel(state, workerId, runModifiers(state, run, task)) };
}

/**
 * AI の作業の成功確率。Model の能力に、Context（資料のある案件）と Harness の補正を入れる。
 */
function aiSuccess(state: GameState, run: TaskRun, projectId: string, task: TaskDef): number {
  let p = successProbability(task, aiActor(state, run, task));
  if (contextApplies(projectId)) p = aiSuccessWithContext(state, run.assignment?.workerId ?? '', projectId, task.id, p);
  return harnessSuccess(p, runModifiers(state, run, task));
}

/** 今回の作業で、お願いの部品が守られるかを確率で決める（企画書14章）。お願いがなければ乱数を引かない */
function rollRequests(
  state: GameState,
  projectId: string,
  taskId: string,
  task: TaskDef,
  ctx: SystemContext,
): GameState {
  const run = runOf(state, projectId, taskId);
  const requests = requestParts(state, run.assignment?.workerId ?? '', task);
  const skipped = requests.filter(() => !ctx.rng.chance(balance.harness.requestCompliance)).map((p) => p.id);
  if (skipped.length === 0 && run.skipped.length === 0) return state;
  return updateTask(state, projectId, taskId, (r) => ({ ...r, skipped }));
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
    let next = step.phase === 'work' ? rollRequests(state, projectId, taskId, task, ctx) : state;
    const current = runOf(next, projectId, taskId);
    let remaining = stepMinutes(task, step, aiActor(next, current, task));
    if (step.phase === 'work') {
      if (contextApplies(projectId)) next = rollIncidents(next, run.assignment.workerId, projectId, taskId, ctx);
      remaining = contextWorkMinutes(next, current, projectId, task, remaining, ctx);
    }
    return updateTask(next, projectId, taskId, (r) => ({ ...r, stepIndex: i, phase: step.phase, remaining }));
  }
  const humanId = chooseHuman(state, run);
  let remaining = stepMinutes(task, step, { kind: 'human', skill: getHuman(humanId).skill });
  // AI が関わる Task の指示出しと確認は、人間の介入。Harness の補正で軽くなる（重くもなる）
  const intervention = isIntervention(step) && usesAi(run);
  if (intervention) remaining *= harnessModifiers(state, run.assignment.workerId, task).humanTime;
  const next = updateTask(state, projectId, taskId, (r) => ({
    ...r,
    stepIndex: i,
    phase: step.phase,
    remaining,
    humanId,
    interventions: r.interventions + (intervention ? 1 : 0),
  }));
  return enqueue(next, humanId, projectId, taskId, false);
}

const usesAi = (run: TaskRun) => run.assignment !== null && primaryActor(getAssignMode(run.assignment.mode)) === 'ai';

/**
 * AI の作業の所要時間を、Context（資料のある案件。core/contextWork.ts）と Harness の Noise に応じて延ばす。
 * Tool の誤選択はここで確率で決める（どちらも働かなければ乱数を引かない）。
 */
function contextWorkMinutes(
  state: GameState,
  run: TaskRun,
  projectId: string,
  task: TaskDef,
  minutes: number,
  ctx: SystemContext,
): number {
  const model = aiActor(state, run, task).model;
  const time = aiWorkTime(state, run.assignment?.workerId ?? '', projectId, task, model);
  const harnessMiss = harnessToolMiss(runModifiers(state, run, task));
  if (!contextApplies(projectId) && harnessMiss === 0) return minutes;
  const chance = harnessMiss === 0 ? time.toolMissChance : 1 - (1 - time.toolMissChance) * (1 - harnessMiss);
  const toolMiss = ctx.rng.chance(chance) ? 1 + balance.context.toolMissExtra : 1;
  return minutes * toolMiss * time.factor + time.extraMinutes;
}

/**
 * Context が働く案件で AI の作業を終えたときの記録。Reset で失った項目の影響を1回分減らし、
 * 余計な資料なしで必要な資料がそろっていれば「必要な資料だけで作業した」と数える。
 */
function afterContextWork(state: GameState, run: TaskRun, projectId: string, taskId: string): GameState {
  const workerId = run.assignment?.workerId ?? '';
  const session = getSession(state, workerId);
  const reading = readContext(session, projectId, taskId);
  const needed = projectNeededDocs(projectId);
  const routed = reading.coverage >= 1 && fedDocs(session.feed, projectId, taskId).every((d) => needed.includes(d));
  const next = updateSession(state, workerId, (s) => ({ ...s, recover: Math.max(0, s.recover - 1) }));
  if (!routed) return next;
  return { ...next, contextStats: { ...next.contextStats, routedWorks: next.contextStats.routedWorks + 1 } };
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
  if (run.phase === 'eval') return finishEval(state, projectId, taskId, ctx);
  if (run.phase === 'evalRepair') return finishEvalRepair(state, projectId, taskId, ctx);
  const step = currentStep(run);
  if (!step) return state;

  if (step.phase === 'review' && run.defect && step.actor === 'ai') {
    ctx.emit({ type: 'EvalCaught', projectId, taskId });
    const task = getTask(projectId, taskId);
    const remaining = repairMinutes(task, aiActor(state, run, task).model);
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
    const intervention = usesAi(run) ? 1 : 0;
    const remaining = reworkMinutes(getTask(projectId, taskId), getHuman(humanId).skill);
    const next = updateTask(state, projectId, taskId, (r) => ({
      ...r,
      phase: 'rework',
      remaining,
      defect: false,
      reworks: r.reworks + 1,
      interventions: r.interventions + intervention,
    }));
    return enqueue(next, humanId, projectId, taskId, true);
  }

  let next = state;
  if (step.phase === 'work') {
    const task = getTask(projectId, taskId);
    const ai = step.actor === 'ai';
    const forced = ai ? forcedAiOutcome(state, projectId, taskId) : null;
    const p = ai
      ? aiSuccess(state, run, projectId, task)
      : successProbability(task, { kind: 'human', skill: getHuman(run.humanId ?? '').skill });
    const ok = forced === null ? ctx.rng.chance(p) : forced;
    if (ai && contextApplies(projectId)) next = afterContextWork(next, run, projectId, taskId);
    if (!ok) {
      ctx.emit({ type: 'TaskFailed', projectId, taskId });
      next = updateTask(next, projectId, taskId, (r) => ({ ...r, defect: true, failures: r.failures + 1 }));
    }
    if (ai) {
      next = rollAccident(next, run, projectId, task, ctx);
      // Eval の部品があれば、次の工程へ進む前に自動で検証する（Generate → Eval）
      if (runModifiers(state, run, task).evalCatch > 0) return enterEval(next, projectId, taskId, 0);
    }
  }
  return enterStep(next, projectId, taskId, run.stepIndex + 1, ctx);
}

/** 事故（権限・Tool の誤用）を確率で起こす。起きたら作業は失敗扱いになり、損害はスコアで数える */
function rollAccident(state: GameState, run: TaskRun, projectId: string, task: TaskDef, ctx: SystemContext): GameState {
  const risk = runModifiers(state, run, task).risk;
  if (risk <= 0 || !ctx.rng.chance(risk)) return state;
  ctx.emit({ type: 'HarnessAccident', projectId, taskId: task.id, workerId: run.assignment?.workerId ?? '' });
  return updateTask(state, projectId, task.id, (r) => ({
    ...r,
    defect: true,
    failures: r.failures + (r.defect ? 0 : 1),
    accidents: r.accidents + 1,
  }));
}

/** Eval の検証に入る（loops はここまでの修復の回数） */
function enterEval(state: GameState, projectId: string, taskId: string, loops: number): GameState {
  const run = runOf(state, projectId, taskId);
  const task = getTask(projectId, taskId);
  const remaining = evalMinutes(task, aiActor(state, run, task).model);
  return updateTask(state, projectId, taskId, (r) => ({ ...r, phase: 'eval', remaining, evalLoops: loops }));
}

/** 検証を終えた。失敗を見つけたら AI が修復し（FAIL → Repair）、見つからなければ次の工程へ進む */
function finishEval(state: GameState, projectId: string, taskId: string, ctx: SystemContext): GameState {
  const run = runOf(state, projectId, taskId);
  const task = getTask(projectId, taskId);
  const catchRate = runModifiers(state, run, task).evalCatch;
  if (!run.defect || !ctx.rng.chance(catchRate)) return enterStep(state, projectId, taskId, run.stepIndex + 1, ctx);
  ctx.emit({ type: 'EvalCaught', projectId, taskId });
  const remaining = repairMinutes(task, aiActor(state, run, task).model);
  return updateTask(state, projectId, taskId, (r) => ({
    ...r,
    phase: 'evalRepair',
    remaining,
    defect: false,
    reworks: r.reworks + 1,
  }));
}

/** 修復を終えた。修復も失敗しうるので、上限まではもう一度検証する（Repair → Eval） */
function finishEvalRepair(state: GameState, projectId: string, taskId: string, ctx: SystemContext): GameState {
  const run = runOf(state, projectId, taskId);
  const task = getTask(projectId, taskId);
  const ok = ctx.rng.chance(aiSuccess(state, run, projectId, task));
  const next = ok ? state : updateTask(state, projectId, taskId, (r) => ({ ...r, defect: true }));
  const loops = run.evalLoops + 1;
  if (loops >= balance.harness.maxRepairLoops) return enterStep(next, projectId, taskId, run.stepIndex + 1, ctx);
  return enterEval(next, projectId, taskId, loops);
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
