import type { Stage } from '../content/types';
import type { GameState } from './state';
import type { System } from './system';

/** ボトルネックになっているもの。Task の工程（作業 / レビュー）か、人間の待ち行列 */
export type BottleneckRef =
  | { readonly kind: 'stage'; readonly projectId: string; readonly taskId: string; readonly stage: Stage }
  | { readonly kind: 'human'; readonly humanId: string };

export interface Bottleneck {
  readonly ref: BottleneckRef;
  /** ボトルネックの大きさ（分） */
  readonly minutes: number;
}

export type StageRef = Extract<BottleneckRef, { readonly kind: 'stage' }>;

/** 工程（Task の作業 / レビュー）ごとの時間 */
export interface StageTime {
  readonly ref: StageRef;
  /** 待ち時間を含むリードタイムの累計（分） */
  readonly minutes: number;
}

/**
 * 案件の工程ごとの時間（企画書20章の「Implementation 8h / QA 3h / Human Review 4h」）。Task の定義順に、作業・レビューの順で並べる。
 * レビューには、人間のレビューと手戻り、AI の自動テスト・Eval の検証と修復を含む（content/assignModes.ts の stageOfPhase）
 */
export function stageTimes(state: GameState, projectId: string): StageTime[] {
  const project = state.projects[projectId];
  if (!project) return [];
  return Object.entries(project.tasks).flatMap(([taskId, run]) =>
    (['work', 'review'] as const).map((stage) => ({
      ref: { kind: 'stage', projectId, taskId, stage } as const,
      minutes: run.lead[stage],
    })),
  );
}

/**
 * 最大のボトルネックを返す。何も動いていなければ null。
 * - Task の工程：待ち時間を含むリードタイムの累計（企画書20章の「Implementation 8h / QA 3h」）
 * - 人間：待ち行列で先頭以外が待っている時間の合計（いま人が詰まっている度合い）
 * 同じ大きさなら先に見つかった方（案件・Task の定義順、Task の工程を人より優先）を返す。
 */
export function findBottleneck(state: GameState): Bottleneck | null {
  let best: Bottleneck | null = null;
  const consider = (ref: BottleneckRef, minutes: number) => {
    if (minutes > 0 && (!best || minutes > best.minutes)) best = { ref, minutes };
  };
  for (const projectId of Object.keys(state.projects)) {
    for (const s of stageTimes(state, projectId)) consider(s.ref, s.minutes);
  }
  for (const [humanId, queue] of Object.entries(state.humanQueues)) {
    consider(
      { kind: 'human', humanId },
      queue.slice(1).reduce((sum, q) => sum + (state.clock - q.queuedAt), 0),
    );
  }
  return best;
}

/** ボトルネックの同一性を比べるためのキー */
export function bottleneckKey(ref: BottleneckRef | null): string {
  if (ref === null) return '';
  return ref.kind === 'human' ? `human:${ref.humanId}` : `stage:${ref.projectId}/${ref.taskId}/${ref.stage}`;
}

/** ボトルネックが別のものに移ったら BottleneckChanged を出す */
export const bottleneckSystem: System = (state, ctx) => {
  const ref = findBottleneck(state)?.ref ?? null;
  if (bottleneckKey(ref) === bottleneckKey(state.bottleneck)) return state;
  ctx.emit({ type: 'BottleneckChanged', bottleneck: ref });
  return { ...state, bottleneck: ref };
};
