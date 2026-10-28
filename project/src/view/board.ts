import { balance } from '../content/balance';
import { getProject } from '../content/index';
import type { ClientFocus, IndustryId, ProjectSize } from '../content/types';
import {
  type BidRun,
  baseAmount,
  bidDeadlineDays,
  type DeadlineStep,
  deadlineSteps,
  estimatePersonDays,
  type PriceStep,
  priceSteps,
  proposalOf,
  quoteBid,
} from '../core/bidding';
import { activeProjects, openInquiries, pendingBids } from '../core/board';
import { calendarDay, minuteOfDay } from '../core/clock';
import { scoreProject } from '../core/scoring';
import type { GameState } from '../core/state';
import { hhmm } from './hud';
import { projectTeamBadge } from './teams';

/** 案件のタブ（プレイ中の切り替え。3D では案件ごとのフロア） */
export interface ProjectTabView {
  readonly projectId: string;
  readonly name: string;
  /** フロアの番号（1から、進行中の案件を始めた順） */
  readonly floor: number;
  /** 完了した Task の割合（0〜1） */
  readonly progress: number;
  readonly selected: boolean;
  /** 案件のチームと管理者の札（チームが直轄だけなら null） */
  readonly team: string | null;
}

export interface ProjectTabsView {
  readonly tabs: readonly ProjectTabView[];
  /** まだ見積を出していない引き合いの数 */
  readonly offers: number;
  /** 見積を出して結果を待っている引き合いの数 */
  readonly pending: number;
}

const doneRatio = (state: GameState, projectId: string) => {
  const tasks = Object.values(state.projects[projectId]?.tasks ?? {});
  return tasks.length > 0 ? tasks.filter((t) => t.status === 'done').length / tasks.length : 0;
};

/** プレイ中のタブ。進行中の案件（と、いま開いている案件）を始めた順に並べる。ホーム（current が null）では進行中の案件だけ */
export function projectTabs(state: GameState, current: string | null): ProjectTabsView {
  const ids = activeProjects(state);
  if (current !== null && !ids.includes(current) && state.projects[current]) ids.push(current);
  return {
    tabs: ids.map((projectId, i) => ({
      projectId,
      name: getProject(projectId).name,
      floor: i + 1,
      progress: doneRatio(state, projectId),
      selected: projectId === current,
      team: projectTeamBadge(state, projectId),
    })),
    offers: openInquiries(state).length,
    pending: pendingBids(state).length,
  };
}

/** 納品した案件の1件（社員と Seat のシートの「実績」） */
export interface BoardProjectView {
  readonly projectId: string;
  readonly name: string;
  /** 売上（受注した案件は見積額） */
  readonly revenue: number;
  readonly deadlineDays: number;
  readonly tasks: number;
  /** 完了した Task の割合（進行中の案件） */
  readonly progress: number;
  /** 納品した案件の Profit / Person-Day */
  readonly profitPerPersonDay: number | null;
}

/** 引き合いの1件（コンペの前） */
export interface InquiryView {
  readonly projectId: string;
  readonly name: string;
  readonly client: string;
  readonly industry: IndustryId;
  readonly size: ProjectSize;
  readonly focus: ClientFocus;
  readonly budget: number;
  readonly rivals: number;
  readonly tasks: number;
  /** 見積人日と、見積の基準額（見積人日 × 平均売値） */
  readonly personDays: number;
  /** 人間だけで進めたときの人件費の目安（円）。見積人日 × 平均の原価 */
  readonly laborEstimate: number;
  readonly base: number;
  /** 標準の納期（営業日） */
  readonly deadlineDays: number;
  /** 応募の締切（HUD の時計と同じ「N日目 HH:MM」の日付と時刻） */
  readonly closes: { readonly day: number; readonly time: string };
  /** 出した見積。まだなら null */
  readonly bid: BidRun | null;
}

/** コンペの結果の1件（新しい順） */
export interface BidResultView {
  readonly projectId: string;
  readonly name: string;
  readonly won: boolean;
  readonly amount: number;
  readonly winChance: number;
}

