import type { GameSpeed } from '../content/balance';

/**
 * core が出力する出来事。描画・UI・演出・音はこれを読んで反応する。
 * 後続の Phase で種類を追加していく。
 */
export type GameEvent =
  | { readonly type: 'SpeedChanged'; readonly speed: GameSpeed }
  | { readonly type: 'PauseToggled'; readonly paused: boolean };

/** 指定したゲーム内時刻（分）に発火させる予約済みの出来事 */
export interface ScheduledEvent {
  readonly at: number;
  readonly event: GameEvent;
}
