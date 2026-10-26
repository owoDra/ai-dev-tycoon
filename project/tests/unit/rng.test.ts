import { describe, expect, it } from 'vitest';
import { chance, createRngCursor, hashSeed, int, next, pick, type RngState, weighted } from '../../src/core/rng';

function sequence(seed: string, n: number): number[] {
  const out: number[] = [];
  let s: RngState = hashSeed(seed);
  for (let i = 0; i < n; i++) {
    const [v, ns] = next(s);
    out.push(v);
    s = ns;
  }
  return out;
}

describe('rng', () => {
  it('同じ seed からは同じ数列になる', () => {
    expect(sequence('office-42', 100)).toEqual(sequence('office-42', 100));
  });

  it('seed が違えば数列が違う', () => {
    expect(sequence('office-42', 100)).not.toEqual(sequence('office-43', 100));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });

  it('関数は純粋で、同じ状態からは同じ値と次の状態を返す', () => {
    const s = hashSeed('pure');
    expect(next(s)).toEqual(next(s));
  });

  it('next は [0, 1) に収まる', () => {
    for (const v of sequence('range', 10_000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int は min 以上 max 以下に収まり、両端も出る', () => {
    let s = hashSeed('int');
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i++) {
      const [v, ns] = int(s, -3, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
      s = ns;
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  it('int は min === max なら常にその値', () => {
    expect(int(hashSeed('x'), 5, 5)[0]).toBe(5);
  });

  it('int は不正な範囲で例外を投げる', () => {
    expect(() => int(0, 3, 1)).toThrow(RangeError);
    expect(() => int(0, 0.5, 2)).toThrow(RangeError);
  });

  it('pick は配列の要素を返す', () => {
    const items = ['a', 'b', 'c'] as const;
    let s = hashSeed('pick');
    for (let i = 0; i < 100; i++) {
      const [v, ns] = pick(s, items);
      expect(items).toContain(v);
      s = ns;
    }
  });

  it('chance は 0 で常に false、1 で常に true', () => {
    let s = hashSeed('chance');
    for (let i = 0; i < 100; i++) {
      expect(chance(s, 0)[0]).toBe(false);
      expect(chance(s, 1)[0]).toBe(true);
      s = next(s)[1];
    }
  });

  it('weighted は重み0の要素を選ばず、重みにおおむね比例する', () => {
    const entries = [
      { item: 'zero', weight: 0 },
      { item: 'one', weight: 1 },
      { item: 'three', weight: 3 },
    ] as const;
    const cursor = createRngCursor(hashSeed('weighted'));
    const counts = { zero: 0, one: 0, three: 0 };
    for (let i = 0; i < 8_000; i++) counts[cursor.weighted(entries)] += 1;
    expect(counts.zero).toBe(0);
    expect(counts.three / counts.one).toBeGreaterThan(2.6);
    expect(counts.three / counts.one).toBeLessThan(3.4);
  });

  it('weighted は重みの合計が0なら例外を投げる', () => {
    expect(() => weighted(0, [{ item: 'a', weight: 0 }])).toThrow(RangeError);
    expect(() => weighted(0, [])).toThrow(RangeError);
  });

  it('カーソルは純粋関数を順に呼んだのと同じ結果と状態になる', () => {
    const s0 = hashSeed('cursor');
    const cursor = createRngCursor(s0);
    const a = cursor.int(1, 6);
    const b = cursor.next();
    const [ea, s1] = int(s0, 1, 6);
    const [eb, s2] = next(s1);
    expect([a, b]).toEqual([ea, eb]);
    expect(cursor.state).toBe(s2);
  });
});
