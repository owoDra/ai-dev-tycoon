import { balance } from '../content/balance';
import { companyTiers, getCompanyTier, listedTier } from '../content/companyTiers';
import type { CompanyTierDef } from '../content/types';
import { ja } from '../i18n/ja';
import type { GameEvent } from './events';
import { scoreCompany } from './scoring';
import type { GameState } from './state';

/*
 * 会社の規模（content/companyTiers.ts）。最上位の段階の後は、格付け（★2, ★3, …）が条件を上げながら続く。案件ボードのある会社は、納品のたびに次の段階の条件（累計の会社の利益・評判・納品数）を判定し、
 * すべて満たしたら昇格する。段階ごとに人員・AI Worker・チーム数の上限、管理者、引き合いの数と規模、採用候補の数、オフィスの固定費が変わる。
 */

/** 上場しているか（会社の規模が上場の段階か、その後の格付け）。上場するまでは時価総額ではなく推定の企業価値と呼ぶ */
export function isListed(state: GameState): boolean {
  const order = companyTiers.map((t) => t.id);
  return order.indexOf(state.tier) >= order.indexOf(listedTier);
}

/**
 * 今の段階。大手の格付け（state.rank）があれば、オフィスの固定費と規模 XL の引き合いの重みを格付けの分だけ上げ、名前に ★ を付ける
 */
export function tierOf(state: GameState): CompanyTierDef {
  return rankedTier(getCompanyTier(state.tier), state.rank);
}

function rankedTier(tier: CompanyTierDef, rank: number): CompanyTierDef {
  if (rank <= 0) return tier;
  const r = balance.ranks;
  return {
    ...tier,
    name: ja.company.ranked(tier.name, rank + 1),
    officeDaily: tier.officeDaily + rank * r.officePerRank,
    sizes: { ...tier.sizes, XL: tier.sizes.XL + rank * r.xlPerRank },
  };
}

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
 * 最上位の段階での、次の格付け（★）の条件と今の値。最上位でなければ null。
 * 格付け n の条件は、最上位の条件に n × balance.ranks.perRank を足したもの（評判は balance.ranks.reputation 以上）
 */
export function rankProgress(state: GameState): PromotionProgress | null {
  if (nextTier(state)) return null;
  const top = getCompanyTier(state.tier);
  const rank = state.rank + 1;
  const r = balance.ranks;
  const company = scoreCompany(state);
  const profit = { now: company.profit, need: top.requires.profit + rank * r.perRank.profit };
  const reputation = { now: state.reputation, need: r.reputation };
  const delivered = { now: company.delivered, need: top.requires.delivered + rank * r.perRank.delivered };
  const ready = profit.now >= profit.need && reputation.now >= reputation.need && delivered.now >= delivered.need;
  return { tier: rankedTier(top, rank), profit, reputation, delivered, ready };
}

/** 次の目標（次の段階か、最上位なら次の格付け）。画面で常に見せる */
export const goalProgress = (state: GameState): PromotionProgress =>
  promotionProgress(state) ?? (rankProgress(state) as PromotionProgress);

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
  for (let p = rankProgress(next); p?.ready; p = rankProgress(next)) {
    next = { ...next, rank: next.rank + 1 };
    emit({ type: 'CompanyRanked', rank: next.rank });
  }
  return next;
}
