import type { IconName } from '../assets/icons';
import { achievementDefs } from '../content/achievements';
import { balance } from '../content/balance';
import { getCompanyTier } from '../content/companyTiers';
import { getHuman, getProject } from '../content/index';
import { isAchieved } from '../core/achievements';
import { goalProgress, isListed, type PromotionProgress, tierOf } from '../core/company';
import { priceWarCut, retainBonus, tierAtLeast } from '../core/companyEvents';
import { isDelivered } from '../core/contract';
import { fiscalDaysLeft, lastReport } from '../core/fiscal';
import { perPersonDay } from '../core/formulas';
import { cashOf, companyRunning, valuationOf } from '../core/funds';
import { deliveryRating } from '../core/orders';
import type { FiscalRecord } from '../core/resultCode';
import { scoreProject } from '../core/scoring';
import type { FiscalReport, GameState, ValuationSample } from '../core/state';
import { projectDelegated, teamName } from '../core/teams';
import { ja } from '../i18n/ja';

/*
 * 長く遊ぶための画面の ViewModel。決算の画面（4段構成）・倒産の画面（時価総額の推移）・納品のカード・
 * 会社の帯（次の目標・資金・決算まで・引き抜きの打診）・実績の一覧。
 */

/** 規模の表示名（格付けの ★ を含む） */
export function tierLabel(tier: FiscalReport['tier'], rank: number): string {
  const name = getCompanyTier(tier).name;
  return rank > 0 ? ja.company.ranked(name, rank + 1) : name;
}

/** 前期 → 今期の指標（第2段） */
export interface FiscalMetric {
  readonly key: 'revenue' | 'profit' | 'reputation' | 'delivered';
  readonly before: number | null;
  readonly after: number;
}

/** チームごとの内訳（第3段） */
export interface FiscalTeamRow {
  readonly teamId: string;
  readonly name: string;
  readonly delivered: number;
  readonly profit: number;
  readonly profitPerPersonDay: number;
}

/** 推移の1期（第4段） */
export interface FiscalTrendRow {
  readonly no: number;
  readonly profit: number;
  readonly profitPerPersonDay: number;
  readonly valuation: number;
  readonly tier: string;
}

export interface FiscalView {
  readonly report: FiscalReport;
  /** 第1段：利益 / 人日 と、前期に対する倍率（前期がなければ・前期がマイナスなら null） */
  readonly vsPrevious: number | null;
  /** 規模（格付け）の前期 → 今期。上がっていれば promoted */
  readonly tier: { readonly before: string | null; readonly after: string; readonly promoted: boolean };
  readonly metrics: readonly FiscalMetric[];
  readonly teams: readonly FiscalTeamRow[];
  readonly best: { readonly name: string; readonly profitPerPersonDay: number } | null;
  readonly worst: { readonly name: string; readonly profitPerPersonDay: number } | null;
  readonly achievements: readonly { readonly id: string; readonly name: string; readonly icon: IconName }[];
  readonly trend: readonly FiscalTrendRow[];
  readonly goal: PromotionProgress;
  /** 上場しているか（時価総額と呼ぶか、推定の企業価値と呼ぶか） */
  readonly listed: boolean;
}

/** 推移に並べる期の数 */
const TREND = 8;

/** 決算の画面の ViewModel（純粋関数）。no の期の決算がなければ最新の決算。決算がなければ null */
export function fiscalView(state: GameState, no?: number): FiscalView | null {
  const reports = state.fiscal.reports;
  const index = no === undefined ? reports.length - 1 : reports.findIndex((r) => r.no === no);
  const report = reports[index];
  if (!report) return null;
  const prev = reports[index - 1] ?? null;
  const name = (projectId: string) => getProject(projectId).name;
  const highlight = (h: FiscalReport['best']) =>
    h ? { name: name(h.projectId), profitPerPersonDay: h.profitPerPersonDay } : null;
  return {
    report,
    vsPrevious:
      prev && prev.profitPerPersonDay > 0 && report.profitPerPersonDay > 0
        ? report.profitPerPersonDay / prev.profitPerPersonDay
        : null,
    tier: {
      before: prev ? tierLabel(prev.tier, prev.rank) : null,
      after: tierLabel(report.tier, report.rank),
      promoted: prev !== null && (prev.tier !== report.tier || prev.rank !== report.rank),
    },
    metrics: [
      { key: 'revenue', before: prev?.revenue ?? null, after: report.revenue },
      { key: 'profit', before: prev?.profit ?? null, after: report.profit },
      { key: 'reputation', before: prev?.reputation ?? null, after: report.reputation },
      { key: 'delivered', before: prev?.delivered ?? null, after: report.delivered },
    ],
    teams: Object.entries(report.teams)
      .map(([teamId, t]) => ({
        teamId,
        name: teamName(state, teamId),
        delivered: t.delivered,
        profit: t.profit,
        profitPerPersonDay: perPersonDay(t.profit, t.humanMinutes),
      }))
      .sort((a, b) => b.profit - a.profit),
    best: highlight(report.best),
    worst: report.worst?.projectId === report.best?.projectId ? null : highlight(report.worst),
    achievements: report.achievements.flatMap((id) => {
      const def = achievementDefs.find((d) => d.id === id);
      return def ? [{ id, name: achievementName(id), icon: def.icon }] : [];
    }),
    trend: reports.slice(Math.max(0, index + 1 - TREND), index + 1).map((r) => ({
      no: r.no,
      profit: r.profit,
      profitPerPersonDay: r.profitPerPersonDay,
      valuation: r.valuation,
      tier: tierLabel(r.tier, r.rank),
    })),
    goal: goalProgress(state),
    listed: isListed(state),
  };
}

