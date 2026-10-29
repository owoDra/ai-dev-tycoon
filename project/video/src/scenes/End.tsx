import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import titleKey from '../../../src/assets/generated/title-key@2x.webp';
import { encodeQr, qrPath } from '../../../src/lib/qr';
import { Backdrop } from '../components/Backdrop';
import { Card } from '../components/Card';
import { pop } from '../components/pop';
import { facts } from '../data';
import { color } from '../theme';

const qr = encodeQr(facts.url);
const quiet = 2;
const qrSize = qr.size + quiet * 2;

/** 締め：URL と QR コード。制作の話は隅に小さく */
export const End = () => {
  const frame = useCurrentFrame();
  const left = pop(frame, 0);
  const code = pop(frame, 12);
  const note = pop(frame, 40);
  return (
    <Backdrop>
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 90 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 26,
            opacity: left.opacity,
            transform: `translateY(${left.y}px)`,
          }}
        >
          <Card style={{ padding: 10, alignSelf: 'flex-start' }}>
            <Img src={titleKey} style={{ width: 560, display: 'block', borderRadius: 18 }} />
          </Card>
          <div style={{ fontSize: 92, fontWeight: 900, textShadow: `0 7px 0 ${color.accent}` }}>
            AI業務改善タイクーン
          </div>
          <div style={{ fontSize: 46, fontWeight: 800 }}>スマホでもPCでも、開くだけで遊べる</div>
          <div
            style={{
              alignSelf: 'flex-start',
              fontSize: 50,
              fontWeight: 900,
              color: color.surface,
              background: color.primary,
              border: `5px solid ${color.ink}`,
              borderRadius: 999,
              padding: '10px 36px',
              boxShadow: `0 7px 0 ${color.ink}`,
            }}
          >
            {facts.url.replace(/^https:\/\//, '').replace(/\/$/, '')}
          </div>
        </div>
        <Card
          style={{
            padding: 30,
            transform: `scale(${code.scale}) rotate(${(1 - code.scale) * 10}deg)`,
            opacity: code.opacity,
          }}
        >
          <svg width={560} height={560} viewBox={`0 0 ${qrSize} ${qrSize}`} shapeRendering="crispEdges" role="img">
            <title>{facts.url}</title>
            <rect width={qrSize} height={qrSize} fill={color.surface} />
            <path d={qrPath(qr, quiet)} fill={color.ink} />
          </svg>
        </Card>
      </AbsoluteFill>
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
