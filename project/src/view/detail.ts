import { stageOfPhase } from '../content/assignModes';
import { getProject } from '../content/index';
import type { GameState } from '../core/state';
import { ja } from '../i18n/ja';
import { forecastTask } from './forecast';
import { type TaskRowView, taskRows } from './project';
import { describeEntity, type EntityId, type EntityKind, type WorldViewModel } from './world';

/** 選んだもの（島・人・AI・パケット）の詳細パネルに出す要点。全部は見せず、判断に要るものだけ */
export interface DetailView {
  readonly entityId: EntityId;
  readonly kind: EntityKind;
  readonly label: string;
  /** 島（Task）なら Task の行。担当変更の対象になる */
  readonly row: TaskRowView | null;
  /** 島なら Task の進み具合（0〜1） */
  readonly progress: number | null;
  /** 島の前に積み上がっている仕事の数 */
  readonly queue: number;
  /** 品質。完了していれば実績、担当が決まっていれば見込み（forecast）、未定なら null */
  readonly quality: { readonly value: number; readonly forecast: boolean } | null;
  /** キャラクターなら居る島の名前（null は休憩所） */
  readonly place: string | null | undefined;
  /** 人間なら、今の仕事（Task 名と工程）と、待っている仕事の数 */
  readonly work: { readonly task: string | null; readonly waiting: number } | null;
}

/** 詳細パネルの表示用データ（純粋関数）。選んだものが ViewModel にない（消えた）なら null */
export function detailView(
  state: GameState,
  projectId: string,
  vm: WorldViewModel,
  entityId: EntityId,
): DetailView | null {
  const described = describeEntity(vm, entityId);
  if (!described) return null;
  const island = vm.islands.find((i) => i.id === entityId);
  const actor = vm.actors.find((a) => a.id === entityId);
  const row = island ? (taskRows(state, projectId).find((r) => r.id === island.taskId) ?? null) : null;
  const run = island ? state.projects[projectId]?.tasks[island.taskId] : undefined;

  let quality: DetailView['quality'] = null;
  if (island && run?.status === 'done') quality = { value: run.quality ?? 0, forecast: false };
  else if (island && run?.assignment) {
    quality = { value: forecastTask(state, projectId, island.taskId, run.assignment.mode).quality, forecast: true };
  }

  let work: DetailView['work'] = null;
  if (actor?.kind === 'human') {
    const humanId = entityId.replace(/^human:/, '');
    const queue = state.humanQueues[humanId] ?? [];
    const head = queue[0];
    const headRun = head ? state.projects[head.projectId]?.tasks[head.taskId] : undefined;
    const name = head ? getProject(head.projectId).tasks.find((t) => t.id === head.taskId)?.name : undefined;
    work = {
      task: name && headRun?.phase ? `${name}（${stageLabel(headRun.phase)}）` : null,
      waiting: Math.max(0, queue.length - 1),
    };
  }

  const at = actor?.islandId ? vm.islands.find((i) => i.id === actor.islandId) : undefined;
  return {
    entityId,
    kind: described.kind,
    label: described.label,
    row,
    progress: island ? island.progress : null,
    queue: island?.queueLength ?? 0,
    quality,
    place: actor ? (at?.label ?? null) : undefined,
    work,
  };
}

function stageLabel(phase: keyof typeof stageOfPhase): string {
  return ja.stages[stageOfPhase[phase]];
}