/** 決算の結果コード（core/resultCode.ts）に入れる値 */
export function fiscalRecord(state: GameState, report: FiscalReport): FiscalRecord {
  return {
    seed: state.seed,
    no: report.no,
    revenue: report.revenue,
    profit: report.profit,
    profitPerPersonDay: report.profitPerPersonDay,
    humanMinutes: report.humanMinutes,
    delivered: report.delivered,
    reputation: report.reputation,
    tier: report.tier,
    rank: report.rank,
    valuation: report.valuation,
  };
}

const achievementName = (id: string) => ja.achievements.defs[id]?.name ?? id;

/** 実績の一覧の1行 */
export interface AchievementRow {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly icon: IconName;
  /** 達成した時刻。未達成なら null */
  readonly at: number | null;
}

export function achievementsView(state: GameState): AchievementRow[] {
  return achievementDefs.map((d) => ({
    id: d.id,
    name: achievementName(d.id),
    desc: ja.achievements.defs[d.id]?.desc ?? '',
    icon: d.icon,
    at: state.achievements.find((a) => a.id === d.id)?.at ?? null,
  }));
}

/** 会社の帯（いつも出す）。次の目標・資金・決算まで・競合の値下げ・引き抜きの打診・実績の数 */
export interface CompanyStatusView {
  readonly tier: string;
  readonly goal: PromotionProgress;
  readonly cash: number;
  /** 資金がマイナスのとき、倒産までの残りの営業日 */
  readonly shortDaysLeft: number | null;
  readonly fiscalNo: number;
  readonly fiscalDaysLeft: number | null;
  readonly priceWar: boolean;
  /** 時価総額（上場していなければ null。会社の帯に出す） */
  readonly valuation: number | null;
  readonly offers: readonly {
    readonly staffId: string;
    readonly name: string;
    readonly bonus: number;
    readonly daysLeft: number;
  }[];
  /** 実績の達成数。実績を見せる規模（balance.companyEvents.later.achievements）になるまでは null */
  readonly achievements: { readonly done: number; readonly total: number } | null;
}

/** 会社の帯の ViewModel。会社が営業していなければ（チュートリアル中・単発のプレイ）null */
export function companyStatusView(state: GameState): CompanyStatusView | null {
  if (!companyRunning(state)) return null;
  const cash = cashOf(state);
  const DAY = balance.time.minutesPerDay;
  return {
    tier: tierOf(state).name,
    goal: goalProgress(state),
    cash,
    shortDaysLeft: cash < 0 ? Math.max(0, balance.funds.graceDays - state.funds.shortDays) : null,
    fiscalNo: state.fiscal.no,
    fiscalDaysLeft: fiscalDaysLeft(state),
    priceWar: priceWarCut(state) > 0,
    valuation: isListed(state) ? valuationOf(state) : null,
    offers: state.companyEvents.offers
      .filter((o) => !o.leaving)
      .map((o) => ({
        staffId: o.staffId,
        name: getHuman(o.staffId).name,
        bonus: retainBonus(o.staffId),
        daysLeft: Math.max(0, Math.ceil((o.deadline - state.clock) / DAY)),
      })),
    achievements: tierAtLeast(state, balance.companyEvents.later.achievements)
      ? {
          done: achievementDefs.filter((d) => isAchieved(state, d.id)).length,
          total: achievementDefs.length,
        }
      : null,
  };
}

/** 納品の結果（直轄の案件はモーダル、管理者に任せた案件はカードで、全画面の結果の代わりに知らせる） */
export interface DeliveryView {
  readonly projectId: string;
  readonly name: string;
  readonly profit: number;
  readonly profitPerPersonDay: number;
  readonly onTime: boolean;
  readonly quality: number;
  /** 品質が評判の上がる水準（balance.reputation.qualityPivot）以上か */
  readonly qualityGood: boolean;
  /** 直轄のチームの案件か（管理者に任せていない） */
  readonly direct: boolean;
  /** 評判の変化（core/orders.ts の deliveryRating） */
  readonly reputation: number;
}

export function deliveryView(state: GameState, projectId: string): DeliveryView | null {
  const score = scoreProject(state, projectId);
  if (!score?.completed) return null;
  const run = state.projects[projectId];
  return {
    projectId,
    name: getProject(projectId).name,
    profit: score.profit,
    profitPerPersonDay: score.profitPerPersonDay,
    onTime: run !== undefined && score.elapsedMinutes <= run.deadlineDays * balance.time.minutesPerDay,
    quality: score.quality,
    qualityGood: score.quality >= balance.reputation.qualityPivot,
    direct: !projectDelegated(state, projectId),
    reputation: state.board ? deliveryRating(state, projectId) : 0,
  };
}

/** 倒産の画面：時価総額の推移と、会社の歩み */
export interface BankruptView {
  readonly samples: readonly ValuationSample[];
  readonly peak: ValuationSample | null;
  readonly days: number;
  readonly delivered: number;
  readonly tier: string;
  readonly fiscalCount: number;
  readonly achievements: number;
  readonly listed: boolean;
}

export function bankruptView(state: GameState): BankruptView {
  const samples = state.funds.samples;
  const peak = samples.reduce<ValuationSample | null>((p, s) => (!p || s.valuation > p.valuation ? s : p), null);
  const start = state.fiscal.startDay ?? 0;
  const end = Math.floor((state.funds.bankruptAt ?? state.clock) / balance.time.minutesPerDay);
  const last = lastReport(state);
  return {
    samples,
    peak,
    days: end - start,
    delivered: state.ledger.delivered + Object.values(state.projects).filter(isDelivered).length,
    tier: tierOf(state).name,
    fiscalCount: last?.no ?? 0,
    achievements: state.achievements.length,
    listed: isListed(state),
  };
}
