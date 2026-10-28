import { getProject } from '../content/index';
import type { ContractKind, IndustryId, ProjectSize } from '../content/types';
import { activeProjects, openInquiries } from '../core/board';
import { calendarDay, minuteOfDay } from '../core/clock';
import { contractOf, isDelivered } from '../core/contract';
import { maxProjects, orderBlock, orderTerms, runningProjects } from '../core/orders';
import { scoreProject } from '../core/scoring';
import type { GameState } from '../core/state';
import { stalledProjects } from '../core/step';
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
  /** 担当が決まっていない Task で止まっている（core/step.ts の stalledProjects） */
  readonly stalled: boolean;
}

export interface ProjectTabsView {
  readonly tabs: readonly ProjectTabView[];
  /** ボードに届いている引き合いの数 */
  readonly offers: number;
}

const doneRatio = (state: GameState, projectId: string) => {
  const tasks = Object.values(state.projects[projectId]?.tasks ?? {});
  return tasks.length > 0 ? tasks.filter((t) => t.status === 'done').length / tasks.length : 0;
};

/** プレイ中のタブ。進行中の案件（と、いま開いている案件）を始めた順に並べる。ホーム（current が null）では進行中の案件だけ */
export function projectTabs(state: GameState, current: string | null): ProjectTabsView {
  const ids = activeProjects(state);
  const stalled = stalledProjects(state);
  if (current !== null && !ids.includes(current) && state.projects[current]) ids.push(current);
  return {
    tabs: ids.map((projectId, i) => ({
      projectId,
      name: getProject(projectId).name,
      floor: i + 1,
      progress: doneRatio(state, projectId),
      selected: projectId === current,
      team: projectTeamBadge(state, projectId),
      stalled: stalled.includes(projectId),
    })),
    offers: openInquiries(state).length,
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

/** 引き合いの1件（受注の前） */
export interface InquiryView {
  readonly projectId: string;
  readonly name: string;
  readonly client: string;
  readonly industry: IndustryId;
  readonly size: ProjectSize;
  readonly contract: ContractKind;
  readonly tasks: number;
  /** 受注したときの売上（円。評判と競合の値下げで変わる） */
  readonly revenue: number;
  /** 納期（受注した日から数える営業日） */
  readonly deadlineDays: number;
  /** 受付の締切（HUD の時計と同じ「N日目 HH:MM」の日付と時刻） */
  readonly closes: { readonly day: number; readonly time: string };
  /** 受注できない理由（同時に進められる数に達している）。受注できれば null */
  readonly blocked: 'full' | null;
}

export interface BoardView {
  /** 会社の評判（0〜100） */
  readonly reputation: number;
  /** 進めている案件の数と、同時に進められる数（会社の規模で決まる） */
  readonly running: number;
  readonly max: number;
  readonly inquiries: readonly InquiryView[];
}

/** 納品した案件（納品した順） */
export function deliveredProjects(state: GameState): BoardProjectView[] {
  return Object.values(state.projects)
    .filter(isDelivered)
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

/** 案件ボード：引き合い（締切の近い順）。進行中の案件はドックのタブと案件一覧、納品した案件は社員と Seat のシートで見る */
export function boardView(state: GameState): BoardView {
  // 締切の近い順（規模で受付の期間が違うので、届いた順とは限らない）
  const open = [...(state.board?.inquiries ?? [])].sort((a, b) => a.closesAt - b.closesAt);
  const inquiries = open.flatMap((i): InquiryView[] => {
    const def = getProject(i.projectId);
    const brief = def.brief;
    if (!brief) return [];
    const terms = orderTerms(state, i.projectId);
    return [
      {
        projectId: i.projectId,
        name: def.name,
        client: brief.client,
        industry: brief.industry,
        size: brief.size,
        contract: contractOf(i.projectId),
        tasks: def.tasks.length,
        revenue: terms.revenue,
        deadlineDays: terms.deadlineDays,
        closes: { day: calendarDay(i.closesAt) + 1, time: hhmm(minuteOfDay(i.closesAt)) },
        blocked: orderBlock(state, i.projectId) === 'full' ? 'full' : null,
      },
    ];
  });
  return { reputation: state.reputation, running: runningProjects(state), max: maxProjects(state), inquiries };
}
