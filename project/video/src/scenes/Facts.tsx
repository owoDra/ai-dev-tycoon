import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Backdrop } from '../components/Backdrop';
import { Card } from '../components/Card';
import { clamp, pop } from '../components/pop';
import { facts } from '../data';
import { color } from '../theme';

const items = [
  { label: 'BGM・効果音', value: 'コードで合成' },
  { label: 'キャラ・3Dモデル', value: 'コードで生成' },
  { label: '画像・フォント', value: '外部ファイル 0' },
] as const;

/** 小ネタ：音も絵も 3D も、すべてリポジトリのコードから作り、HTML 1枚に収めている */
export const Facts = () => {
  const frame = useCurrentFrame();
  const head = pop(frame, 0);
  const size = interpolate(frame, [70, 120], [0, facts.htmlMegabytes], clamp);
  const total = pop(frame, 66);
  return (
    <Backdrop>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 44 }}>
        <div style={{ fontSize: 64, fontWeight: 900, opacity: head.opacity, transform: `translateY(${head.y}px)` }}>
          ちなみに、このゲーム…
        </div>
        <div style={{ display: 'flex', gap: 32 }}>
          {items.map((item, i) => {
            const p = pop(frame, 14 + i * 9);
            return (
              <Card
                key={item.label}
                style={{
                  width: 460,
                  padding: '30px 0',
                  textAlign: 'center',
                  transform: `scale(${p.scale})`,
                  opacity: p.opacity,
                }}
              >
                <div style={{ fontSize: 36, fontWeight: 800, color: color.inkMuted }}>{item.label}</div>
                <div style={{ fontSize: 60, fontWeight: 900, marginTop: 6 }}>{item.value}</div>
              </Card>
            );
          })}
        </div>
        <Card
          style={{
            background: color.accent,
            padding: '24px 64px',
            display: 'flex',
            alignItems: 'baseline',
            gap: 28,
            transform: `scale(${total.scale})`,
            opacity: total.opacity,
          }}
        >
          <span style={{ fontSize: 56, fontWeight: 900 }}>ぜんぶ入りで HTML 1枚</span>
          <span style={{ fontSize: 110, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
            {size.toFixed(1)}
            <span style={{ fontSize: 64 }}> MB</span>
          </span>
        </Card>
      </AbsoluteFill>
    </Backdrop>
  );
};
