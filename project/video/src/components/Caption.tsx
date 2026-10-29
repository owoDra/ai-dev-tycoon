import type { CSSProperties, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { color } from '../theme';
import { Card } from './Card';
import { pop } from './pop';

/** 画面の上に貼るテロップ。label は小さな見出し（黄色の札） */
export const Caption = ({
  label,
  children,
  sub,
  delay = 0,
  style,
}: {
  label?: string;
  children: ReactNode;
  sub?: ReactNode;
  delay?: number;
  style?: CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const p = pop(frame, delay);
  return (
    <div
      style={{
        position: 'absolute',
        left: 80,
        top: 72,
        transformOrigin: 'left top',
        transform: `translateY(${p.y}px) scale(${p.scale})`,
        opacity: p.opacity,
        ...style,
      }}
    >
      <Card style={{ padding: '28px 44px 32px', maxWidth: 1180 }}>
        {label && (
          <div
            style={{
              display: 'inline-block',
              background: color.accent,
              border: `4px solid ${color.ink}`,
              borderRadius: 999,
              padding: '4px 22px',
              fontSize: 30,
              fontWeight: 900,
              marginBottom: 14,
            }}
          >
            {label}
          </div>
        )}
        <div style={{ fontSize: 68, fontWeight: 900, lineHeight: 1.25, letterSpacing: '0.01em' }}>{children}</div>
        {sub && (
          <div style={{ fontSize: 34, fontWeight: 700, color: color.inkMuted, marginTop: 12, lineHeight: 1.4 }}>
            {sub}
          </div>
        )}
      </Card>
    </div>
  );
};

/** テロップの中で色を付けて目立たせる語 */
export const Em = ({ children, tone = 'primary' }: { children: ReactNode; tone?: 'primary' | 'success' }) => (
  <span style={{ color: tone === 'primary' ? color.primary : color.success }}>{children}</span>
);
