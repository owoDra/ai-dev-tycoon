import { corporateSite } from './projects/corporate-site';
import { ecRenewal } from './projects/ec-renewal';
import { internalTool } from './projects/internal-tool';
import { paymentFix } from './projects/payment-fix';
import { promoLp } from './projects/promo-lp';
import { saasFeature } from './projects/saas-feature';
import type { IndustryId, ProjectTemplateDef } from './types';

/**
 * 案件の型（core/projectGen.ts が業種と規模を掛け合わせて案件を生成する）。新しい種類の案件は、ここに型を足す。
 * 型の id で引くと規模 M・補正なしの「標準の案件」になる（タイトル画面の背景・開発用ページ・仕組みのテストに使う）
 */
export const projectTemplates: readonly ProjectTemplateDef[] = [
  ecRenewal,
  paymentFix,
  corporateSite,
  saasFeature,
  internalTool,
  promoLp,
];

/**
 * 業種による Task の性質の補正（足す量。0〜1 に収める）と、市場の標準価格の倍率。
 * 決済は品質要求と失敗リスクが高く価格も高い。社内システムは品質要求が低く安い
 */
export interface IndustryDef {
  readonly id: IndustryId;
  readonly qualityReq: number;
  readonly failRisk: number;
  readonly aiAptitude: number;
  readonly price: number;
}

export const industries: readonly IndustryDef[] = [
  { id: 'ec', qualityReq: 0, failRisk: 0, aiAptitude: 0, price: 1 },
  { id: 'saas', qualityReq: 0, failRisk: 0, aiAptitude: 0.05, price: 1.05 },
  { id: 'internal', qualityReq: -0.1, failRisk: -0.05, aiAptitude: 0, price: 0.85 },
  { id: 'media', qualityReq: -0.05, failRisk: 0, aiAptitude: 0.05, price: 0.9 },
  { id: 'payment', qualityReq: 0.1, failRisk: 0.05, aiAptitude: -0.05, price: 1.25 },
];

export function getIndustry(id: IndustryId): IndustryDef {
  const d = industries.find((x) => x.id === id);
  if (!d) throw new Error(`未定義の業種: ${id}`);
  return d;
}

export function findTemplate(id: string): ProjectTemplateDef | undefined {
  return projectTemplates.find((t) => t.id === id);
}
