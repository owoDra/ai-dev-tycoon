import type { Camera, Scene } from 'three';
import { WebGLRenderer } from 'three';

/** 1フレームの draw call の上限。超えたら開発時に警告する（ジオメトリとマテリアルの共有・インスタンス化で抑える） */
export const DRAW_CALL_BUDGET = 160;

/** devicePixelRatio の上限。高精細な画面でも描画するピクセル数を抑える */
const MAX_PIXEL_RATIO = 2;

/** 1フレームで進める実時間の上限（秒）。描画を止めていた後の最初のフレームで大きく飛ばないようにする */
const MAX_FRAME_SECONDS = 0.1;

export interface RenderStats {
  /** 直近のフレームの draw call 数 */
  drawCalls: number;
  triangles: number;
  /** 描画したフレームの累計 */
  frames: number;
  /** 描画ループが回っているか（静止時は false） */
  running: boolean;
  /** 1フレームの更新と描画にかかった CPU 時間（ミリ秒、指数移動平均）。GPU の時間は含まない */
  cpuMs: number;
  /** フレームの間隔（ミリ秒、指数移動平均）。60fps なら約 16.7 */
  intervalMs: number;
}

/** 計測値の指数移動平均の重み（新しいフレームの割合） */
const STATS_SMOOTHING = 0.1;

/**
 * 1フレームの更新。dt は前のフレームからの実時間（秒）。
 * まだ動いているもの（歩行・ばね・進行中のゲーム）があれば true を返し、次のフレームを要求する
 */
export type FrameHandler = (dt: number, time: number) => boolean;

export interface WorldRenderer {
  readonly renderer: WebGLRenderer;
  readonly stats: Readonly<RenderStats>;
  /** 描画し直す必要があることを知らせる（dirty フラグ）。止まっていた描画ループを1フレーム分起こす */
  invalidate(): void;
  dispose(): void;
}

/**
 * WebGLRenderer と描画ループ。常に回し続けるのではなく、dirty フラグが立ったときと、
 * onFrame が「まだ動いている」と返す間だけ requestAnimationFrame を要求する。
 * 一時停止中で入力がなければ onFrame が false を返し、ループは止まる。
 */
export function createWorldRenderer(
  canvas: HTMLCanvasElement,
  scene: Scene,
  camera: () => Camera,
  onFrame: FrameHandler,
  onResize: (width: number, height: number) => void,
): WorldRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio));
  const stats: RenderStats = { drawCalls: 0, triangles: 0, frames: 0, running: false, cpuMs: 0, intervalMs: 0 };
  const smooth = (prev: number, next: number) => (prev === 0 ? next : prev + (next - prev) * STATS_SMOOTHING);
  let frame = 0;
  let dirty = false;
  let last: number | undefined;
  let warned = false;

  const tick = (now: number) => {
    frame = 0;
    const dt = last === undefined ? 0 : Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    if (last !== undefined) stats.intervalMs = smooth(stats.intervalMs, now - last);
    last = now;
    dirty = false;
    const start = performance.now();
    const animating = onFrame(dt, now / 1000);
    renderer.render(scene, camera());
    stats.cpuMs = smooth(stats.cpuMs, performance.now() - start);
    stats.drawCalls = renderer.info.render.calls;
    stats.triangles = renderer.info.render.triangles;
    stats.frames++;
    if (import.meta.env.DEV && !warned && stats.drawCalls > DRAW_CALL_BUDGET) {
      warned = true;
      console.warn(`draw call が上限を超えた: ${stats.drawCalls} / ${DRAW_CALL_BUDGET}`);
    }
    if (animating || dirty) {
      frame = requestAnimationFrame(tick);
    } else {
      // 静止：次のフレームを要求せず、ループを止める。invalidate() で再開する
      stats.running = false;
      last = undefined;
    }
  };

  const invalidate = () => {
    dirty = true;
    if (frame !== 0) return;
    stats.running = true;
    frame = requestAnimationFrame(tick);
  };

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (w === 0 || h === 0) return;
    renderer.setPixelRatio(Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio));
    renderer.setSize(w, h, false);
    onResize(w, h);
    invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  return {
    renderer,
    stats,
    invalidate,
    dispose() {
      cancelAnimationFrame(frame);
      frame = 0;
      observer.disconnect();
      renderer.dispose();
    },
  };
}
