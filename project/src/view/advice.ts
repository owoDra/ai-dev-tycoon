import type { IconName } from '../assets/icons';
import { stageOfPhase } from '../content/assignModes';
import { findWorker, getProject } from '../content/index';
import { defaultWorldLookId, type WorldBottleneckLook, worldLooks } from '../content/look/world';
import type { IncidentId, Stage } from '../content/types';
import { multitaskShare } from '../core/formulas';
import { getIncidentDef } from '../core/incidents';
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
  readonly kind: 'incident' | 'bottleneck' | 'unassigned';
  readonly severity: 'danger' | 'warning';
  readonly icon: IconName;
  /** 問題のある島やキャラクター。ボタンを押すとここを選んでカメラを寄せる */
  readonly entityId: EntityId;
  readonly problem: string;
  readonly cause: string;
  readonly action: string;
  /** 事件なら、解決ボタンで送る ResolveIncident の中身 */
  readonly incident?: { readonly id: IncidentId; readonly workerId: string };
}

type Candidate = { readonly advice: Advice; readonly minutes: number };

/**
 * 案件の問題を重要な順に並べる（純粋関数）。
 * 0. 事件（企画書19章）。最優先で出し、解決ボタンから直接対処できる
 * 1. ボトルネック：まだ終わっていない Task の工程のリードタイムと、人間の待ち行列の待ち時間のうち最大のもの。
 *    ワールドで赤いリングを出すのと同じ強さ（look.threshold × look.fullMinutes 分）以上のときだけ出す。
 *    終わった Task のリードタイムは、もう打つ手がないので対象にしない
 * 2. 担当が決まっていない Task。1件にまとめ、前の Task が終わってすぐ始められるもの（止まっている）を見せて残りの数を添える
 */
export function adviseProblems(
  state: GameState,
  projectId: string,
  look: Pick<WorldBottleneckLook, 'threshold' | 'fullMinutes'> = worldLooks[defaultWorldLookId].bottleneck,
): Advice[] {
  const run = state.projects[projectId];
  if (!run || run.completedAt !== null) return [];
  const rows = taskRows(state, projectId);
  const out: Advice[] = state.incidents
    .filter((r) => r.projectId === projectId)
    .map((r) => {
      const text = ja.incidents[r.id];
      const def = getIncidentDef(r.id);
      return {
        id: `incident:${r.id}:${r.workerId}`,
        kind: 'incident',
        severity: 'danger',
        icon: def.icon,
        entityId: islandId(r.taskId),
        problem: text.problem,
        cause: text.cause,
        action: text.action,
        incident: { id: r.id, workerId: r.workerId },
      };
    });

  const bottleneck = worstBottleneck(state, projectId, rows);
  if (bottleneck && bottleneck.minutes >= look.threshold * look.fullMinutes) out.push(bottleneck.advice);

  const def = getProject(projectId);
  const finished = new Set(rows.filter((r) => r.status === 'done' || r.status === 'defect').map((r) => r.id));
  const unassigned = rows
    .filter((r) => r.status === 'unassigned')
    .map((row) => ({ row, ready: (def.tasks.find((d) => d.id === row.id)?.deps ?? []).every((d) => finished.has(d)) }))
    .sort((a, b) => Number(b.ready) - Number(a.ready));
  // 担当が未定の Task は1件にまとめ、いちばん急ぐもの（止まっているもの）を見せて残りの数を添える
  const [first, ...rest] = unassigned;
  if (first) {
    out.push({
      id: `unassigned:${first.row.id}`,
      kind: 'unassigned',
      severity: first.ready ? 'danger' : 'warning',
      icon: 'warning',
      entityId: islandId(first.row.id),
      problem: t.unassigned(first.row.name),
      cause: first.ready ? t.unassignedReady : t.unassignedLater,
      action: rest.length > 0 ? t.unassignedActionMore(rest.length) : t.unassignedAction,
    });
  }
  return out;
}

/** 事件を詳しく見るシート。解決アクションが Harness 部品を変えるなら Harness Builder、それ以外は Context */
export function incidentSheet(id: IncidentId): 'context' | 'harness' {
  return getIncidentDef(id).resolve.some((a) => a.type === 'EquipPart' || a.type === 'TrimParts')
    ? 'harness'
    : 'context';
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
    const lost = 1 - multitaskShare(queue.length);
    const minutes = queue
      .filter((q) => q.projectId === projectId)
      .reduce((sum, q) => sum + (state.clock - q.queuedAt) * lost, 0);
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
