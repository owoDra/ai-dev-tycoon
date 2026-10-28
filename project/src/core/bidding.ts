import { balance } from '../content/balance';
import { getProject } from '../content/index';
import type { ProjectDef } from '../content/types';
import { priceWarCut } from './companyEvents';
import type { GameEvent } from './events';
import { hashSeed } from './rng';
import { scoreProject } from './scoring';
import { createProjectRun, type GameState } from './state';
import { triangular } from './talent';

/*
 * コンペ（案件ボードの引き合いへの見積）。見積額は 見積人日 × 平均売値 を基準に値引き・上乗せし、納期も提案する。
 * 勝率は、見積額の安さと提案力（評判・同業種の実績・AI 体制）と納期の提案を、seed から決まる競合と比べて決める。
 * 勝率は見積を出した時点で決まり（表示した値のまま）、締切に state の乱数で勝敗を決める。受注したら売上 = 見積額。
 * 納品のたびに、納期と品質で評判が変わる（rateDelivery）。
 */

export type PriceStep = keyof typeof balance.bid.prices;
export type DeadlineStep = keyof typeof balance.bid.deadlines;

export const priceSteps = Object.keys(balance.bid.prices) as PriceStep[];
export const deadlineSteps = Object.keys(balance.bid.deadlines) as DeadlineStep[];

/** 出した見積 */
export interface BidRun {
  readonly price: PriceStep;
  readonly deadline: DeadlineStep;
  /** 見積額（円）。受注したらこれが売上になる */
  readonly amount: number;
  /** 提案した納期（営業日） */
  readonly deadlineDays: number;
  /** 見積を出した時点の勝率（0〜1）。締切の判定はこの値で行う */
  readonly winChance: number;
}

/** 応募の締切前の引き合い */
export interface InquiryRun {
  /** 生成した案件の id（core/projectGen.ts） */
  readonly projectId: string;
  /** 届いた営業日 */
  readonly postedDay: number;
  /** 応募の締切（ゲーム内時刻、分）。この時刻に結果が出る */
  readonly closesAt: number;
  readonly bid: BidRun | null;
}

