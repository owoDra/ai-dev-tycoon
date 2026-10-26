/**
 * seed 付きの決定論的な乱数。状態は 32bit 整数1つで、GameState にそのまま保存できる。
 * どの関数も `(rngState, ...) => [value, nextRngState]` の純粋関数。
 */
export type RngState = number;

/** seed 文字列を 32bit の初期状態にする（FNV-1a に murmur3 の finalizer を掛けて偏りを減らす） */
export function hashSeed(seed: string): RngState {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32。[0, 1) の一様乱数を返す */
export function next(state: RngState): [number, RngState] {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** min 以上 max 以下の整数 */
export function int(state: RngState, min: number, max: number): [number, RngState] {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new RangeError(`int: 不正な範囲 [${min}, ${max}]`);
  }
  const [v, s] = next(state);
  return [min + Math.floor(v * (max - min + 1)), s];
}

/** 配列から等確率で1つ選ぶ */
export function pick<T>(state: RngState, items: readonly T[]): [T, RngState] {
  const [i, s] = int(state, 0, items.length - 1);
  return [items[i] as T, s];
}

/** 確率 p で true */
export function chance(state: RngState, p: number): [boolean, RngState] {
  const [v, s] = next(state);
  return [v < p, s];
}

export interface Weighted<T> {
  readonly item: T;
  readonly weight: number;
}

/** 重みに比例した確率で1つ選ぶ。重みは0以上で、合計は正でなければならない */
export function weighted<T>(state: RngState, entries: readonly Weighted<T>[]): [T, RngState] {
  let total = 0;
  for (const e of entries) {
    if (!(e.weight >= 0)) throw new RangeError(`weighted: 不正な重み ${e.weight}`);
    total += e.weight;
  }
  if (!(total > 0)) throw new RangeError('weighted: 重みの合計が0');
  const [v, s] = next(state);
  let r = v * total;
  for (const e of entries) {
    if (r < e.weight) return [e.item, s];
    r -= e.weight;
  }
  // 浮動小数の誤差で末尾を越えた場合は、重みが正の最後の要素にする
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i] as Weighted<T>;
    if (e.weight > 0) return [e.item, s];
  }
  throw new RangeError('weighted: 重みの合計が0');
}

/**
 * 1回の step の中で乱数を続けて引くためのカーソル。
 * 呼び出し側のローカルな可変オブジェクトで、最後に `state` を GameState へ書き戻す。
 */
export interface RngCursor {
  readonly state: RngState;
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  weighted<T>(entries: readonly Weighted<T>[]): T;
}

export function createRngCursor(initial: RngState): RngCursor {
  let s = initial;
  const draw = <V>([v, n]: [V, RngState]): V => {
    s = n;
    return v;
  };
  return {
    get state() {
      return s;
    },
    next: () => draw(next(s)),
    int: (min, max) => draw(int(s, min, max)),
    pick: (items) => draw(pick(s, items)),
    chance: (p) => draw(chance(s, p)),
    weighted: (entries) => draw(weighted(s, entries)),
  };
}
