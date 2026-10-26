import type { IconName } from '../assets/icons';
import { stageOfPhase } from '../content/assignModes';
import { findWorker, getProject } from '../content/index';
import { defaultWorldLookId, type WorldBottleneckLook, worldLooks } from '../content/look/world';
import type { Stage } from '../content/types';
import type { GameState, TaskRun } from '../core/state';
import { currentStep } from '../core/taskFlow';
import { ja } from '../i18n/ja';
import { type TaskRowView, type TaskStatusView, taskRows } from './project';
import { type EntityId, humanActorId, islandId } from './world';

const t = ja.advice;

/** 「次に対応すべき問題」の1件。問題 → 原因 → 次の行動 の3段で見せる */
export interface Advice {
  /** 同じ問題が続いている間は同じ値（「あとで」で閉じた記録に使う） */
  readonly id: string;
  readonly kind: 'bottleneck' | 'unassigned';
  readonly severity: 'danger' | 'warning';
  readonly icon: IconName;
  /** 問題のある島やキャラクター。ボタンを押すとここを選んでカメラを寄せる */
  readonly entityId: EntityId;
  readonly problem: string;
  readonly cause: string;
  readonly action: string;
}

type Candidate = { readonly advice: Advice; readonly minutes: number };

/**
 * 案件の問題を重要な順に並べる（純粋関数）。
 * 1. ボトルネック：まだ終わっていない Task の工程のリードタイムと、人間の待ち行列の待ち時間のうち最大のもの。
 *    ワールドで赤いリングを出すのと同じ強さ（look.threshold × look.fullMinutes 分）以上のときだけ出す。
 *    終わった Task のリードタイムは、もう打つ手がないので対象にしない
 * 2. 担当が決まっていない Task。前の Task が終わってすぐ始められるもの（止まっている）を先にする
 */
export function adviseProblems(
  state: GameState,
  projectId: string,
  look: Pick<WorldBottleneckLook, 'threshold' | 'fullMinutes'> = worldLooks[defaultWorldLookId].bottleneck,
): Advice[] {
  const run = state.projects[projectId];
  if (!run || run.completedAt !== null) return [];
  const rows = taskRows(state, projectId);
  const out: Advice[] = [];

  const bottleneck = worstBottleneck(state, projectId, rows);
  if (bottleneck && bottleneck.minutes >= look.threshold * look.fullMinutes) out.push(bottleneck.advice);

  const def = getProject(projectId);
  const finished = new Set(rows.filter((r) => r.status === 'done' || r.status === 'defect').map((r) => r.id));
  const unassigned = rows
    .filter((r) => r.status === 'unassigned')
    .map((row) => ({ row, ready: (def.tasks.find((d) => d.id === row.id)?.deps ?? []).every((d) => finished.has(d)) }))
    .sort((a, b) => Number(b.ready) - Number(a.ready));
  for (const { row, ready } of unassigned) {
    out.push({
      id: `unassigned:${row.id}`,
      kind: 'unassigned',
      severity: ready ? 'danger' : 'warning',
      icon: 'warning',
      entityId: islandId(row.id),
      problem: t.unassigned(row.name),
      cause: ready ? t.unassignedReady : t.unassignedLater,
      action: t.unassignedAction,
    });
  }
  return out;
}

/** 最も重要な問題を1つ。なければ null */
export function nextAdvice(state: GameState, projectId: string): Advice | null {
  return adviseProblems(state, projectId)[0] ?? null;
}

function worstBottleneck(state: GameState, projectId: string, rows: readonly TaskRowView[]): Candidate | null {
  const run = state.projects[projectId];
  if (!run) return null;
  let best: Candidate | null = null;
  const consider = (c: Candidate) => {
    if (c.minutes > 0 && (!best || c.minutes > best.minutes)) best = c;
  };

  for (const row of rows) {
    const task = run.tasks[row.id];
    if (!task || task.status === 'done') continue;
    for (const stage of ['work', 'review'] as const) {
      consider({ minutes: task.lead[stage], advice: stageAdvice(row.id, row.name, stage, row.status, task) });
    }
  }
  for (const [humanId, queue] of Object.entries(state.humanQueues)) {
    const waiting = queue.slice(1).filter((q) => q.projectId === projectId);
    const minutes = waiting.reduce((sum, q) => sum + (state.clock - q.queuedAt), 0);
    const name = findWorker(humanId)?.name ?? humanId;
    consider({
      minutes,
      advice: {
        id: `bottleneck:human:${humanId}`,
        kind: 'bottleneck',
        severity: 'danger',
        icon: 'bottleneck',
        entityId: humanActorId(humanId),
        problem: t.humanBottleneck(name),
        cause: t.humanBottleneckCause,
        action: t.humanBottleneckAction,
      },
    });
  }
  return best;
}

function stageAdvice(taskId: string, name: string, stage: Stage, status: TaskStatusView, task: TaskRun): Advice {
  const step = currentStep(task);
  const now = task.phase ? stageOfPhase[task.phase] : null;
  // 原因：いま人間の手が空くのを待っているか、人間が手作業しているか、レビュー（と手戻り）が重いか
  let cause: string = t.workCause;
  let action: string = t.workAction;
  if (status === 'queued') {
    cause = t.queuedCause;
    action = t.queuedAction;
  } else if (stage === 'review') {
    cause = t.reviewCause;
    action = t.reviewAction;
  } else if (now === 'work' && step?.actor === 'ai') {
    cause = t.aiWorkCause;
    action = t.aiWorkAction;
  }
  return {
    id: `bottleneck:${taskId}`,
    kind: 'bottleneck',
    severity: 'danger',
    icon: 'bottleneck',
    entityId: islandId(taskId),
    problem: t.bottleneck(name),
    cause,
    action,
  };
}