/** コンペの結果 */
export interface BidResult {
  readonly projectId: string;
  readonly won: boolean;
  readonly amount: number;
  readonly winChance: number;
  readonly at: number;
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

/** 見積人日（請求の人日）。市場の標準価格を平均売値で割り、balance.bid.personDayStep に丸める */
export function estimatePersonDays(def: ProjectDef): number {
  return Math.max(
    balance.bid.personDayStep,
    roundTo(def.revenue / balance.talent.rate.mean, balance.bid.personDayStep),
  );
}

/** 見積の基準額（円）= 見積人日 × 平均売値 */
export const baseAmount = (def: ProjectDef) => estimatePersonDays(def) * balance.talent.rate.mean;

/** 見積額（円） */
export function bidAmount(def: ProjectDef, price: PriceStep): number {
  return roundTo(baseAmount(def) * balance.bid.prices[price], balance.bid.amountStep);
}

/** 標準の納期（営業日）から、提案する納期（営業日）。1日以上 */
export function bidDeadlineDays(standard: number, deadline: DeadlineStep): number {
  return Math.max(1, Math.round(standard * balance.bid.deadlines[deadline]));
}

/** 提案する納期（営業日） */
export const bidDeadline = (def: ProjectDef, deadline: DeadlineStep) => bidDeadlineDays(def.deadlineDays, deadline);

/** 同業種で納品した案件の数（生成した案件の業種で数える） */
export function industryTrack(state: GameState, def: ProjectDef): number {
  const industry = def.brief?.industry;
  if (industry === undefined) return 0;
  const live = Object.values(state.projects).filter(
    (p) => p.completedAt !== null && getProject(p.projectId).brief?.industry === industry,
  ).length;
  return (state.ledger.industries[industry] ?? 0) + live;
}

/** 提案力の内訳（どれも 0〜1）と合計 */
export interface Proposal {
  readonly reputation: number;
  readonly track: number;
  readonly ai: number;
  readonly total: number;
}

/**
 * 提案力。評判（0〜100 を 0〜1 に）・同業種の実績・AI 体制（会社の資産になった Harness 部品と、Workflow Library に保存した Workflow の数）を
 * balance.bid.proposal の重みで足す
 */
export function proposalOf(state: GameState, def: ProjectDef): Proposal {
  const p = balance.bid.proposal;
  const range = balance.reputation.max - balance.reputation.min;
  const reputation = (state.reputation - balance.reputation.min) / range;
  const track = Math.min(1, industryTrack(state, def) / p.trackCap);
  const ai = Math.min(1, (state.ownedParts.length + state.library.length) / p.aiCap);
  return { reputation, track, ai, total: reputation * p.reputation + track * p.track + ai * p.ai };
}

/** 競合1社の見積（価格の比・提案力・納期の比） */
export interface Rival {
  readonly price: number;
  readonly proposal: number;
  readonly deadline: number;
}

/** 競合（案件の id から決まる。state の乱数は使わない） */
export function rivalsOf(def: ProjectDef): Rival[] {
  const r = balance.bid.rival;
  let rng = hashSeed(`rivals:${def.id}`);
  return Array.from({ length: def.brief?.rivals ?? 0 }, () => {
    const [price, s1] = triangular(rng, r.price);
    const [proposal, s2] = triangular(s1, r.proposal);
    const [deadline, s3] = triangular(s2, r.deadline);
    rng = s3;
    return { price, proposal, deadline };
  });
}

/** 発注者の性格の重みでの評価。安いほど・提案力が高いほど・納期が短いほど高い */
function appraise(def: ProjectDef, bid: Rival): number {
  const w = balance.bid.focus[def.brief?.focus ?? 'price'];
  return -bid.price * w.price + bid.proposal * w.proposal - bid.deadline * w.deadline;
}

/**
 * 勝率（0〜1）。予算の上限を超える見積は選ばれない（競合も同じ）。
 * 残った各社の評価を exp(評価 / temperature) にして、プレイヤーの割合を勝率にする
 */
export function winChance(state: GameState, def: ProjectDef, amount: number, deadlineDays: number): number {
  const brief = def.brief;
  if (!brief || amount > brief.budget) return 0;
  const t = balance.bid.temperature;
  const weight = (bid: Rival) => Math.exp(appraise(def, bid) / t);
  const own = weight({
    price: amount / def.revenue - 1,
    proposal: proposalOf(state, def).total,
    deadline: deadlineDays / def.deadlineDays - 1,
  });
  // 競合の値下げ（core/companyEvents.ts）の間は、競合がみな価格の比を下げてくる
  const cut = priceWarCut(state);
  const rivals = rivalsOf(def)
    .map((r) => ({ ...r, price: r.price - cut }))
    .filter((r) => def.revenue * (1 + r.price) <= brief.budget)
    .reduce((sum, r) => sum + weight(r), 0);
  return own / (own + rivals);
}

/** 見積の試算（案件ボードで、出す前に勝率を見せる。出した見積もこの値になる） */
export function quoteBid(state: GameState, projectId: string, price: PriceStep, deadline: DeadlineStep): BidRun {
  const def = getProject(projectId);
  const amount = bidAmount(def, price);
  const deadlineDays = bidDeadline(def, deadline);
  return { price, deadline, amount, deadlineDays, winChance: winChance(state, def, amount, deadlineDays) };
}

/** 見積を出せない理由。出せるなら null */
export function bidBlock(state: GameState, projectId: string): 'notOpen' | 'tutorial' | null {
  if (state.tutorial) return 'tutorial';
  const inquiry = state.board?.inquiries.find((i) => i.projectId === projectId);
  return inquiry && inquiry.closesAt > state.clock ? null : 'notOpen';
}

/** 見積を出す（締切までは出し直せる）。出せなければ state をそのまま返す */
export function submitBid(state: GameState, projectId: string, price: PriceStep, deadline: DeadlineStep): GameState {
  const board = state.board;
  if (!board || bidBlock(state, projectId) !== null) return state;
  const bid = quoteBid(state, projectId, price, deadline);
  const inquiries = board.inquiries.map((i) => (i.projectId === projectId ? { ...i, bid } : i));
  return { ...state, board: { ...board, inquiries } };
}

/**
 * 締切を迎えた引き合いの結果を出す。見積を出していれば、出したときの勝率で勝敗を決め（乱数は random から1つ引く）、
 * 受注したら見積額と提案した納期で案件を始める。見積を出していない引き合いは見送ったことにして消す（InquiryPassed で知らせる）
 */
export function closeInquiries(state: GameState, random: () => number, emit: (e: GameEvent) => void): GameState {
  const board = state.board;
  if (!board) return state;
  const due = board.inquiries.filter((i) => i.closesAt <= state.clock);
  if (due.length === 0) return state;
  let projects = state.projects;
  const results: BidResult[] = [];
  for (const inquiry of due) {
    const bid = inquiry.bid;
    if (!bid) {
      emit({ type: 'InquiryPassed', projectId: inquiry.projectId });
      continue;
    }
    const won = random() < bid.winChance;
    const result = { projectId: inquiry.projectId, won, amount: bid.amount, winChance: bid.winChance, at: state.clock };
    results.unshift(result);
    if (won) {
      const terms = { revenue: bid.amount, deadlineDays: bid.deadlineDays };
      projects = { ...projects, [inquiry.projectId]: createProjectRun(inquiry.projectId, state.clock, terms) };
      emit({ type: 'BidWon', projectId: inquiry.projectId, amount: bid.amount });
    } else {
      emit({ type: 'BidLost', projectId: inquiry.projectId });
    }
  }
  const inquiries = board.inquiries.filter((i) => i.closesAt > state.clock);
  const history = [...results, ...board.results].slice(0, balance.board.history);
  return { ...state, projects, board: { ...board, inquiries, results: history } };
}

/** 納品による評判の変化（納期と品質）。納品していない案件は 0 */
export function deliveryRating(state: GameState, projectId: string): number {
  const run = state.projects[projectId];
  const score = scoreProject(state, projectId);
  if (!run || !score?.completed) return 0;
  const r = balance.reputation;
  const day = balance.time.minutesPerDay;
  const lateDays = Math.ceil(Math.max(0, score.elapsedMinutes - run.deadlineDays * day) / day);
  const timing = lateDays > 0 ? -lateDays * r.perLateDay : r.onTime;
  return timing + (score.quality - r.qualityPivot) * r.perQuality;
}

/** 納品した案件で評判を変える（案件ボードのある会社だけ） */
export function rateDelivery(state: GameState, projectId: string, emit: (e: GameEvent) => void): GameState {
  if (!state.board) return state;
  const r = balance.reputation;
  const reputation = Math.min(r.max, Math.max(r.min, state.reputation + deliveryRating(state, projectId)));
  emit({ type: 'ReputationChanged', projectId, delta: reputation - state.reputation, reputation });
  return { ...state, reputation };
}
