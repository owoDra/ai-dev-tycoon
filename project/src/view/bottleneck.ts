import { getAssignMode } from '../content/assignModes';
import { aiWorkers, findWorker, getProject, getTask } from '../content/index';
import type { Stage } from '../content/types';
import { type BottleneckRef, bottleneckKey, stageTimes } from '../core/bottleneck';
import { averageSkill } from '../core/expectation';
import { stepMinutes } from '../core/formulas';
import { harnessModel, harnessModifiers } from '../core/harness';
import type { GameState } from '../core/state';
import { ja } from '../i18n/ja';
import { type EntityId, humanActorId, islandId } from './world';

/** ボトルネックの名前（工程なら「QA」「API 実装のレビュー」、人なら「安斗露 そね子（ディレクター）の手」） */
export function bottleneckName(ref: BottleneckRef): string {
  if (ref.kind === 'human') return ja.bottleneck.human(findWorker(ref.humanId)?.name ?? ref.humanId);
  const name = getTask(ref.projectId, ref.taskId).name;
  return ref.stage === 'review' ? ja.bottleneck.review(name) : name;
}

/** ボトルネックのいる島（工程）かキャラクター（人） */
export function bottleneckEntity(ref: BottleneckRef): EntityId {
  return ref.kind === 'human' ? humanActorId(ref.humanId) : islandId(ref.taskId);
}

/** ボトルネックの移動の案内（企画書20章）。from は直前のボトルネック（なければ null） */
export interface BottleneckMove {
  readonly from: string | null;
  readonly to: string;
  readonly entityId: EntityId;
}

/** 案件のボトルネックの移動を案内の形にする。この案件のものでなければ null */
export function bottleneckMove(
  projectId: string,
  from: BottleneckRef | null,
  to: BottleneckRef | null,
): BottleneckMove | null {
  if (!to || (to.kind === 'stage' && to.projectId !== projectId) || bottleneckKey(from) === bottleneckKey(to)) {
    return null;
  }
  const fromHere = from && (from.kind === 'human' || from.projectId === projectId) ? from : null;
  return { from: fromHere ? bottleneckName(fromHere) : null, to: bottleneckName(to), entityId: bottleneckEntity(to) };
}

/** 工程ごとの時間の比較の1行（企画書20章「Implementation 8h → 20m」） */
export interface StageRow {
  readonly key: string;
  readonly taskId: string;
  readonly stage: Stage;
  readonly name: string;
  /** 人間だけで作業した場合の時間（分）。レビューは人間だけなら無いので 0 */
  readonly before: number;
  /** いまの配置での時間（分）。始まった工程は待ち時間を含む実績、まだの工程は今の担当での見込み */
  readonly after: number;
  /** いまのボトルネック */
  readonly bottleneck: boolean;
}

/**
 * 工程ごとの時間を、人間だけで作業した場合（Before）と今の配置（After）で並べる（純粋関数）。
 * レビューの行は、担当にレビューがあるか、レビューに時間がかかった工程だけを出す
 */
export function stageRows(state: GameState, projectId: string): StageRow[] {
  const run = state.projects[projectId];
  if (!run) return [];
  const skill = averageSkill();
  const lead = new Map(stageTimes(state, projectId).map((s) => [`${s.ref.taskId}/${s.ref.stage}`, s.minutes]));
  const current =
    state.bottleneck?.kind === 'stage' && state.bottleneck.projectId === projectId ? state.bottleneck : null;
  const rows: StageRow[] = [];
  for (const task of getProject(projectId).tasks) {
    const t = run.tasks[task.id];
    const human = task.effort / skill;
    const mode = t?.assignment ? getAssignMode(t.assignment.mode) : null;
    const expected = { work: human, review: 0 };
    if (mode && t?.assignment) {
      expected.work = 0;
      // 人間だけの担当では Model は使わない（AI Worker の Harness を引くための既定の AI Worker）
      const workerId =
        findWorker(t.assignment.workerId)?.kind === 'ai' ? t.assignment.workerId : (aiWorkers[0]?.id ?? '');
      const model = harnessModel(state, workerId, harnessModifiers(state, workerId, task, { expected: true }));
      for (const s of mode.steps) {
        const minutes = stepMinutes(task, s, s.actor === 'ai' ? { kind: 'ai', model } : { kind: 'human', skill });
        expected[s.phase === 'review' ? 'review' : 'work'] += minutes;
      }
    }
    const started = t !== undefined && t.status !== 'waiting';
    for (const stage of ['work', 'review'] as const) {
      const key = `${task.id}/${stage}`;
      const after = started ? (lead.get(key) ?? 0) : expected[stage];
      if (stage === 'review' && after <= 0 && !mode?.steps.some((s) => s.phase === 'review')) continue;
      rows.push({
        key,
        taskId: task.id,
        stage,
        name: stage === 'review' ? ja.bottleneck.review(task.name) : task.name,
        before: stage === 'work' ? human : 0,
        after,
        bottleneck: current?.taskId === task.id && current.stage === stage,
      });
    }
  }
  return rows;
}
