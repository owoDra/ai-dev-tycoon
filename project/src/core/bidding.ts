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
 * 見積を出すと、その場で表示した勝率のまま state の乱数で勝敗を決める（結果を待たない）。受注したら売上 = 見積額。
 * 見積を出さずに応募の締切を迎えた引き合いは見送りになる。
 * 納品のたびに、納期と品質で評判が変わる（rateDelivery）。
 */

export type PriceStep = keyof typeof balance.bid.prices;
export type DeadlineStep = keyof typeof balance.bid.deadlines;

export const priceSteps = Object.keys(balance.bid.prices) as PriceStep[];
export const deadlineSteps = Object.keys(balance.bid.deadlines) as DeadlineStep[];

/** 見積（試算、または出した見積） */
export interface BidRun {
  readonly price: PriceStep;
  readonly deadline: DeadlineStep;
  /** 見積額（円）。受注したらこれが売上になる */
  readonly amount: number;
  /** 提案した納期（営業日） */
  readonly deadlineDays: number;
  /** 勝率（0〜1）。見積を出したらこの値で勝敗を決める */
  readonly winChance: number;
}

/** 応募の締切前で、まだ見積を出していない引き合い */
export interface InquiryRun {
  /** 生成した案件の id（core/projectGen.ts） */
  readonly projectId: string;
  /** 届いた営業日 */
  readonly postedDay: number;
  /** 応募の締切（ゲーム内時刻、分）。それまでに見積を出さなければ見送りになる */
  readonly closesAt: number;
}

/** コンペの結果。won：受注 / lost：失注 / passed：見積を出さずに締切を迎えた（見送り） */
export type BidOutcome = 'won' | 'lost' | 'passed';

/** コンペの結果。見送りは金額と勝率が 0 */
export interface BidResult {
  readonly projectId: string;
  readonly outcome: BidOutcome;
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

/**
 * 標準の納期（営業日）から、提案する納期（営業日）。倍率を掛けて丸め、短縮は標準より1日以上短く、余裕は1日以上長くする
 * （短い案件で、丸めると3つとも同じ日数になるのを防ぐ）。1日以上
 */
export function bidDeadlineDays(standard: number, deadline: DeadlineStep): number {
  const ratio = balance.bid.deadlines[deadline];
  const scaled = Math.round(standard * ratio);
  if (ratio < 1) return Math.max(1, Math.min(scaled, standard - 1));
  if (ratio > 1) return Math.max(scaled, standard + 1);
  return standard;
}

/** その納期の選択肢を出せるか。標準の納期が1日の案件は、それより短くできないので短縮を出さない */
export const deadlineOffered = (standard: number, deadline: DeadlineStep) =>
  balance.bid.deadlines[deadline] >= 1 || standard > 1;

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

/** 結果の履歴の先頭に足し、balance.board.history 件に収める */
const withResults = (state: GameState, results: readonly BidResult[]) =>
  [...results, ...(state.board?.results ?? [])].slice(0, balance.board.history);

/**
 * 見積を出し、その場で結果を出す。勝敗は見積の勝率で決め（乱数は random から1つ引く）、受注したら見積額と提案した納期で案件を始める。
 * 引き合いはボードから外し、結果の履歴に残す。出せなければ（出せない納期の選択肢を含む）state をそのまま返す
 */
export function submitBid(
  state: GameState,
  projectId: string,
  price: PriceStep,
  deadline: DeadlineStep,
  random: () => number,
  emit: (e: GameEvent) => void,
): GameState {
  const board = state.board;
  if (!board || bidBlock(state, projectId) !== null) return state;
  if (!deadlineOffered(getProject(projectId).deadlineDays, deadline)) return state;
  const bid = quoteBid(state, projectId, price, deadline);
  emit({ type: 'BidSubmitted', projectId, amount: bid.amount, winChance: bid.winChance });
  const won = random() < bid.winChance;
  const result: BidResult = {
    projectId,
    outcome: won ? 'won' : 'lost',
    amount: bid.amount,
    winChance: bid.winChance,
    at: state.clock,
  };
  let projects = state.projects;
  if (won) {
    const terms = { revenue: bid.amount, deadlineDays: bid.deadlineDays };
    projects = { ...projects, [projectId]: createProjectRun(projectId, state.clock, terms) };
    emit({ type: 'BidWon', projectId, amount: bid.amount });
  } else {
    emit({ type: 'BidLost', projectId });
  }
  const inquiries = board.inquiries.filter((i) => i.projectId !== projectId);
  return { ...state, projects, board: { ...board, inquiries, results: withResults(state, [result]) } };
}

/** 見積を出さずに締切を迎えた引き合いを見送ったことにして消し、結果の履歴に残す（InquiryPassed で知らせる） */
export function closeInquiries(state: GameState, emit: (e: GameEvent) => void): GameState {
  const board = state.board;
  if (!board) return state;
  const due = board.inquiries.filter((i) => i.closesAt <= state.clock);
  if (due.length === 0) return state;
  const results: BidResult[] = [];
  for (const inquiry of due) {
    emit({ type: 'InquiryPassed', projectId: inquiry.projectId });
    results.unshift({ projectId: inquiry.projectId, outcome: 'passed', amount: 0, winChance: 0, at: state.clock });
  }
  const inquiries = board.inquiries.filter((i) => i.closesAt > state.clock);
  return { ...state, board: { ...board, inquiries, results: withResults(state, results) } };
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
