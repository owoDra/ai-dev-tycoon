import type { MomentumInput } from '../audio/music/intensity';
import type { GameState } from '../core/state';

/** 作業中の Task の数（BGM の勢いの入力） */
export function runningTasks(state: GameState, projectId: string): number {
  const run = state.projects[projectId];
  if (!run) return 0;
  return Object.values(run.tasks).filter((t) => t.status === 'running').length;
}

/**
 * BGM の勢いの入力を集める（純粋関数）。
 * recentDone は実時間の完了時刻（ms）の列で、window の外にあるものは数えない
 */
export function momentumInput(
  state: GameState,
  projectId: string,
  combo: number,
  recentDone: readonly number[],
  now: number,
  windowMs: number,
): MomentumInput {
  return {
    running: runningTasks(state, projectId),
    combo,
    recent: recentDone.filter((t) => now - t <= windowMs).length,
  };
}
