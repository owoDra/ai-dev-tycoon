import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import titleKey from '../../../src/assets/generated/title-key@2x.webp';
import { Backdrop } from '../components/Backdrop';
import { Card } from '../components/Card';
import { pop } from '../components/pop';
import { facts } from '../data';
import { color } from '../theme';

/** URL・QRコードを含まない、ゲーム紹介の締め画面。 */
export const End = () => {
  const frame = useCurrentFrame();
  const title = pop(frame, 0);
  const note = pop(frame, 40);
  return (
    <Backdrop>
      <AbsoluteFill
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 32,
          opacity: title.opacity,
          transform: 'translateY(' + title.y + 'px)',
        }}
      >
        <Card style={{ padding: 10 }}>
          <Img src={titleKey} style={{ width: 560, display: 'block', borderRadius: 18 }} />
        </Card>
        <div style={{ fontSize: 92, fontWeight: 900, textShadow: '0 7px 0 ' + color.accent }}>
          AI業務改善タイクーン
        </div>
        <div style={{ fontSize: 48, fontWeight: 800 }}>人とAIの仕事を、ゲームで考える。</div>
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 56,
          bottom: 40,
          fontSize: 28,
          fontWeight: 700,
          color: color.inkMuted,
          opacity: note.opacity,
        }}
      >
        VOICEVOX:ずんだもん
      </div>
      <div
        style={{
          position: 'absolute',
          right: 56,
          bottom: 40,
          fontSize: 28,
          fontWeight: 700,
          color: color.inkMuted,
          opacity: note.opacity,
        }}
      >
        Claude Code と一緒に、約{facts.days}日で制作
      </div>
    </Backdrop>
  );
};
