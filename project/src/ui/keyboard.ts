/** プレイ画面のキーボード操作（キー → 動作）。Tab / Enter はブラウザ標準のフォーカス移動とボタンの決定に任せる */
export type KeyAction =
  | { readonly type: 'close' }
  | { readonly type: 'pause' }
  | { readonly type: 'move'; readonly dir: Direction };

export type Direction = 'left' | 'right' | 'up' | 'down';

const arrows: Readonly<Record<string, Direction>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/** 文字入力やボタンの上では、Space と矢印キーをその部品の標準の動作に任せる */
const NATIVE_SPACE = 'button, a[href], input, select, textarea, summary, [contenteditable="true"]';
/** 担当のカード（data-assign-cards）の中では、矢印キーはカードの間の移動に使う */
const NATIVE_ARROWS = 'input, select, textarea, [data-assign-cards], [contenteditable="true"]';

export interface KeyInput {
  readonly key: string;
  readonly target: EventTarget | null;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
}

const within = (target: EventTarget | null, selector: string) =>
  typeof Element !== 'undefined' && target instanceof Element && target.closest(selector) !== null;

/** キー入力をプレイ画面の動作に変換する。対応しないキーなら null */
export function keyAction(e: KeyInput): KeyAction | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  if (e.key === 'Escape') return { type: 'close' };
  if (e.key === ' ' && !within(e.target, NATIVE_SPACE)) return { type: 'pause' };
  const dir = arrows[e.key];
  if (dir && !within(e.target, NATIVE_ARROWS)) return { type: 'move', dir };
  return null;
}

export interface ScreenPoint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

const vectors: Readonly<Record<Direction, { x: number; y: number }>> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

/** 横ずれを、進む方向の距離よりどれだけ重く見るか */
const SIDEWAYS_WEIGHT = 2;

/**
 * 矢印キーで次に選ぶ島。画面上でその方向にあり、近くて横ずれの小さい島を選ぶ。
 * 何も選んでいなければ先頭の島。その方向に島がなければ並び順で隣の島へ（どの島にも必ずたどり着ける）
 */
export function nextIsland(points: readonly ScreenPoint[], current: string | null, dir: Direction): string | null {
  const from = points.find((p) => p.id === current);
  if (!from) return points[0]?.id ?? null;
  const v = vectors[dir];
  let best: { id: string; score: number } | null = null;
  for (const p of points) {
    if (p.id === from.id) continue;
    const dx = p.x - from.x;
    const dy = p.y - from.y;
    const ahead = dx * v.x + dy * v.y;
    if (ahead <= 0) continue;
    const score = ahead + SIDEWAYS_WEIGHT * Math.abs(dx * v.y - dy * v.x);
    if (!best || score < best.score) best = { id: p.id, score };
  }
  if (best) return best.id;
  const i = points.indexOf(from);
  const step = dir === 'right' || dir === 'down' ? 1 : -1;
  return points[(i + step + points.length) % points.length]?.id ?? null;
}
