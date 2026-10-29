import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import titleKey from '../../../src/assets/generated/title-key@2x.webp';
import { Backdrop } from '../components/Backdrop';
import { Card } from '../components/Card';
import { pop } from '../components/pop';
import { color } from '../theme';

/** 冒頭：キービジュアル・タイトル・ゲームのキャッチコピー */
export const Title = () => {
  const frame = useCurrentFrame();
  const art = pop(frame, 4);
  const title = pop(frame, 22);
  const tagline = pop(frame, 46);
  return (
    <Backdrop>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <Card
          style={{
            padding: 14,
            transform: `translateY(${art.y}px) scale(${art.scale}) rotate(${(1 - art.scale) * -8}deg)`,
            opacity: art.opacity,
          }}
        >
          <Img src={titleKey} style={{ width: 900, display: 'block', borderRadius: 20 }} />
        </Card>
        <div
          style={{
            fontSize: 124,
            fontWeight: 900,
            letterSpacing: '0.02em',
            transform: `translateY(${title.y}px) scale(${title.scale})`,
            opacity: title.opacity,
            textShadow: `0 8px 0 ${color.accent}`,
          }}
        >
          AI業務改善タイクーン
        </div>
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: color.inkMuted,
            transform: `translateY(${tagline.y}px)`,
            opacity: tagline.opacity,
          }}
        >
          人間を、人間にしかできない仕事へ
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
};
