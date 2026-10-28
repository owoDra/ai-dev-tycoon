import { type Accessor, createSignal, onCleanup } from 'solid-js';

/** セーフエリアの内側の範囲（main の中の位置と大きさ。CSS ピクセル） */
export interface SafeBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * セーフエリアの内側の範囲を測る。el は `env(safe-area-inset-*)` だけ内側に置いた要素で、
 * 画面の回転・ブラウザのバーの出し入れ（100dvh の変化）・ウィンドウの大きさの変化に追従する
 */
export function createSafeBox(el: Accessor<HTMLElement | undefined>): Accessor<SafeBox> {
  const read = (): SafeBox => {
    const e = el();
    if (!e || e.clientWidth === 0) return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    return { x: e.offsetLeft, y: e.offsetTop, width: e.clientWidth, height: e.clientHeight };
  };
  const [box, setBox] = createSignal(read(), {
    equals: (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height,
  });
  const update = () => setBox(read());
  // 要素ができてから最初に測る
  queueMicrotask(update);
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  window.visualViewport?.addEventListener('resize', update);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
  queueMicrotask(() => {
    const e = el();
    if (e) observer?.observe(e);
  });
  onCleanup(() => {
    window.removeEventListener('resize', update);
    window.removeEventListener('orientationchange', update);
    window.visualViewport?.removeEventListener('resize', update);
    observer?.disconnect();
  });
  return box;
}
