import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { rankOf } from '../../src/view/rank';

/** ランク（S / A / B / C）の境界値。基準は balance.result.rank（人間だけの見込みに対する倍率の下限） */
describe('ランクの境界', () => {
  const base = 10_000;
  const { S, A, B } = balance.result.rank;
  const eps = 1e-9;

  it.each([
    [S, 'S'],
    [S - eps, 'A'],
    [A, 'A'],
    [A - eps, 'B'],
    [B, 'B'],
    [B - eps, 'C'],
    [1, 'C'],
  ] as const)('人間だけの見込みの %s 倍 → %s', (ratio, rank) => {
    expect(rankOf(base * ratio, base, true)).toBe(rank);
  });

  it('基準は S > A > B > 1 の順に並ぶ', () => {
    expect(S).toBeGreaterThan(A);
    expect(A).toBeGreaterThan(B);
    expect(B).toBeGreaterThan(1);
  });

  it('納品していない・利益が出ていない・基準がなければ C', () => {
    expect(rankOf(base * S, base, false)).toBe('C');
    expect(rankOf(0, base, true)).toBe('C');
    expect(rankOf(-base, base, true)).toBe('C');
    expect(rankOf(base, 0, true)).toBe('C');
  });
});
