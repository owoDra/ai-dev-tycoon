import { balance } from '../content/balance';

/** 結果のランク（企画書59章の結果画面のスタンプ） */
export type Rank = 'S' | 'A' | 'B' | 'C';

/**
 * ランクを決める。Profit / Person-Day が人間だけで進めた場合の見込み（baseline）の何倍になったかを、
 * balance.result.rank の下限と上から順に比べる。納品していない・利益が出ていない・比べる基準がなければ C
 */
export function rankOf(profitPerPersonDay: number, baseline: number, completed: boolean): Rank {
  if (!completed || profitPerPersonDay <= 0 || baseline <= 0) return 'C';
  const ratio = profitPerPersonDay / baseline;
  const { S, A, B } = balance.result.rank;
  if (ratio >= S) return 'S';
  if (ratio >= A) return 'A';
  if (ratio >= B) return 'B';
  return 'C';
}
