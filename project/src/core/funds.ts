import { balance } from '../content/balance';
import { businessDay } from './clock';
import type { GameEvent } from './events';
import { scoreCompany } from './scoring';
import type { FundsRun, GameState, ValuationSample } from './state';

/*
 * 資金と倒産・時価総額。資金は開業資金に会社の累計の利益を足したもの（案件の人件費は作業のたびに、売上は納品で入るので、
 * 大きな案件を抱えると一時的に減る）。営業日の終わりに資金がマイナスなら警告し、balance.funds.graceDays 営業日続いたら倒産する。
 * 時価総額は資金と直近の利益のペースから計算し、推移を記録する（倒産の画面と決算の推移で見せる）。
 */

/** 会社が営業していて、期・資金・後半の事件を数える状態か（案件ボードのある会社で、チュートリアルを終えている） */
export const companyRunning = (state: GameState) => state.board !== null && state.tutorial === null;

/** 倒産しているか（時間が進まず、Command も受け付けない） */
export const isBankrupt = (state: GameState) => state.funds.bankruptAt !== null;

/** 資金（円）= 開業資金 + 会社の累計の利益 */
export const cashFromProfit = (profit: number) => balance.funds.initial + profit;

export const cashOf = (state: GameState) => cashFromProfit(scoreCompany(state).profit);

/**
 * 直近の利益のペース（円/年）。windowDays 営業日前より前で最も新しい記録からの利益の伸びを1年に換算する。
 * 記録がなければ、会社の期が始まった日（利益 0）から数える
 */
export function profitPace(state: GameState, profit: number): number {
  const v = balance.valuation;
  const today = businessDay(state.clock);
  const origin: Pick<ValuationSample, 'day' | 'profit'> = { day: state.fiscal.startDay ?? 0, profit: 0 };
  let base = origin;
  for (const s of state.funds.samples) if (s.day <= today - v.windowDays) base = s;
  const days = today - base.day;
  return days > 0 ? ((profit - base.profit) / days) * v.businessDaysPerYear : 0;
}

/**
 * 時価総額（円）= 資金 + 利益のペース（マイナスなら 0）× 倍率 × 評判の補正 − 期限切れ・打ち切りで失った分（core/contract.ts）。0 を下回らない
 */
export function valuationOf(state: GameState, profit: number = scoreCompany(state).profit): number {
  const v = balance.valuation;
  const r = balance.reputation;
  const reputation = 1 + ((state.reputation - r.initial) / (r.max - r.min)) * v.reputationWeight;
  const value = cashFromProfit(profit) + Math.max(0, profitPace(state, profit)) * v.multiple * reputation;
  return Math.max(0, value - state.valuationHit);
}

/** 推移に1点足す。上限を超えたら1つおきに間引いて（最新は残す）記録の間隔を倍にする */
export function addSample(funds: FundsRun, sample: ValuationSample): FundsRun {
  const samples = [...funds.samples, sample];
  if (samples.length <= balance.valuation.maxSamples) return { ...funds, samples };
  const last = samples.length - 1;
  const k = balance.valuation.thinning;
  return { ...funds, samples: samples.filter((_, i) => (last - i) % k === 0), sampleEvery: funds.sampleEvery * k };
}

/** 今の会社の推移の1点 */
export function sampleOf(state: GameState): ValuationSample {
  const profit = scoreCompany(state).profit;
  return { day: businessDay(state.clock), valuation: valuationOf(state, profit), cash: cashFromProfit(profit), profit };
}

/**
 * 営業日の始まりの資金の確認。記録の間隔ごとに推移を足し、資金がマイナスなら CashShort を出して日数を数え、
 * 猶予を使い切ったら倒産する（一時停止し、最後の推移を足して CompanyBankrupt を出す）
 */
export function checkFunds(state: GameState, emit: (e: GameEvent) => void): GameState {
  if (!companyRunning(state) || isBankrupt(state)) return state;
  const sample = sampleOf(state);
  let funds = state.funds;
  if (sample.day % funds.sampleEvery === 0) funds = addSample(funds, sample);
  if (sample.cash >= 0) return { ...state, funds: { ...funds, shortDays: 0 } };
  const shortDays = funds.shortDays + 1;
  const daysLeft = balance.funds.graceDays - shortDays;
  if (daysLeft > 0) {
    emit({ type: 'CashShort', cash: sample.cash, daysLeft });
    return { ...state, funds: { ...funds, shortDays } };
  }
  const last = funds.samples.at(-1)?.day === sample.day ? funds : addSample(funds, sample);
  emit({ type: 'CompanyBankrupt' });
  return { ...state, funds: { ...last, shortDays, bankruptAt: state.clock } };
}
