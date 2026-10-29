import { interpolate, spring } from 'remotion';
import { FPS } from '../theme';

/** delay フレーム後に弾んで出る（0 → 1 を少し越えて戻る）。scale と opacity にそのまま使う */
export function pop(frame: number, delay = 0): { scale: number; opacity: number; y: number } {
  const s = spring({ frame: frame - delay, fps: FPS, config: { damping: 11, stiffness: 160, mass: 0.7 } });
  return { scale: 0.6 + 0.4 * s, opacity: interpolate(frame - delay, [0, 6], [0, 1], clamp), y: (1 - s) * 40 };
}

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
