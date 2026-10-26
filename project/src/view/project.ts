import { getAssignMode, primaryActor, stageOfPhase } from '../content/assignModes';
import { campaign } from '../content/campaign';
import { content, findWorker, getProject } from '../content/index';
import type { AssignModeId, Stage } from '../content/types';
import { findBottleneck } from '../core/bottleneck';
import type { GameState } from '../core/state';
import { currentStep } from '../core/taskFlow';
import { ja } from '../i18n/ja';

export type TaskStatusView = keyof typeof ja.project.status;

export interface TaskRowView {
  readonly id: string;
  readonly name: string;
  readonly status: TaskStatusView;
  readonly mode: AssignModeId | null;
  readonly workerId: string | null;
  /** 担当を変更できるか（開始前だけ） */
  readonly editable: boolean;
  /** 実行中なら現在の工程の集計単位 */
  readonly stage: Stage | null;
}

/** 案件の Task 一覧の表示用データ。未開始なら空配列 */
export function taskRows(state: GameState, projectId: string): TaskRowView[] {
  const run = state.projects[projectId];
  if (!run) return [];
  return getProject(projectId).tasks.map((task) => {
    const t = run.tasks[task.id];
    const onHuman = t?.status === 'running' && (t.phase === 'rework' || currentStep(t)?.actor === 'human');
    const head = t?.humanId ? state.humanQueues[t.humanId]?.[0] : undefined;
    const queued = onHuman && !(head?.projectId === projectId && head.taskId === task.id);
    return {
      id: task.id,
      name: task.name,
      status: statusOf(t?.status, t?.assignment !== null, queued, t?.escaped ?? false),
      mode: t?.assignment?.mode ?? null,
      workerId: t?.assignment?.workerId ?? null,
      editable: t?.status === 'waiting',
      stage: t?.status === 'running' && t.phase ? stageOfPhase[t.phase] : null,
    };
  });
}

function statusOf(status: string | undefined, assigned: boolean, queued: boolean, escaped: boolean): TaskStatusView {
  if (status === 'done') return escaped ? 'defect' : 'done';
  if (status === 'running') return queued ? 'queued' : 'running';
  return assigned ? 'waiting' : 'unassigned';
}

/** モードを選んだときに既定で指名する Worker（モードの主な担い手の種類で最初の人） */
export function defaultWorkerFor(mode: AssignModeId): string {
  const kind = primaryActor(getAssignMode(mode));
  return content.workers.find((w) => w.kind === kind)?.id ?? '';
}

/** モードに合う Worker の候補。人間は会社にいる社員（team。既定はキャンペーンの最初の社員）だけ */
export function workerOptions(
  mode: AssignModeId,
  team: readonly string[] = campaign.team,
): { id: string; name: string }[] {
  const kind = primaryActor(getAssignMode(mode));
  return content.workers
    .filter((w) => w.kind === kind && (w.kind === 'ai' || team.includes(w.id)))
    .map((w) => ({ id: w.id, name: w.name }));
}

/** 現在のボトルネックの表示名。なければ null */
export function bottleneckLabel(state: GameState): string | null {
  const b = findBottleneck(state);
  if (!b) return null;
  if (b.ref.kind === 'human') return ja.score.human(findWorker(b.ref.humanId)?.name ?? b.ref.humanId);
  const { projectId, taskId, stage } = b.ref;
  const task = getProject(projectId).tasks.find((t) => t.id === taskId);
  return ja.score.stage(task?.name ?? taskId, ja.stages[stage]);
}

/**
 * 「ここから先を Workflow にまとめる」で一続きに任せる Task（企画書5章）。選んだ Task と、それに（間接的にでも）依存する Task のうち、
 * まだ始まっていないもの。選んだ Task が始まっていたら空
 */
export function workflowTasks(state: GameState, projectId: string, taskId: string): string[] {
  const tasks = getProject(projectId).tasks;
  const run = state.projects[projectId];
  if (run?.tasks[taskId]?.status !== 'waiting') return [];
  const picked = new Set([taskId]);
  for (const t of tasks) {
    if (t.deps.some((d) => picked.has(d)) && run.tasks[t.id]?.status === 'waiting') picked.add(t.id);
  }
  return tasks.filter((t) => picked.has(t.id)).map((t) => t.id);
}
