import { balance } from '../content/balance';
import { aiWorkers, findWorker, getHuman } from '../content/index';
import { getSeat } from '../content/seats';
import type { HumanWorkerDef, SeatDef, SeatId, TaskDef } from '../content/types';
import type { GameState, StaffRun } from './state';
import type { System } from './system';
import { marketCandidates } from './talent';

/*
 * 社員と Seat（企画書6章）・採用市場。AI Worker の使用量は運用者の Seat の上限から消費し、上限を超えると AI Worker が遅くなる。
 * Seat の固定費と待機中の社員の給与は日割りで、会社が営業しているときだけ計上する（companyOpen）。
 */

/** 会社にいる社員（入社した順） */
export function teamMembers(state: GameState): HumanWorkerDef[] {
  return Object.keys(state.team).map(getHuman);
}

export function inTeam(state: GameState, staffId: string): boolean {
  return state.team[staffId] !== undefined;
}

/** 社員の Seat。会社にいなければ入社したときの Seat */
export function seatOf(state: GameState, staffId: string): SeatDef {
  return getSeat(state.team[staffId]?.seat ?? getHuman(staffId).seat);
}

/**
 * AI Worker を運用する社員。定義の運用者が会社にいなければ（退職した・チュートリアルなしで始めた）、最初に入社した社員が運用する。
 * 運用者のない AI Worker・社員がいなければ null で、使用量の上限はない
 */
export function operatorOf(state: GameState, workerId: string): string | null {
  const w = findWorker(workerId);
  const op = w?.kind === 'ai' ? w.operatorId : undefined;
  if (op === undefined) return null;
  return inTeam(state, op) ? op : (Object.keys(state.team)[0] ?? null);
}

/** 社員が運用している AI Worker の id */
export function operatedWorkers(state: GameState, staffId: string): string[] {
  return aiWorkers.filter((w) => operatorOf(state, w.id) === staffId).map((w) => w.id);
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

/** 採用の契約金（円）。売値の balance.hire.signingDays 人日分 */
export function signingFee(staffId: string): number {
  return getHuman(staffId).dailyRate * balance.hire.signingDays;
}

/** 人員の上限に達しているか */
export const teamFull = (state: GameState) => Object.keys(state.team).length >= balance.hire.maxStaff;

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
  const busy =
    (state.humanQueues[staffId]?.length ?? 0) > 0 ||
    Object.values(state.projects).some((p) =>
      Object.values(p.tasks).some(
        (t) => t.status !== 'done' && (t.humanId === staffId || t.assignment?.workerId === staffId),
      ),
    );
  return busy ? 'busy' : null;
}

/** 退職させる。退職できなければ state をそのまま返す */
export function release(state: GameState, staffId: string): GameState {
  if (releaseBlock(state, staffId) !== null) return state;
  const { [staffId]: _run, ...team } = state.team;
  const { [staffId]: _queue, ...humanQueues } = state.humanQueues;
  return { ...state, team, humanQueues };
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
 * 会社が営業していて、Seat の固定費と待機中の給与がかかっているか。進行中の案件があるときと、
 * チュートリアルを終えた案件ボードのある会社（案件の合間に引き合いを待つ間も給与はかかる）。
 * 単発のプレイとチュートリアルでは、案件の合間を数えない
 */
export const companyOpen = (state: GameState) =>
  (state.board !== null && state.tutorial === null) ||
  Object.values(state.projects).some((p) => p.completedAt === null);

/**
 * Seat の経済。営業日が変わったら使用量を 0 に戻し、会社が営業していれば Seat の固定費を日割りで計上する
 * （単発のプレイとチュートリアルでは案件の合間は計上しない）。待機中の社員の給与は、人間の待ち行列の処理（core/humanQueueSystem.ts）が数える
 */
export const seatSystem: System = (state) => {
  let next = state;
  const day = businessDay(state.clock);
  if (day !== state.usageDay) {
    const team = Object.fromEntries(Object.entries(state.team).map(([id, r]) => [id, { ...r, used: 0 }]));
    next = { ...next, team, usageDay: day };
  }
  if (!companyOpen(next)) return next;
  const cost = (teamDailyCost(next) * balance.time.tickMinutes) / balance.project.minutesPerBusinessDay;
  return { ...next, seatCost: next.seatCost + cost };
};

/** 採用市場。営業日が変わったら、その日の候補に入れ替える */
export const marketSystem: System = (state) => {
  const day = businessDay(state.clock);
  if (day === state.market.day) return state;
  const candidates = marketCandidates(state.seed, day).filter((id) => !inTeam(state, id));
  return { ...state, market: { day, candidates } };
};
