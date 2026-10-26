import { balance } from '../content/balance';
import { aiWorkers, findWorker, getHuman, humans } from '../content/index';
import { getSeat } from '../content/seats';
import type { HumanWorkerDef, SeatDef, SeatId, TaskDef } from '../content/types';
import type { GameState, StaffRun } from './state';
import type { System } from './system';

/*
 * 社員と Seat（企画書6章）。AI Worker の使用量は運用者の Seat の上限から消費し、上限を超えると AI Worker が遅くなる。
 * Seat の固定費は日割りで、進行中の案件に等分して計上する。
 */

/** 会社にいる社員（content/staff.ts の並び順） */
export function teamMembers(state: GameState): HumanWorkerDef[] {
  return humans.filter((h) => state.team[h.id] !== undefined);
}

export function inTeam(state: GameState, staffId: string): boolean {
  return state.team[staffId] !== undefined;
}

/** 社員の Seat。会社にいなければ入社したときの Seat */
export function seatOf(state: GameState, staffId: string): SeatDef {
  return getSeat(state.team[staffId]?.seat ?? getHuman(staffId).seat);
}

/** AI Worker を運用する社員。いない（会社にいない）なら null で、使用量の上限はない */
export function operatorOf(state: GameState, workerId: string): string | null {
  const w = findWorker(workerId);
  const op = w?.kind === 'ai' ? w.operatorId : undefined;
  return op !== undefined && inTeam(state, op) ? op : null;
}

/** 社員が運用している AI Worker の id */
export function operatedWorkers(staffId: string): string[] {
  return aiWorkers.filter((w) => w.operatorId === staffId).map((w) => w.id);
}

/** Seat の1営業日あたりの固定費（円）。月額を日割りにする */
export function seatDailyCost(seat: SeatDef): number {
  return (seat.monthlyUsd * balance.seat.yenPerUsd) / balance.seat.businessDaysPerMonth;
}

/** Seat の月額（円） */
export function seatMonthlyCost(seat: SeatDef): number {
  return seat.monthlyUsd * balance.seat.yenPerUsd;
}

/** 会社にいる社員の Seat の1営業日あたりの固定費の合計（円） */
export function teamDailyCost(state: GameState): number {
  return teamMembers(state).reduce((sum, h) => sum + seatDailyCost(seatOf(state, h.id)), 0);
}

/** 運用者の今日の使用量が上限に達しているか */
export function overLimit(state: GameState, staffId: string): boolean {
  const run = state.team[staffId];
  return run !== undefined && run.used >= getSeat(run.seat).dailyUsage;
}

/** AI Worker の作業速度の倍率。運用者の Seat の使用量が上限に達していれば balance.seat.overLimitSpeed */
export function usageSpeed(state: GameState, workerId: string): number {
  const op = operatorOf(state, workerId);
  return op !== null && overLimit(state, op) ? balance.seat.overLimitSpeed : 1;
}

/** AI Worker が amount だけ使用量を使う（運用者の Seat から減らす。運用者がいなければ何もしない） */
export function consumeUsage(state: GameState, workerId: string, amount: number): GameState {
  const op = operatorOf(state, workerId);
  const run = op === null ? undefined : state.team[op];
  if (op === null || !run || amount <= 0) return state;
  return { ...state, team: { ...state.team, [op]: { ...run, used: run.used + amount } } };
}

/** 社員の Seat を変える。会社にいない人・同じ Seat なら state をそのまま返す */
export function setSeat(state: GameState, staffId: string, seat: SeatId): GameState {
  const run = state.team[staffId];
  if (!run || run.seat === seat) return state;
  return { ...state, team: { ...state.team, [staffId]: { ...run, seat } } };
}

/** 社員を迎える。人間の待ち行列も用意する */
export function joinTeam(state: GameState, staffId: string): GameState {
  if (inTeam(state, staffId)) return state;
  const run: StaffRun = { seat: getHuman(staffId).seat, used: 0 };
  return {
    ...state,
    team: { ...state.team, [staffId]: run },
    humanQueues: { ...state.humanQueues, [staffId]: state.humanQueues[staffId] ?? [] },
  };
}

/** 人間の工程の速さ。skill に、得意分野の Task なら balance.staff.strengthSpeed を掛ける */
export function humanSpeed(humanId: string, task: TaskDef): number {
  const h = getHuman(humanId);
  const strong = task.kind !== undefined && h.strengths.includes(task.kind);
  return h.skill * (strong ? balance.staff.strengthSpeed : 1);
}

/** ゲーム開始からの営業日の番号（0 から） */
export const businessDay = (clock: number) => Math.floor(clock / balance.project.minutesPerBusinessDay);

/**
 * Seat の経済。営業日が変わったら使用量を 0 に戻し、進行中の案件があれば Seat の固定費を日割りで計上する
 * （案件の合間は計上しない）。
 */
export const seatSystem: System = (state) => {
  let next = state;
  const day = businessDay(state.clock);
  if (day !== state.usageDay) {
    const team = Object.fromEntries(Object.entries(state.team).map(([id, r]) => [id, { ...r, used: 0 }]));
    next = { ...next, team, usageDay: day };
  }
  if (!Object.values(next.projects).some((p) => p.completedAt === null)) return next;
  const cost = (teamDailyCost(next) * balance.time.tickMinutes) / balance.project.minutesPerBusinessDay;
  return { ...next, seatCost: next.seatCost + cost };
};
