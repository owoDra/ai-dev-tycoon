import type { FxTier } from '../fx';

/**
 * 手触りのプリセット。「演出の強さ」（FeelIntensity）と「モーションの性格」（FeelMotion）の2軸を独立に選び、
 * composeFeel で1つの FeelPreset にまとめる。fx/・world/vfx/・ui/fx/ は FeelPreset から値を読み、
 * 実行中にプリセットを差し替えると次の演出から反映する（`?dev=tweak` の「演出」でも変えられる）。
 * 既定は D4 で採用した「標準 × ぷるぷる」（docs/decisions/D4-feel.md）。演出の強さの3段階は、
 * 設定画面の「演出の強さ」の選択肢として残している。
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

/** 演出の強さ：Tier ごとの大きさ・長さ・パーティクル数・揺れ・フラッシュと、コンボ・ヒットストップ */
export interface FeelIntensity {
  tiers: Record<FxTier, FeelTierLook>;
  combo: {
    /** コンボ1段ごとに強さを足す割合 */
    step: number;
    /** 強さを足すのはこの段数まで */
    maxSteps: number;
  };
  /** Tier 4 のときだけワールドの時間をゆっくりにする（シミュレーションは止めない）。durationMs が 0 なら止めない */
  hitStop: { durationMs: number; timeScale: number };
  /** 数字のカウントアップの長さ（ms） */
  countUpMs: number;
  /** 増減のチップを出しておく時間（ms） */
  chipMs: number;
}

/** 3次ベジェのイージング（CSS の cubic-bezier と同じ4つの値） */
export type FeelBezier = [number, number, number, number];

/**
 * 値を目標へ動かす方法。spring は硬いほどきびきび、damping が小さいほどぷるぷる弾む。
 * tween は決まった長さとイージングで動かす（行き過ぎない。`?dev=tweak` で試せるよう型として残している）
 */
export type FeelTransition =
  | { type: 'spring'; stiffness: number; damping: number; mass: number }
  | { type: 'tween'; durationMs: number; ease: FeelBezier };

/** モーションの性格：同じ演出を、どんな動き方で見せるか */
export interface FeelMotion {
  /** 島の持ち上げ・Before → After の変形 */
  transition: FeelTransition;
  /**
   * 島の弾み（スカッシュ＆ストレッチ）。潰れた後、overshoot の割合で伸び、wobbles 回だけ揺り返してから戻る。
   * seconds は強さ 1 のときの長さ
   */
  bounce: { overshoot: number; wobbles: number; seconds: number };
  /** 文字とチップの出方。from の大きさから出て、overshoot まで膨らんでから落ち着く */
  pop: { from: number; overshoot: number; ease: FeelBezier };
}

export interface FeelPreset extends FeelIntensity {
  motion: FeelMotion;
}

const calm: FeelIntensity = {
  tiers: {
    0: { scale: 0.9, durationMs: 180, particles: 0, shakePx: 0, flash: 0 },
    1: { scale: 0.95, durationMs: 700, particles: 4, shakePx: 0, flash: 0 },
    2: { scale: 1, durationMs: 1000, particles: 8, shakePx: 0, flash: 0 },
    3: { scale: 1.1, durationMs: 1500, particles: 40, shakePx: 0, flash: 0 },
    4: { scale: 1.25, durationMs: 2200, particles: 80, shakePx: 2, flash: 0.25 },
  },
  combo: { step: 0.06, maxSteps: 4 },
  hitStop: { durationMs: 0, timeScale: 1 },
  countUpMs: 500,
  chipMs: 1200,
};

const standard: FeelIntensity = {
  tiers: {
    0: { scale: 1, durationMs: 220, particles: 0, shakePx: 0, flash: 0 },
    1: { scale: 1, durationMs: 900, particles: 10, shakePx: 0, flash: 0 },
    2: { scale: 1.1, durationMs: 1200, particles: 18, shakePx: 0, flash: 0 },
    3: { scale: 1.25, durationMs: 1900, particles: 90, shakePx: 2, flash: 0 },
    4: { scale: 1.45, durationMs: 2600, particles: 160, shakePx: 7, flash: 0.55 },
  },
  combo: { step: 0.15, maxSteps: 6 },
  hitStop: { durationMs: 100, timeScale: 0.15 },
  countUpMs: 600,
  chipMs: 1400,
};

const flashy: FeelIntensity = {
  tiers: {
    0: { scale: 1.1, durationMs: 260, particles: 4, shakePx: 0, flash: 0 },
    1: { scale: 1.15, durationMs: 1000, particles: 22, shakePx: 0, flash: 0 },
    2: { scale: 1.3, durationMs: 1400, particles: 40, shakePx: 1, flash: 0 },
    3: { scale: 1.55, durationMs: 2200, particles: 180, shakePx: 5, flash: 0 },
    4: { scale: 1.9, durationMs: 3200, particles: 300, shakePx: 12, flash: 0.8 },
  },
  combo: { step: 0.25, maxSteps: 8 },
  hitStop: { durationMs: 180, timeScale: 0.08 },
  countUpMs: 900,
  chipMs: 1800,
};

export const feelIntensities = { calm, standard, flashy } satisfies Record<string, FeelIntensity>;
export type FeelIntensityId = keyof typeof feelIntensities;

/** ぷるぷる：柔らかい spring で何度か揺り返してから止まる */
const bouncy: FeelMotion = {
  transition: { type: 'spring', stiffness: 380, damping: 9, mass: 1 },
  bounce: { overshoot: 0.9, wobbles: 3, seconds: 0.75 },
  pop: { from: 0.3, overshoot: 1.3, ease: [0.34, 1.56, 0.64, 1] },
};

export const feelMotions = { bouncy } satisfies Record<string, FeelMotion>;
export type FeelMotionId = keyof typeof feelMotions;

/** 選んでいる手触り（2軸の組み合わせ） */
export interface FeelChoice {
  intensity: FeelIntensityId;
  motion: FeelMotionId;
}

export function composeFeel(intensity: FeelIntensity, motion: FeelMotion): FeelPreset {
  return { ...intensity, motion };
}

export function feelFor(choice: FeelChoice): FeelPreset {
  return composeFeel(feelIntensities[choice.intensity], feelMotions[choice.motion]);
}

/** すべての組み合わせ（テストで全プリセットを確かめる用） */
export function allFeelPresets(): FeelPreset[] {
  return Object.values(feelIntensities).flatMap((i) => Object.values(feelMotions).map((m) => composeFeel(i, m)));
}

export const defaultFeelChoice: FeelChoice = { intensity: 'standard', motion: 'bouncy' };
export const defaultFeel: FeelPreset = feelFor(defaultFeelChoice);
