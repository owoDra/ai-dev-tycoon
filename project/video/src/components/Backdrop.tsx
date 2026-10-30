import type { ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { color, font } from '../theme';

/** ゲームの床に似た、ゆっくり流れる市松の背景 */
export const Backdrop = ({ children }: { children?: ReactNode }) => {
  const frame = useCurrentFrame();
  const offset = (frame * 0.6) % 120;
  return (
    <AbsoluteFill style={{ backgroundColor: color.bg, fontFamily: font, color: color.ink, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: -240,
          top: -240,
          width: 2400,
          height: 1560,
          backgroundImage: `repeating-linear-gradient(45deg, ${color.tile} 0 2px, transparent 2px 60px), repeating-linear-gradient(-45deg, ${color.tile} 0 2px, transparent 2px 60px)`,
          transform: `translate(${offset}px, ${offset / 2}px)`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};
