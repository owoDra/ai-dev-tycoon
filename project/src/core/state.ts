import { balance, type GameSpeed } from '../content/balance';
import type { ScheduledEvent } from './events';
import { hashSeed, type RngState } from './rng';

/**
 * ゲームの全状態。JSON にそのままシリアライズできる値（数値・文字列・真偽値・配列・素のオブジェクト）だけを持つ。
 * Map・class・関数・undefined は入れない。
 */
export interface GameState {
  /** ゲーム開始に使った seed。結果の再現・比較に使う */
  readonly seed: string;
  /** 乱数の現在状態 */
  readonly rng: RngState;
  /** ゲーム開始からの経過時間（ゲーム内の分）。固定ステップ幅の整数倍で進む */
  readonly clock: number;
  /** 固定ステップに満たず持ち越している時間（ゲーム内の分、0 以上 tickMinutes 未満）。描画の補間係数にも使う */
  readonly carryMinutes: number;
  /** 実時間あたりの進み方の倍率。シミュレーション結果には影響しない */
  readonly speed: GameSpeed;
  readonly paused: boolean;
  /** ゲーム内の存在物。後続の Phase で中身を定義する */
  readonly entities: Readonly<Record<string, never>>;
  /** 発火時刻待ちの出来事（at の昇順） */
  readonly pendingEvents: readonly ScheduledEvent[];
}

export function createInitialState(seed: string): GameState {
  return {
    seed,
    rng: hashSeed(seed),
    clock: 0,
    carryMinutes: 0,
    speed: balance.time.speeds[0],
    paused: false,
    entities: {},
    pendingEvents: [],
  };
}
