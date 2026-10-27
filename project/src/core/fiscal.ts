import { balance } from '../content/balance';
import { checkAchievements } from './achievements';
import { dailyCompanyEvents, rollOutage } from './companyEvents';
import type { GameEvent } from './events';
import { perPersonDay } from './formulas';
import { cashFromProfit, checkFunds, companyRunning, isBankrupt, valuationOf } from './funds';
import { scoreCompany, scoreProject } from './scoring';
import type { CompanyTotals, FiscalReport, FiscalRun, GameState } from './state';
import type { System } from './system';
import { businessDay } from './team';
import { teamOfProject } from './teams';

/*
 * 決算。会社の期を balance.fiscal.days 営業日ごとに締め、売上・利益・利益 / 人日・評判・規模を前期と比べる決算を出す（FiscalClosed）。
 * 期の数字は、期首と期末の会社の累計の差で求める。チームごとの納品の集計と、いちばん良かった・悪かった案件は納品のたびに足す。
 * 営業日の始まりには、資金の確認（core/funds.ts）・後半の事件（core/companyEvents.ts）・実績の判定もここからまとめて行う。
 */

const DAY = balance.project.minutesPerBusinessDay;

/** 会社の累計（決算の起点） */
export function companyTotals(state: GameState): CompanyTotals {
  const c = scoreCompany(state);
  return {
    revenue: c.revenue,
    profit: c.profit,
    humanMinutes: c.humanMinutes,
    delivered: c.delivered,
    outages: state.companyEvents.outages,
    poached: state.companyEvents.poached,
  };
}

/** 今の期が終わる営業日。期が始まっていなければ null */
export const fiscalEndDay = (fiscal: FiscalRun): number | null =>
  fiscal.startDay === null ? null : fiscal.startDay + balance.fiscal.days;

/** 今の期の残りの営業日。期が始まっていなければ null */
export function fiscalDaysLeft(state: GameState): number | null {
  const end = fiscalEndDay(state.fiscal);
  return end === null ? null : Math.max(0, end - state.clock / DAY);
}

/** 前の期の決算。なければ null */
export const lastReport = (state: GameState): FiscalReport | null => state.fiscal.reports.at(-1) ?? null;

/** 納品した案件を今の期の集計（チームごと・いちばん良かった / 悪かった案件）に足す */
export function recordDelivery(state: GameState, projectId: string): GameState {
  const score = scoreProject(state, projectId);
  if (!score) return state;
  const f = state.fiscal;
  const teamId = teamOfProject(state, projectId);
  const prev = f.teams[teamId] ?? { delivered: 0, profit: 0, humanMinutes: 0 };
  const team = {
    delivered: prev.delivered + 1,
    profit: prev.profit + score.profit,
    humanMinutes: prev.humanMinutes + score.humanMinutes,
  };
  const highlight = { projectId, profitPerPersonDay: score.profitPerPersonDay };
  return {
    ...state,
    fiscal: {
      ...f,
      teams: { ...f.teams, [teamId]: team },
      best: !f.best || highlight.profitPerPersonDay > f.best.profitPerPersonDay ? highlight : f.best,
      worst: !f.worst || highlight.profitPerPersonDay < f.worst.profitPerPersonDay ? highlight : f.worst,
    },
  };
}

/** 納品の後の会社の処理：期の集計・大規模障害の判定・実績の判定 */
export function settleDelivery(state: GameState, projectId: string, emit: (e: GameEvent) => void): GameState {
  if (state.board === null) return state;
  const recorded = rollOutage(recordDelivery(state, projectId), projectId, emit);
  return checkAchievements(recorded, { kind: 'delivery', projectId }, emit);
}

/** 今の期の決算（締める前の途中経過にも使う） */
export function fiscalReport(state: GameState, endDay: number = businessDay(state.clock)): FiscalReport {
  const f = state.fiscal;
  const now = companyTotals(state);
  const o = f.opening;
  const profit = now.profit - o.profit;
  const humanMinutes = now.humanMinutes - o.humanMinutes;
  return {
    no: f.no,
    startDay: f.startDay ?? 0,
    endDay,
    revenue: now.revenue - o.revenue,
    profit,
    humanMinutes,
    profitPerPersonDay: perPersonDay(profit, humanMinutes),
    delivered: now.delivered - o.delivered,
    reputation: state.reputation,
    tier: state.tier,
    rank: state.rank,
    cash: cashFromProfit(now.profit),
    valuation: valuationOf(state, now.profit),
    staff: Object.keys(state.team).length,
    agents: state.agents.length,
    teams: f.teams,
    best: f.best,
    worst: f.worst,
    outages: now.outages - o.outages,
    poached: now.poached - o.poached,
    achievements: f.achievements,
  };
}

/** 期を締める。決算を残し（keep 期まで）、決算の実績を判定して、次の期を始める */
export function closeFiscal(state: GameState, emit: (e: GameEvent) => void): GameState {
  const f = state.fiscal;
  const report = fiscalReport(state);
  const checked = checkAchievements(state, { kind: 'fiscal', report, previous: lastReport(state) }, emit);
  const closed = { ...report, achievements: checked.fiscal.achievements };
  const reports = [...f.reports, closed].slice(-balance.fiscal.keep);
  emit({ type: 'FiscalClosed', no: f.no });
  return {
    ...checked,
    fiscal: {
      no: f.no + 1,
      startDay: report.endDay,
      opening: companyTotals(checked),
      teams: {},
      best: null,
      worst: null,
      achievements: [],
      reports,
    },
  };
}

/** 期を始める（会社が営業を始めた営業日から） */
function openFiscal(state: GameState): GameState {
  return {
    ...state,
    fiscal: { ...state.fiscal, startDay: businessDay(state.clock), opening: companyTotals(state) },
  };
}

/**
 * 営業日の始まりの会社の処理。資金の確認 → 後半の事件 → 実績 → 期の終わりなら決算。
 * 案件ボードのある会社で、チュートリアルを終えているときだけ（チュートリアルを終えた日から期を数える）
 */
export const fiscalSystem: System = (state, ctx) => {
  if (!companyRunning(state) || isBankrupt(state) || state.clock % DAY !== 0) return state;
  let next = state.fiscal.startDay === null ? openFiscal(state) : state;
  next = checkFunds(next, ctx.emit);
  if (isBankrupt(next)) return next;
  next = dailyCompanyEvents(next, ctx.emit);
  next = checkAchievements(next, { kind: 'state' }, ctx.emit);
  const end = fiscalEndDay(next.fiscal);
  return end !== null && businessDay(next.clock) >= end ? closeFiscal(next, ctx.emit) : next;
};
