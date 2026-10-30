import type { CSSProperties, ReactNode } from 'react';
import { color } from '../theme';

/** ゲームの UI と同じ、白地に濃い縁取りと下の影のカード */
export const Card = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      background: color.surface,
      border: `5px solid ${color.ink}`,
      borderRadius: 32,
      boxShadow: `0 10px 0 ${color.ink}`,
      ...style,
    }}
  >
    {children}
  </div>
);
