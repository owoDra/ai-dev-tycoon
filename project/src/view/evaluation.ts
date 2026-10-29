import { balance } from '../content/balance';
import { getProject } from '../content/index';
import type { AssignModeId } from '../content/types';
import { monthlyPace, personDays } from '../core/formulas';
import { deliveryRatingParts, reputationPriceFactor } from '../core/orders';
import { scoreCompany, scoreProject } from '../core/scoring';
import type { GameState } from '../core/state';

/*
 * 評価のしくみを見せる（Phase 39）。納品のたびに「利益がどう決まり、評判がなぜ動いたか、次にどこを直すか」を、
 * 会社の帯からは「品質・納期 → 評判 → 受注額・昇格」「利益 ÷ 人日 → 月の利益ペース」のつながりを、いまの数字で出す。
 * 計算は core（scoring・orders）の式をそのまま使い、ここでは並べ替えるだけにする
 */

/** 利益の式の1行。revenue は足し、ほかは引く */
export type ProfitLineId = 'revenue' | 'labor' | 'ai' | 'rework' | 'other';

/** 品質が一番低かった工程（次に直す場所） */
export interface WeakSpot {
  readonly task: string;
  readonly mode: AssignModeId;
  readonly quality: number;
}

export interface DeliveryBreakdown {
  readonly lines: readonly { readonly id: ProfitLineId; readonly amount: number }[];
  readonly profit: number;
  /** 人間の総稼働（人日） */
  readonly personDays: number;
  /** 1人あたりの月の利益ペース（利益 ÷ 人日 × 月の稼働日数） */
  readonly pace: number;
  /** 評判の変化の内訳（案件ボードのない単発のプレイでは null） */
  readonly reputation: { readonly timing: number; readonly quality: number; readonly total: number } | null;
  /** 評判が上がる品質の基準（0〜1） */
  readonly qualityPivot: number;
  /** 品質が基準を下回った工程のうち、一番低いもの。どれも基準以上なら null */
  readonly weakest: WeakSpot | null;
}

/** 納品した案件の評価の内訳。納品していなければ null */
export function deliveryBreakdown(state: GameState, projectId: string): DeliveryBreakdown | null {
  const score = scoreProject(state, projectId);
  const run = state.projects[projectId];
  if (!score?.completed || !run) return null;
  const pivot = balance.reputation.qualityPivot;
  const parts = state.board ? deliveryRatingParts(state, projectId) : null;
  let weakest: WeakSpot | null = null;
  for (const task of getProject(projectId).tasks) {
    const t = run.tasks[task.id];
    if (t?.status !== 'done' || t.quality === null || !t.assignment || t.quality >= pivot) continue;
    if (!weakest || t.quality < weakest.quality) {
      weakest = { task: task.name, mode: t.assignment.mode, quality: t.quality };
    }
  }
  return {
    lines: [
      { id: 'revenue', amount: score.revenue },
      { id: 'labor', amount: score.laborCost },
      { id: 'ai', amount: score.aiCost },
      { id: 'rework', amount: score.reworkCost },
      { id: 'other', amount: score.harnessCost + score.accidentCost + score.managementCost },
    ],
    profit: score.profit,
    personDays: personDays(score.humanMinutes),
    pace: monthlyPace(score.profitPerPersonDay),
    reputation: parts ? { ...parts, total: parts.timing + parts.quality } : null,
    qualityPivot: pivot,
    weakest,
  };
}

/** 評価のしくみ（会社の帯から開く1枚の図）に入れる、いまの数字 */
export interface EvaluationGuide {
  /** 納期内に納品したときの評判の加点 */
  readonly onTime: number;
  /** 評判が上がる品質の基準（0〜1） */
  readonly qualityPivot: number;
  /** 品質1%あたりの評判の増減 */
  readonly perQualityPoint: number;
  readonly reputation: number;
  /** 評判による受注額の補正（+0.06 なら標準価格の6%増し） */
  readonly priceEffect: number;
  /** 会社の累計の1人あたりの月の利益ペース */
  readonly pace: number;
}

export function evaluationGuide(state: GameState): EvaluationGuide {
  const r = balance.reputation;
  return {
    onTime: r.onTime,
    qualityPivot: r.qualityPivot,
    perQualityPoint: r.perQuality / 100,
    reputation: state.reputation,
    priceEffect: reputationPriceFactor(state.reputation) - 1,
    pace: monthlyPace(scoreCompany(state).profitPerPersonDay),
  };
}
