import { campaign, campaignProjects } from '../content/campaign';
import type { CampaignStageDef } from '../content/types';
import { holds } from './conditions';
import type { GameEvent } from './events';
import type { GameState } from './state';
import { joinTeam } from './team';

/*
 * キャンペーンの進行（content/campaign.ts）。段階の条件を満たしたら案件を受注できるようにし、社員を迎える。
 * すべての案件を納品したらクリア。Command の適用後と各ステップの最後に判定する（core/progress.ts）。
 */

/** 受注できるようになった段階 */
function reachedStages(state: GameState): CampaignStageDef[] {
  const reached = state.campaign?.reached ?? [];
  return campaign.stages.filter((s) => reached.includes(s.id));
}

/** 受注できる（まだ始めていない）案件。キャンペーンでなければ空 */
export function offeredProjects(state: GameState): string[] {
  return reachedStages(state)
    .flatMap((s) => s.projects)
    .filter((id) => state.projects[id] === undefined);
}

/** 案件を始められるか。キャンペーンでは受注できるようになった案件だけ */
export function canStartProject(state: GameState, projectId: string): boolean {
  if (state.projects[projectId]) return false;
  return state.campaign === null || offeredProjects(state).includes(projectId);
}

/** 始めていて、まだ納品していない案件（始めた順） */
export function activeProjects(state: GameState): string[] {
  return Object.values(state.projects)
    .filter((p) => p.completedAt === null)
    .map((p) => p.projectId);
}

/** キャンペーンの案件の数と、納品した数 */
export function campaignProgress(state: GameState): { readonly done: number; readonly total: number } {
  const done = campaignProjects.filter((id) => (state.projects[id]?.completedAt ?? null) !== null).length;
  return { done, total: campaignProjects.length };
}

/** 条件を満たした段階に進み（案件の受注と社員の入社）、すべて納品していればクリアにする */
export function applyCampaign(state: GameState, emit: (e: GameEvent) => void): GameState {
  const run = state.campaign;
  if (!run) return state;
  let next = state;
  let reached = run.reached;
  for (const stage of campaign.stages) {
    if (reached.includes(stage.id) || !holds(next, stage.when)) continue;
    reached = [...reached, stage.id];
    for (const staffId of stage.joins) {
      next = joinTeam(next, staffId);
      emit({ type: 'StaffJoined', staffId });
    }
    emit({ type: 'ProjectsOffered', projectIds: stage.projects });
  }
  const { done, total } = campaignProgress(next);
  const cleared = run.cleared || done === total;
  if (cleared && !run.cleared) emit({ type: 'CampaignCleared' });
  if (reached === run.reached && cleared === run.cleared) return next;
  return { ...next, campaign: { reached, cleared } };
}
