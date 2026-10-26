import { bottleneckSystem } from './bottleneck';
import type { GameEvent } from './events';
import { humanQueueSystem } from './humanQueueSystem';
import type { RngCursor } from './rng';
import type { GameState } from './state';
import { taskSystem, taskUnlockSystem } from './taskSystem';

/** システム関数に渡す、1ステップ分の作業場所 */
export interface SystemContext {
  readonly rng: RngCursor;
  emit(event: GameEvent): void;
}

/**
 * 固定ステップ1回ぶんの処理。新しい機能はシステムを1つ作って `defaultSystems` に足す。
 * state は書き換えず、新しい state を返す。乱数は必ず ctx.rng から引く。
 */
export type System = (state: GameState, ctx: SystemContext) => GameState;

/** 発火時刻に達した予約済みの出来事を出力する */
export const releaseScheduledEvents: System = (state, ctx) => {
  const due = state.pendingEvents.filter((e) => e.at <= state.clock);
  if (due.length === 0) return state;
  for (const e of due) ctx.emit(e.event);
  return { ...state, pendingEvents: state.pendingEvents.filter((e) => e.at > state.clock) };
};

/** 1ステップごとに先頭から順に適用されるシステム */
export const defaultSystems: readonly System[] = [
  releaseScheduledEvents,
  taskSystem,
  humanQueueSystem,
  taskUnlockSystem,
  bottleneckSystem,
];
