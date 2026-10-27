import { companyTiers, getCompanyTier } from '../content/companyTiers';
import type { CompanyTierDef } from '../content/types';
import type { GameEvent } from './events';
import { scoreCompany } from './scoring';
import type { GameState } from './state';

/*
 * 会社の規模（content/companyTiers.ts）。案件ボードのある会社は、納品のたびに次の段階の条件（累計の会社の利益・評判・納品数）を判定し、
 * すべて満たしたら昇格する。段階ごとに人員・AI Worker・チーム数の上限、管理者、引き合いの数と規模、採用候補の数、オフィスの固定費が変わる。
 */

/** 今の段階 */
export const tierOf = (state: GameState): CompanyTierDef => getCompanyTier(state.tier);

/** 次の段階。最上位なら null */
export function nextTier(state: GameState): CompanyTierDef | null {
  const i = companyTiers.findIndex((t) => t.id === state.tier);
  return companyTiers[i + 1] ?? null;
}

/** 昇格の条件の項目ごとの、今の値と必要な値 */
export interface PromotionProgress {
  readonly tier: CompanyTierDef;
  readonly profit: { readonly now: number; readonly need: number };
  readonly reputation: { readonly now: number; readonly need: number };
  readonly delivered: { readonly now: number; readonly need: number };
  readonly ready: boolean;
}

/** 次の段階への昇格の条件と今の値。最上位なら null */
export function promotionProgress(state: GameState): PromotionProgress | null {
  const tier = nextTier(state);
  if (!tier) return null;
  const company = scoreCompany(state);
  const r = tier.requires;
  const profit = { now: company.profit, need: r.profit };
  const reputation = { now: state.reputation, need: r.reputation };
  const delivered = { now: company.delivered, need: r.delivered };
  const ready = profit.now >= profit.need && reputation.now >= reputation.need && delivered.now >= delivered.need;
  return { tier, profit, reputation, delivered, ready };
}

/**
 * 条件を満たしていれば昇格する（案件ボードのある会社だけ。条件を満たす限り続けて上がる）。
 * 昇格したら CompanyPromoted を出し、新しい段階の採用候補の数に市場を合わせるのは翌営業日（core/team.ts の marketSystem）
 */
export function promote(state: GameState, emit: (e: GameEvent) => void): GameState {
  if (!state.board) return state;
  let next = state;
  for (let p = promotionProgress(next); p?.ready; p = promotionProgress(next)) {
    const from = next.tier;
    next = { ...next, tier: p.tier.id };
    emit({ type: 'CompanyPromoted', from, tier: p.tier.id });
  }
  return next;
}