export interface BoardView {
  /** 会社の評判（0〜100） */
  readonly reputation: number;
  readonly inquiries: readonly InquiryView[];
  readonly results: readonly BidResultView[];
}

/** 納品した案件（納品した順） */
export function deliveredProjects(state: GameState): BoardProjectView[] {
  return Object.values(state.projects)
    .filter((p) => p.completedAt !== null)
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0))
    .map((run) => {
      const def = getProject(run.projectId);
      const score = scoreProject(state, run.projectId);
      return {
        projectId: run.projectId,
        name: def.name,
        revenue: run.revenue,
        deadlineDays: run.deadlineDays,
        tasks: def.tasks.length,
        progress: doneRatio(state, run.projectId),
        profitPerPersonDay: score?.completed ? score.profitPerPersonDay : null,
      };
    });
}

/** 案件ボード：引き合い（届いた順）と最近のコンペの結果。進行中の案件はドックのタブ、納品した案件は社員と Seat のシートで見る */
export function boardView(state: GameState): BoardView {
  const inquiries = (state.board?.inquiries ?? []).flatMap((i): InquiryView[] => {
    const def = getProject(i.projectId);
    const brief = def.brief;
    if (!brief) return [];
    return [
      {
        projectId: i.projectId,
        name: def.name,
        client: brief.client,
        industry: brief.industry,
        size: brief.size,
        focus: brief.focus,
        budget: brief.budget,
        rivals: brief.rivals,
        tasks: def.tasks.length,
        personDays: estimatePersonDays(def),
        laborEstimate: estimatePersonDays(def) * balance.talent.rate.mean * balance.staff.costRatio,
        base: baseAmount(def),
        deadlineDays: def.deadlineDays,
        closes: { day: calendarDay(i.closesAt) + 1, time: hhmm(minuteOfDay(i.closesAt)) },
        bid: i.bid,
      },
    ];
  });
  return {
    reputation: state.reputation,
    inquiries,
    results: (state.board?.results ?? []).map((r) => ({
      projectId: r.projectId,
      name: getProject(r.projectId).name,
      won: r.won,
      amount: r.amount,
      winChance: r.winChance,
    })),
  };
}

/** 見積の選択肢の1つ（価格か納期）と、それを選んだときの勝率 */
export interface BidOptionView<K> {
  readonly id: K;
  /** 基準に対する倍率 */
  readonly ratio: number;
}

export const priceOptions: readonly BidOptionView<PriceStep>[] = priceSteps.map((id) => ({
  id,
  ratio: balance.bid.prices[id],
}));
/** 納期の選択肢。days は標準の納期から、その選択肢で提案する納期（営業日）を返す */
export const deadlineOptions: readonly (BidOptionView<DeadlineStep> & { days: (standard: number) => number })[] =
  deadlineSteps.map((id) => ({
    id,
    ratio: balance.bid.deadlines[id],
    days: (standard: number) => bidDeadlineDays(standard, id),
  }));

/** 見積の Before / After。Before は出した見積（まだなら基準の価格・標準の納期）、After は選んでいる見積 */
export interface BidPreview {
  readonly before: BidRun;
  readonly after: BidRun;
  /** 予算の上限を超えている（選ばれない） */
  readonly overBudget: boolean;
  /** 提案力の内訳（0〜1） */
  readonly proposal: { readonly reputation: number; readonly track: number; readonly ai: number };
}

export function bidPreview(state: GameState, projectId: string, price: PriceStep, deadline: DeadlineStep): BidPreview {
  const def = getProject(projectId);
  const submitted = state.board?.inquiries.find((i) => i.projectId === projectId)?.bid ?? null;
  const after = quoteBid(state, projectId, price, deadline);
  const { reputation, track, ai } = proposalOf(state, def);
  return {
    before: submitted ?? quoteBid(state, projectId, 'base', 'standard'),
    after,
    overBudget: after.amount > (def.brief?.budget ?? Number.POSITIVE_INFINITY),
    proposal: { reputation, track, ai },
  };
}
