import type { FxTier } from '../fx';

/**
 * 手触り（演出の強さ・モーションの性格）のプリセット。fx/・world/vfx/・ui/fx/ はここから値を読み、
 * 実行中にプリセットを差し替えると次の演出から反映する（`?dev=tweak` の「演出」でも変えられる）。
 * いまの値は仮の既定値で、D4（docs/plan/design-D4-feel.md）で比較して決める。
 */

export interface FeelTierLook {
  /** 大きさの倍率（島の弾み・文字のポップ・輪の広がり） */
  scale: number;
  /** 演出の長さ（ms）。同時再生数の判定にも使う */
  durationMs: number;
  /** 1回で出すパーティクルの数（world/vfx/particles.ts の上限で切り詰める） */
  particles: number;
  /** カメラの揺れの振幅（CSS px。world/vfx/shake.ts の上限で切り詰める） */
  shakePx: number;
  /** 画面フラッシュの不透明度（0〜1） */
  flash: number;
}

/** motion の spring。硬いほどきびきび、damping が小さいほどぷるぷる弾む */
export interface FeelSpring {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface FeelPreset {
  tiers: Record<FxTier, FeelTierLook>;
  spring: FeelSpring;
  combo: {
    /** コンボ1段ごとに強さを足す割合 */
    step: number;
    /** 強さを足すのはこの段数まで */
    maxSteps: number;
  };
  /** Tier 4 のときだけワールドの時間をゆっくりにする（シミュレーションは止めない） */
  hitStop: { durationMs: number; timeScale: number };
  /** 数字のカウントアップの長さ（ms） */
  countUpMs: number;
  /** 増減のチップを出しておく時間（ms） */
  chipMs: number;
}

const standard: FeelPreset = {
  tiers: {
    0: { scale: 1, durationMs: 220, particles: 0, shakePx: 0, flash: 0 },
    1: { scale: 1, durationMs: 900, particles: 10, shakePx: 0, flash: 0 },
    2: { scale: 1.1, durationMs: 1200, particles: 18, shakePx: 0, flash: 0 },
    3: { scale: 1.25, durationMs: 1900, particles: 90, shakePx: 2, flash: 0 },
    4: { scale: 1.45, durationMs: 2600, particles: 160, shakePx: 7, flash: 0.55 },
  },
  spring: { stiffness: 420, damping: 18, mass: 1 },
  combo: { step: 0.15, maxSteps: 6 },
  hitStop: { durationMs: 100, timeScale: 0.15 },
  countUpMs: 600,
  chipMs: 1400,
};

export const feelPresets = { standard } satisfies Record<string, FeelPreset>;
export type FeelId = keyof typeof feelPresets;
export const defaultFeelId: FeelId = 'standard';
