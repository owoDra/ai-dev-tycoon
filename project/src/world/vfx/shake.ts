/**
 * カメラの揺れ。振幅は feel.ts の shakePx を使うが、酔いを防ぐため MAX_SHAKE_PX で必ず切り詰める。
 * 揺れは時間とともに二乗で減衰し、決まった周波数の正弦波を重ねる（乱数を使わず、毎回同じ揺れ方になる）。
 */

/** カメラの揺れの振幅の上限（CSS px） */
export const MAX_SHAKE_PX = 12;
/** 揺れの周波数（Hz）。横と縦で少しずらして、往復が直線に見えないようにする */
const FREQ_X = 23;
const FREQ_Y = 17;

/** 経過 elapsedMs のときの揺れ（CSS px）。durationMs を過ぎたら 0 */
export function shakeOffset(elapsedMs: number, durationMs: number, amplitudePx: number): { x: number; y: number } {
  if (elapsedMs < 0 || elapsedMs >= durationMs || durationMs <= 0) return { x: 0, y: 0 };
  const amp = Math.min(MAX_SHAKE_PX, Math.max(0, amplitudePx));
  const decay = (1 - elapsedMs / durationMs) ** 2;
  const s = elapsedMs / 1000;
  return {
    x: amp * decay * Math.sin(s * FREQ_X * Math.PI * 2),
    y: amp * decay * Math.sin(s * FREQ_Y * Math.PI * 2 + 1),
  };
}
