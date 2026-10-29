import { balance } from '../content/balance';
import { getCompanyTier } from '../content/companyTiers';
import { getProject } from '../content/index';
import { priceWarCut } from './companyEvents';
import type { GameEvent } from './events';
import { scoreProject } from './scoring';
import { createProjectRun, type GameState } from './state';

/*
 * 受注（案件ボードの引き合いから選ぶ）。コンペはなく、選べば必ず受注できる。
 * 届く案件の規模と数、同時に進められる数は会社の規模で決まる（balance.company.tiers の sizes・inquiries・maxProjects）。
 * 売上は案件の標準価格を評判で上下させ、競合の値下げ（core/companyEvents.ts）の間は下がる。納期は案件の標準の納期。
 * 選ばずに受付の締切を過ぎた引き合いは、ボードから消える。
 * 納品のたびに、納期と品質で評判が変わる（rateDelivery）。
 */

/** 案件ボードの引き合い（まだ受注していない案件） */
export interface InquiryRun {
  /** 生成した案件の id（core/projectGen.ts） */
  readonly projectId: string;
  /** 届いた営業日 */
  readonly postedDay: number;
  /** 受付の締切（ゲーム内時刻、分）。過ぎたらボードから消える */
  readonly closesAt: number;
}

/** 受注の条件（円・営業日） */
export interface OrderTerms {
  readonly revenue: number;
  readonly deadlineDays: number;
}

/** 同時に進められる案件の数（会社の規模で決まる） */
export const maxProjects = (state: GameState) => getCompanyTier(state.tier).maxProjects;

/** 進めている（まだ終わっていない）案件の数 */
export const runningProjects = (state: GameState) =>
  Object.values(state.projects).filter((p) => p.completedAt === null).length;

/**
 * 受注の条件。売上 = 標準価格 ×（1 + 評判の中央からのずれ × reputationWeight）×（1 − 競合の値下げ）を amountStep に丸める
 */
export function orderTerms(state: GameState, projectId: string): OrderTerms {
  const def = getProject(projectId);
  const o = balance.orders;
  const reputation = reputationPriceFactor(state.reputation);
  const revenue = Math.round((def.revenue * reputation * (1 - priceWarCut(state))) / o.amountStep) * o.amountStep;
  return { revenue, deadlineDays: def.deadlineDays };
}

/** 受注できない理由。受注できるなら null。tutorial：チュートリアル中 / notOpen：ボードにない / full：同時に進められる数に達した */
export function orderBlock(state: GameState, projectId: string): 'tutorial' | 'notOpen' | 'full' | null {
  if (state.tutorial) return 'tutorial';
  const inquiry = state.board?.inquiries.find((i) => i.projectId === projectId);
  if (!inquiry || inquiry.closesAt <= state.clock) return 'notOpen';
  return runningProjects(state) >= maxProjects(state) ? 'full' : null;
}

/** 引き合いを受注して案件を始める。受注できなければ state をそのまま返す */
export function acceptOrder(state: GameState, projectId: string, emit: (e: GameEvent) => void): GameState {
  const board = state.board;
  if (!board || orderBlock(state, projectId) !== null) return state;
  const terms = orderTerms(state, projectId);
  emit({ type: 'OrderAccepted', projectId, amount: terms.revenue });
  const projects = { ...state.projects, [projectId]: createProjectRun(projectId, state.clock, terms) };
  const inquiries = board.inquiries.filter((i) => i.projectId !== projectId);
  return { ...state, projects, board: { ...board, inquiries } };
}

/** 受付の締切を過ぎた引き合いをボードから消す */
export function expireInquiries(state: GameState): GameState {
  const board = state.board;
  if (!board || board.inquiries.every((i) => i.closesAt > state.clock)) return state;
  return { ...state, board: { ...board, inquiries: board.inquiries.filter((i) => i.closesAt > state.clock) } };
}

/** 納品による評判の変化の内訳。timing：納期内なら onTime、炎上していれば 0 / quality：（品質 − 基準）× perQuality */
export interface RatingParts {
  readonly timing: number;
  readonly quality: number;
}

/** 納品による評判の変化の内訳。納品していない案件は null */
export function deliveryRatingParts(state: GameState, projectId: string): RatingParts | null {
  const run = state.projects[projectId];
  const score = scoreProject(state, projectId);
  if (!run || !score?.completed) return null;
  const r = balance.reputation;
  return { timing: run.burningAt === null ? r.onTime : 0, quality: (score.quality - r.qualityPivot) * r.perQuality };
}

/**
 * 納品による評判の変化（納期と品質）。期限内なら上がり、炎上した案件は上がらない（炎上した時点で下がっている。core/contract.ts）。
 * 納品していない案件は 0
 */
export function deliveryRating(state: GameState, projectId: string): number {
  const parts = deliveryRatingParts(state, projectId);
  return parts ? parts.timing + parts.quality : 0;
}

/** 評判による受注額の補正（1 なら標準価格。orderTerms の評判の項） */
export function reputationPriceFactor(reputation: number): number {
  const r = balance.reputation;
  return 1 + ((reputation - r.initial) / (r.max - r.min)) * balance.orders.reputationWeight;
}

/** 納品した案件で評判を変える（案件ボードのある会社だけ） */
export function rateDelivery(state: GameState, projectId: string, emit: (e: GameEvent) => void): GameState {
  if (!state.board) return state;
  const r = balance.reputation;
  const reputation = Math.min(r.max, Math.max(r.min, state.reputation + deliveryRating(state, projectId)));
  emit({ type: 'ReputationChanged', projectId, delta: reputation - state.reputation, reputation });
  return { ...state, reputation };
}
