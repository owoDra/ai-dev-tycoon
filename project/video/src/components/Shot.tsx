import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { clamp } from './pop';

/** 画面上の点（0〜1 の割合）とその倍率。Shot はこの2つの間をゆっくり動く（Ken Burns） */
export interface Framing {
  x: number;
  y: number;
  zoom: number;
}

/**
 * ゲームのスクリーンショット（public/screens/<name>.png）を全面に出し、from から to へ寄っていく。
 * x, y は寄せる中心で、画面の外が見えないように倍率に合わせて中心を内側へ寄せる
 */
export const Shot = ({ name, from, to, fadeTo }: { name: string; from: Framing; to: Framing; fadeTo?: string }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = interpolate(frame, [0, durationInFrames], [0, 1], clamp);
  const ease = 0.5 - Math.cos(t * Math.PI) / 2;
  const zoom = from.zoom + (to.zoom - from.zoom) * ease;
  const fx = from.x + (to.x - from.x) * ease;
  const fy = from.y + (to.y - from.y) * ease;
  // 中心を fx, fy に置いたときの移動量（画面の外を見せない範囲に収める）
  const half = 0.5 / zoom;
  const cx = Math.min(1 - half, Math.max(half, fx));
  const cy = Math.min(1 - half, Math.max(half, fy));
  const fade = fadeTo ? interpolate(frame, [durationInFrames * 0.45, durationInFrames * 0.6], [0, 1], clamp) : 0;
  const style = {
    position: 'absolute',
    width: 1920,
    height: 1080,
    transformOrigin: '0 0',
    transform: `scale(${zoom}) translate(${(0.5 / zoom - cx) * 1920}px, ${(0.5 / zoom - cy) * 1080}px)`,
  } as const;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Img src={staticFile(`screens/${name}.png`)} style={style} />
      {fadeTo && <Img src={staticFile(`screens/${fadeTo}.png`)} style={{ ...style, opacity: fade }} />}
    </AbsoluteFill>
  );
};
