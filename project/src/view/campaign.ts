import { campaignProjects } from '../content/campaign';
import { getProject } from '../content/index';
import { activeProjects, campaignProgress, offeredProjects } from '../core/campaign';
import { scoreProject } from '../core/scoring';
import type { GameState } from '../core/state';

/** 案件のタブ（プレイ中の切り替え。3D では案件ごとのフロア） */
export interface ProjectTabView {
  readonly projectId: string;
  readonly name: string;
  /** フロアの番号（1から、進行中の案件を始めた順） */
  readonly floor: number;
  /** 完了した Task の割合（0〜1） */
  readonly progress: number;
  readonly selected: boolean;
}

export interface ProjectTabsView {
  readonly tabs: readonly ProjectTabView[];
  /** 受注できる（まだ始めていない）依頼の数 */
  readonly offers: number;
}

const doneRatio = (state: GameState, projectId: string) => {
  const tasks = Object.values(state.projects[projectId]?.tasks ?? {});
  return tasks.length > 0 ? tasks.filter((t) => t.status === 'done').length / tasks.length : 0;
};

/** プレイ中のタブ。進行中の案件（と、いま開いている案件）を始めた順に並べる */
export function projectTabs(state: GameState, current: string): ProjectTabsView {
  const ids = activeProjects(state);
  if (!ids.includes(current) && state.projects[current]) ids.push(current);
  return {
    tabs: ids.map((projectId, i) => ({
      projectId,
      name: getProject(projectId).name,
      floor: i + 1,
      progress: doneRatio(state, projectId),
      selected: projectId === current,
    })),
    offers: offeredProjects(state).length,
  };
}

/** 案件ボードの1件 */
export interface BoardProjectView {
  readonly projectId: string;
  readonly name: string;
  readonly revenue: number;
  readonly deadlineDays: number;
  readonly tasks: number;
  /** 完了した Task の割合（進行中の案件） */
  readonly progress: number;
  /** 納品した案件の Profit / Person-Day */
  readonly profitPerPersonDay: number | null;
}

export interface BoardView {
  readonly offered: readonly BoardProjectView[];
  readonly active: readonly BoardProjectView[];
  readonly done: readonly BoardProjectView[];
  readonly progress: { readonly done: number; readonly total: number };
  readonly cleared: boolean;
}

/** 案件ボード（キャンペーンの受注と進行中・納品済みの案件）。キャンペーンの並び順 */
export function boardView(state: GameState): BoardView {
  const item = (projectId: string): BoardProjectView => {
    const def = getProject(projectId);
    const score = scoreProject(state, projectId);
    return {
      projectId,
      name: def.name,
      revenue: def.revenue,
      deadlineDays: def.deadlineDays,
      tasks: def.tasks.length,
      progress: doneRatio(state, projectId),
      profitPerPersonDay: score?.completed ? score.profitPerPersonDay : null,
    };
  };
  const offered = offeredProjects(state);
  const active = activeProjects(state);
  return {
    offered: campaignProjects.filter((id) => offered.includes(id)).map(item),
    active: campaignProjects.filter((id) => active.includes(id)).map(item),
    done: campaignProjects.filter((id) => (state.projects[id]?.completedAt ?? null) !== null).map(item),
    progress: campaignProgress(state),
    cleared: state.campaign?.cleared === true,
  };
}
