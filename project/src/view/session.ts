import { balance } from '../content/balance';
import { getProject } from '../content/index';
import { activeProjects, openInquiries } from '../core/board';
import { businessDay } from '../core/clock';
import type { GameEvent } from '../core/events';
import { deadlineMinutes } from '../core/formulas';
import { scoreCompany } from '../core/scoring';
import type { GameState } from '../core/state';
import { managerOf, teamIds, teamName, teamOfProject, teamProjects } from '../core/teams';

/*
 * 隙間時間に少しずつ遊ぶためのカードの ViewModel。営業日の終わりの区切り（その日の成果）と、
 * 再開したときのあらすじ（閉じていた間に進んだこと・進行中の案件・次にやること）。
 */

/** 進行中の案件の進み具合 */
export interface ActiveProjectView {
  readonly projectId: string;
  readonly name: string;
  readonly done: number;
  readonly total: number;
  /** 納期までの残り（営業日）。負なら超過 */
  readonly daysLeft: number;
}

/** 次にやること（上から順に大事） */
export type NextStep =
  | { readonly kind: 'incident'; readonly count: number }
  | { readonly kind: 'assign'; readonly count: number }
  /** 見積を出していない引き合い */
  | { readonly kind: 'offer'; readonly count: number }
  /** やることがなく、見守るだけ */
  | { readonly kind: 'watch' };

/** チームごとの進み具合（チームが2つ以上あるときだけ出す） */
export interface TeamProgressView {
  readonly teamId: string;
  readonly name: string;
  readonly active: number;
  /** 区切りの間・閉じていた間に納品した数 */
  readonly delivered: number;
  readonly manager: 'human' | 'ai' | null;
}

/** 営業日の終わりの区切り */
export interface DaySummary {
  /** 終わった営業日（1 から） */
  readonly day: number;
  readonly tasksDone: number;
  /** この日に納品した案件の名前 */
  readonly delivered: readonly string[];
  /** この日の会社の利益の増減（円） */
  readonly profit: number;
  /** この日の人間の稼働（分） */
  readonly humanMinutes: number;
  readonly active: readonly ActiveProjectView[];
  readonly next: readonly NextStep[];
  readonly teams: readonly TeamProgressView[];
}

/** 再開したときのあらすじ */
export interface Recap {
  /** 閉じていた間に進んだゲーム内の分。進めていなければ 0 */
  readonly awayMinutes: number;
  readonly tasksDone: number;
  readonly delivered: readonly string[];
  /** 閉じていた間に起きた事件の数 */
  readonly incidents: number;
  readonly active: readonly ActiveProjectView[];
  readonly next: readonly NextStep[];
  readonly teams: readonly TeamProgressView[];
  /** 閉じていた間に締めた期（決算の画面をあらすじの後に出す）。なければ null */
  readonly fiscalClosed: number | null;
}

/** チームごとの進み具合。delivered は納品した案件の id（どのチームの案件かは end の state で決める） */
export function teamProgressViews(state: GameState, delivered: readonly string[]): TeamProgressView[] {
  if (state.teams.length === 0) return [];
  return teamIds(state).map((teamId) => ({
    teamId,
    name: teamName(state, teamId),
    active: teamProjects(state, teamId).length,
    delivered: delivered.filter((id) => teamOfProject(state, id) === teamId).length,
    manager: managerOf(state, teamId)?.kind ?? null,
  }));
}

export function activeProjectViews(state: GameState): ActiveProjectView[] {
  return activeProjects(state).flatMap((id) => {
    const run = state.projects[id];
    if (!run) return [];
    const def = getProject(id);
    const tasks = Object.values(run.tasks);
    return [
      {
        projectId: id,
        name: def.name,
        done: tasks.filter((t) => t.status === 'done').length,
        total: tasks.length,
        daysLeft: (deadlineMinutes(run) - (state.clock - run.startedAt)) / balance.time.minutesPerDay,
      },
    ];
  });
}

/** 次にやること。事件 → 担当が決まっていない Task → 見積を出していない引き合いの順。何もなければ見守る */
export function nextSteps(state: GameState): NextStep[] {
  const steps: NextStep[] = [];
  if (state.incidents.length > 0) steps.push({ kind: 'incident', count: state.incidents.length });
  const unassigned = activeProjects(state)
    .flatMap((id) => Object.values(state.projects[id]?.tasks ?? {}))
    .filter((t) => t.status === 'waiting' && t.assignment === null).length;
  if (unassigned > 0) steps.push({ kind: 'assign', count: unassigned });
  const offered = openInquiries(state).length;
  if (offered > 0) steps.push({ kind: 'offer', count: offered });
  return steps.length > 0 ? steps : [{ kind: 'watch' }];
}

/** start（前の区切り）から end（今回の区切り）までの成果 */
export function daySummary(start: GameState, end: GameState): DaySummary {
  const tasksDone = Object.values(end.projects)
    .flatMap((p) => Object.values(p.tasks))
    .filter((t) => t.completedAt !== null && t.completedAt > start.clock && t.completedAt <= end.clock).length;
  const deliveredIds = Object.values(end.projects)
    .filter((p) => p.completedAt !== null && p.completedAt > start.clock && p.completedAt <= end.clock)
    .map((p) => p.projectId);
  const delivered = deliveredIds.map((id) => getProject(id).name);
  const before = scoreCompany(start);
  const after = scoreCompany(end);
  return {
    day: businessDay(end.clock),
    tasksDone,
    delivered,
    profit: after.profit - before.profit,
    humanMinutes: after.humanMinutes - before.humanMinutes,
    active: activeProjectViews(end),
    next: nextSteps(end),
    teams: teamProgressViews(end, deliveredIds),
  };
}

/** 再開したときのあらすじ。before は保存されていた state、after は閉じていた間の進行（core/away.ts）を適用した state */
export function recapView(before: GameState, after: GameState, events: readonly GameEvent[]): Recap {
  return {
    awayMinutes: after.clock - before.clock,
    tasksDone: events.filter((e) => e.type === 'TaskCompleted').length,
    delivered: events.flatMap((e) => (e.type === 'ProjectCompleted' ? [getProject(e.projectId).name] : [])),
    incidents: events.filter((e) => e.type === 'IncidentStarted').length,
    active: activeProjectViews(after),
    next: nextSteps(after),
    teams: teamProgressViews(
      after,
      events.flatMap((e) => (e.type === 'ProjectCompleted' ? [e.projectId] : [])),
    ),
    fiscalClosed: events.flatMap((e) => (e.type === 'FiscalClosed' ? [e.no] : [])).at(-1) ?? null,
  };
}
