import { balance } from '../content/balance';
import { getHuman } from '../content/index';
import { seats } from '../content/seats';
import type { HumanWorkerDef, SeatDef, SeatId, TaskDef } from '../content/types';
import { businessDay } from './clock';
import { tierOf } from './company';
import type { GameState, StaffRun } from './state';
import type { System } from './system';
import { marketCandidates } from './talent';
import { dropMember, staffBusy } from './teams';

/*
 * 社員と Seat（企画書6章）・採用市場。Seat は会社が種類ごとに枚数で買い、AI Worker と AI PM はその使用量の合計から消費する。
 * 使い切ると AI は翌営業日まで止まる。Seat の固定費と待機中の社員の給与は日割りで、会社が営業しているときだけ計上する（companyOpen）。
 */

/** 会社にいる社員（入社した順） */
export function teamMembers(state: GameState): HumanWorkerDef[] {
  return Object.keys(state.team).map(getHuman);
}

export function inTeam(state: GameState, staffId: string): boolean {
  return state.team[staffId] !== undefined;
}

/** Seat の1営業日あたりの固定費（円、1枚分）。月額を日割りにする */
export function seatDailyCost(seat: SeatDef): number {
  return (seat.monthlyUsd * balance.seat.yenPerUsd) / balance.seat.businessDaysPerMonth;
}

/** Seat の月額（円、1枚分） */
export function seatMonthlyCost(seat: SeatDef): number {
  return seat.monthlyUsd * balance.seat.yenPerUsd;
}

/** 会社が買っている Seat の1営業日あたりの固定費の合計（円） */
export function seatsDailyCost(state: GameState): number {
  return seats.reduce((sum, s) => sum + seatDailyCost(s) * state.seats[s.id], 0);
}

/** 会社の AI の1営業日の使用量の上限。買っている Seat の枚数 × 1枚の使用量の合計 */
export function usageLimit(state: GameState): number {
  return seats.reduce((sum, s) => sum + s.dailyUsage * state.seats[s.id], 0);
}

/** 今日の使用量が上限に達していて、AI（AI Worker と AI PM）が止まっているか。Seat が0枚なら常に止まっている */
export function overLimit(state: GameState): boolean {
  return state.usage >= usageLimit(state);
}

/** AI が使用量を amount だけ使う（会社の Seat の使用量から減らす） */
export function consumeUsage(state: GameState, amount: number): GameState {
  return amount > 0 ? { ...state, usage: state.usage + amount } : state;
}

/** Seat の枚数を変える。0 以上の整数でなければ、同じ枚数なら state をそのまま返す */
export function setSeats(state: GameState, seat: SeatId, count: number): GameState {
  if (!Number.isInteger(count) || count < 0 || state.seats[seat] === count) return state;
  return { ...state, seats: { ...state.seats, [seat]: count } };
}

/** 社員を迎える。人間の待ち行列も用意する */
export function joinTeam(state: GameState, staffId: string): GameState {
  if (inTeam(state, staffId)) return state;
  const run: StaffRun = {};
  return {
    ...state,
    team: { ...state.team, [staffId]: run },
    humanQueues: { ...state.humanQueues, [staffId]: state.humanQueues[staffId] ?? [] },
  };
}

/** 採用の契約金（円）。売値の balance.hire.signingDays 人日分 */
export function signingFee(staffId: string): number {
  return getHuman(staffId).dailyRate * balance.hire.signingDays;
}

/** 人員の上限（会社の規模で決まる）に達しているか */
export const teamFull = (state: GameState) => Object.keys(state.team).length >= tierOf(state).maxStaff;

/** 採用できない理由。採用できるなら null */
export function hireBlock(state: GameState, staffId: string): 'notCandidate' | 'full' | null {
  if (!state.market.candidates.includes(staffId) || inTeam(state, staffId)) return 'notCandidate';
  return teamFull(state) ? 'full' : null;
}

/** 採用する。契約金を払い、候補から外して入社させる。採用できなければ state をそのまま返す */
export function hire(state: GameState, staffId: string): GameState {
  if (hireBlock(state, staffId) !== null) return state;
  const market = { ...state.market, candidates: state.market.candidates.filter((id) => id !== staffId) };
  return joinTeam({ ...state, market, hireCost: state.hireCost + signingFee(staffId) }, staffId);
}

/**
 * 退職できない理由。退職できるなら null。
 * 担当が決まっている（終わっていない Task の担い手・人間の工程を処理中や待ち行列にいる）人と、最後の1人は退職できない
 */
export function releaseBlock(state: GameState, staffId: string): 'notMember' | 'busy' | 'last' | null {
  if (!inTeam(state, staffId)) return 'notMember';
  if (Object.keys(state.team).length <= 1) return 'last';
  return staffBusy(state, staffId) ? 'busy' : null;
}

/** 退職させる（チームからも外れ、人間 PM だったらそのチームの管理者もいなくなる）。退職できなければ state をそのまま返す */
export function release(state: GameState, staffId: string): GameState {
  if (releaseBlock(state, staffId) !== null) return state;
  const { [staffId]: _run, ...team } = state.team;
  const { [staffId]: _queue, ...humanQueues } = state.humanQueues;
  return dropMember({ ...state, team, humanQueues }, staffId);
}

/** 人間の工程の速さ。skill に、得意分野の Task なら balance.staff.strengthSpeed を掛ける */
export function humanSpeed(humanId: string, task: TaskDef): number {
  const h = getHuman(humanId);
  const strong = task.kind !== undefined && h.strengths.includes(task.kind);
  return h.skill * (strong ? balance.staff.strengthSpeed : 1);
}

/**
 * 会社が営業していて、Seat の固定費と待機中の給与がかかっているか。進行中の案件があるときと、
 * チュートリアルを終えた案件ボードのある会社（案件の合間に引き合いを待つ間も給与はかかる）。
 * 単発のプレイとチュートリアルでは、案件の合間を数えない
 */
export const companyOpen = (state: GameState) =>
  (state.board !== null && state.tutorial === null) ||
  Object.values(state.projects).some((p) => p.completedAt === null);

/**
 * Seat とオフィスの経済。営業日が変わったら使用量を 0 に戻し、会社が営業していれば Seat の固定費とオフィスの固定費（会社の規模で決まる）を
 * 日割りで計上する（単発のプレイとチュートリアルでは案件の合間は計上しない）。待機中の社員の給与は、人間の待ち行列の処理（core/humanQueueSystem.ts）が数える
 */
export const seatSystem: System = (state) => {
  let next = state;
  const day = businessDay(state.clock);
  if (day !== state.usageDay) next = { ...next, usage: 0, usageDay: day };
  if (!companyOpen(next)) return next;
  const perTick = balance.time.tickMinutes / balance.time.minutesPerDay;
  const office = tierOf(next).officeDaily * perTick;
  return { ...next, seatCost: next.seatCost + seatsDailyCost(next) * perTick, officeCost: next.officeCost + office };
};

/** 採用市場。営業日が変わったら、その日の候補（数は会社の規模で決まる）に入れ替える */
export const marketSystem: System = (state) => {
  const day = businessDay(state.clock);
  if (day === state.market.day) return state;
  const candidates = marketCandidates(state.seed, day, tierOf(state).candidates).filter((id) => !inTeam(state, id));
  return { ...state, market: { day, candidates } };
};
