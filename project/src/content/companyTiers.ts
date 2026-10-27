import { ja } from '../i18n/ja';
import { balance } from './balance';
import type { CompanyTierDef, CompanyTierId } from './types';

/** 会社の規模の段階（昇格の順）。個人事業 → スタートアップ → 小規模 → 中堅 → 大手 */
export const companyTiers: readonly CompanyTierDef[] = (Object.keys(balance.company.tiers) as CompanyTierId[]).map(
  (id) => ({ id, name: ja.company.tiers[id], ...balance.company.tiers[id] }),
);

export function getCompanyTier(id: CompanyTierId): CompanyTierDef {
  const t = companyTiers.find((x) => x.id === id);
  if (!t) throw new Error(`未定義の会社の規模: ${id}`);
  return t;
}
