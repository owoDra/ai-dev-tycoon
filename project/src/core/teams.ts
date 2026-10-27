import { balance } from '../content/balance';
import { getHuman } from '../content/index';
import type { AiWorkerDef, TaskDef } from '../content/types';
import { ja } from '../i18n/ja';
import { humansAtWork } from './clock';
import { tierOf } from './company';
import { dailyCost, laborCost } from './formulas';
import { createSession, type GameState, type ManagerRun, type TeamRun } from './state';
import type { System } from './system';
import { companyOpen, inTeam } from './team';

/*
 * チーム。社員と AI Worker をチームに所属させ、チームに案件を割り当てる。
 * どのチームにも入っていない社員・AI Worker・案件は直轄チーム（DIRECT）に属し、プレイヤーが担当を決める。直轄チームは常に1つ。
 * 直轄以外のチームには管理者（人間 PM / AI PM）を置き、管理者が担当を決める（core/manager.ts）。
 * プレイヤーは介入して、一時的に直轄として担当を決めることもできる（TeamRun.intervened）。
 * AI Worker は会社の規模の上限まで増やせる。増やした AI Worker の id は `ai~<番号>` で、定義は id から再生成する（content/index.ts の findWorker）。
 */

export const DIRECT = 'direct';

const AGENT_PREFIX = 'ai~';
const TEAM_PREFIX = 't~';

/** 増やした AI Worker の id か */
export const isAgentId = (id: string) => id.startsWith(AGENT_PREFIX);

/** 増やした AI Worker の定義（Model は既定、運用者はチームの社員。core/team.ts の operatorOf）。id でなければ undefined */
export function generateAgent(id: string): AiWorkerDef | undefined {
  if (!isAgentId(id)) return undefined;
  const no = id.slice(AGENT_PREFIX.length);
  return { kind: 'ai', id, name: ja.teams.agentName(no), modelId: 'standard' };
}

/** 直轄以外のチーム */
export const findTeam = (state: GameState, teamId: string): TeamRun | undefined =>
  state.teams.find((t) => t.id === teamId);

/** チームの id（直轄が先頭、ほかは作った順） */
export const teamIds = (state: GameState): string[] => [DIRECT, ...state.teams.map((t) => t.id)];

/** チームの表示名 */
export function teamName(state: GameState, teamId: string): string {
  const team = findTeam(state, teamId);
  return team ? ja.teams.name(team.no) : ja.teams.direct;
}

/** 社員・AI Worker の所属チーム */
export const teamOfWorker = (state: GameState, workerId: string): string =>
  state.teams.find((t) => t.members.includes(workerId))?.id ?? DIRECT;

/** 案件の担当チーム */
export const teamOfProject = (state: GameState, projectId: string): string =>
  state.teams.find((t) => t.projects.includes(projectId))?.id ?? DIRECT;

/** チームの社員（入社した順。人間 PM を含む） */
export const teamStaff = (state: GameState, teamId: string): string[] =>
  Object.keys(state.team).filter((id) => teamOfWorker(state, id) === teamId);

/** チームの AI Worker（加えた順） */
export const teamAgents = (state: GameState, teamId: string): string[] =>
  state.agents.filter((id) => teamOfWorker(state, id) === teamId);

/** チームの進行中の案件（始めた順） */
export const teamProjects = (state: GameState, teamId: string): string[] =>
  Object.values(state.projects)
    .filter((p) => p.completedAt === null && teamOfProject(state, p.projectId) === teamId)
    .map((p) => p.projectId);

/** チームの管理者。直轄チームにはいない */
export const managerOf = (state: GameState, teamId: string): ManagerRun | null =>
  findTeam(state, teamId)?.manager ?? null;

/** 人間 PM に任命されている社員か（PM は Task の作業をしない） */
export const isManager = (state: GameState, staffId: string): boolean =>
  state.teams.some((t) => t.manager?.kind === 'human' && t.manager.staffId === staffId);

/** チームの作業をする社員（人間 PM を除く） */
export const workingStaff = (state: GameState, teamId: string): string[] =>
  teamStaff(state, teamId).filter((id) => !isManager(state, id));

/** 管理者が担当を決めているチームか（管理者がいて、プレイヤーが介入していない） */
export function isDelegated(state: GameState, teamId: string): boolean {
  const team = findTeam(state, teamId);
  return team !== undefined && team.manager !== null && !team.intervened;
}

/** 案件の担当を管理者が決めているか（プレイヤーは担当を決められない） */
export const projectDelegated = (state: GameState, projectId: string) =>
  isDelegated(state, teamOfProject(state, projectId));

/** チームで AI の使用量を払う社員（チームの最初の社員。いなければ会社の最初の社員） */
export function teamOperator(state: GameState, teamId: string): string | null {
  return teamStaff(state, teamId)[0] ?? Object.keys(state.team)[0] ?? null;
}

/** 社員が仕事を抱えているか（人間の工程を処理中・待ち行列にいる・終わっていない Task の担い手） */
export function staffBusy(state: GameState, workerId: string): boolean {
  return (
    (state.humanQueues[workerId]?.length ?? 0) > 0 ||
    Object.values(state.projects).some((p) =>
      Object.values(p.tasks).some(
        (t) => t.status !== 'done' && (t.humanId === workerId || t.assignment?.workerId === workerId),
      ),
    )
  );
}

const replaceTeam = (state: GameState, team: TeamRun): GameState => ({
  ...state,
  teams: state.teams.map((t) => (t.id === team.id ? team : t)),
});

/** AI Worker を増やせない理由。増やせるなら null */
export function agentBlock(state: GameState): 'tutorial' | 'full' | null {
  if (state.tutorial) return 'tutorial';
  return state.agents.length >= tierOf(state).maxAiWorkers ? 'full' : null;
}

/** AI Worker を1つ増やす（直轄チームに入る）。増やせなければ state をそのまま返す */
export function addAgent(state: GameState): { state: GameState; workerId: string } | null {
  if (agentBlock(state) !== null) return null;
  const workerId = `${AGENT_PREFIX}${state.agents.length + 1}`;
  return {
    workerId,
    state: {
      ...state,
      agents: [...state.agents, workerId],
      sessions: { ...state.sessions, [workerId]: createSession() },
    },
  };
}

/** チームを作れない理由。作れるなら null */
export function teamBlock(state: GameState): 'locked' | 'full' | null {
  const tier = tierOf(state);
  if (!tier.managers || state.tutorial) return 'locked';
  return teamIds(state).length >= tier.maxTeams ? 'full' : null;
}

/** チームを作る（メンバーも案件もない、管理者のいないチーム）。作れなければ null */
export function createTeam(state: GameState): { state: GameState; teamId: string } | null {
  if (teamBlock(state) !== null) return null;
  const no = Math.max(1, ...state.teams.map((t) => t.no)) + 1;
  const teamId = `${TEAM_PREFIX}${no}`;
  const team: TeamRun = { id: teamId, no, members: [], projects: [], manager: null, intervened: false };
  return { teamId, state: { ...state, teams: [...state.teams, team] } };
}

/** 社員・AI Worker をチームから外す。人間 PM だったら、そのチームの管理者もいなくなる */
export function dropMember(state: GameState, workerId: string): GameState {
  return {
    ...state,
    teams: state.teams.map((t) => ({
      ...t,
      members: t.members.filter((m) => m !== workerId),
      manager: t.manager?.kind === 'human' && t.manager.staffId === workerId ? null : t.manager,
    })),
  };
}

/**
 * 社員・AI Worker をチームに移す。仕事を抱えている人・AI Worker は移せない（終わってから）。
 * 移せなければ state をそのまま返す
 */
export function moveMember(state: GameState, workerId: string, teamId: string): GameState {
  const known = inTeam(state, workerId) || state.agents.includes(workerId);
  const target = teamId === DIRECT || findTeam(state, teamId) !== undefined;
  if (!known || !target || teamOfWorker(state, workerId) === teamId || staffBusy(state, workerId)) return state;
  const dropped = dropMember(state, workerId);
  if (teamId === DIRECT) return dropped;
  const team = findTeam(dropped, teamId);
  return team ? replaceTeam(dropped, { ...team, members: [...team.members, workerId] }) : state;
}

/** 案件をチームに割り当てる（納品していない案件だけ）。割り当てられなければ state をそのまま返す */
export function moveProject(state: GameState, projectId: string, teamId: string): GameState {
  const run = state.projects[projectId];
  const target = teamId === DIRECT || findTeam(state, teamId) !== undefined;
  if (!run || run.completedAt !== null || !target || teamOfProject(state, projectId) === teamId) return state;
  const teams = state.teams.map((t) => ({
    ...t,
    projects: t.id === teamId ? [...t.projects, projectId] : t.projects.filter((p) => p !== projectId),
  }));
  return { ...state, teams };
}

/** 管理者を置けない理由。置けるなら null */
export function managerBlock(
  state: GameState,
  teamId: string,
  manager: ManagerRun,
): 'locked' | 'noTeam' | 'notMember' | 'busy' | null {
  if (!tierOf(state).managers) return 'locked';
  const team = findTeam(state, teamId);
  if (!team) return 'noTeam';
  if (manager.kind === 'ai') return null;
  if (!inTeam(state, manager.staffId) || !team.members.includes(manager.staffId)) return 'notMember';
  return staffBusy(state, manager.staffId) ? 'busy' : null;
}

/** チームの管理者を置く・替える・外す（null）。置いたら介入は解ける。置けなければ state をそのまま返す */
export function setManager(state: GameState, teamId: string, manager: ManagerRun | null): GameState {
  const team = findTeam(state, teamId);
  if (!team || (manager !== null && managerBlock(state, teamId, manager) !== null)) return state;
  return replaceTeam(state, { ...team, manager, intervened: false });
}

/** 介入する（一時的に直轄として担当を決める）・委任に戻す。管理者のいないチームではできない */
export function setIntervened(state: GameState, teamId: string, on: boolean): GameState {
  const team = findTeam(state, teamId);
  if (!team || team.manager === null || team.intervened === on) return state;
  return replaceTeam(state, { ...team, intervened: on });
}

/**
 * AI PM の見落とし（balance.manager.ai）。AI PM に委任した案件の AI の作業で、成功確率から引く量と事故の確率に足す量。
 * それ以外の案件・品質要求が低い Task では 0
 */
export function oversight(state: GameState, projectId: string, task: TaskDef): { miss: number; risk: number } {
  const teamId = teamOfProject(state, projectId);
  if (managerOf(state, teamId)?.kind !== 'ai' || !isDelegated(state, teamId)) return { miss: 0, risk: 0 };
  const a = balance.manager.ai;
  const over = Math.max(0, task.qualityReq - a.qualityPivot);
  return { miss: over * a.missPerQualityReq, risk: over * a.accidentPerQualityReq };
}

/** 管理者が今、運営している（委任されていて、進行中の案件がある）チームの人間 PM の社員か */
export function managingNow(state: GameState, staffId: string): boolean {
  return state.teams.some(
    (t) =>
      t.manager?.kind === 'human' &&
      t.manager.staffId === staffId &&
      !t.intervened &&
      teamProjects(state, t.id).length > 0,
  );
}

/**
 * 管理者の運営の費用。委任されていて進行中の案件があるチームでは、ステップごとに
 * 人間 PM の稼働（チームの人数に比例する分を人日に数え、給与はすべて人件費）か、AI PM の AI 費用と運用者の Seat の使用量を、進行中の案件に等分して計上する。
 * どちらも勤務時間（core/clock.ts）の分だけ計上する（AI PM は夜も担当を決めるが、費用は勤務時間あたりの契約とする）
 */
export const managementSystem: System = (state) => {
  if (!companyOpen(state) || !humansAtWork(state.clock)) return state;
  const tick = balance.time.tickMinutes;
  let next = state;
  for (const team of state.teams) {
    const manager = team.manager;
    const projects = teamProjects(state, team.id);
    if (!manager || team.intervened || projects.length === 0) continue;
    const share = 1 / projects.length;
    const load = Math.min(1, workingStaff(state, team.id).length * balance.manager.human.perMember);
    const minutes = manager.kind === 'human' ? tick * load * share : 0;
    const wage = manager.kind === 'human' ? laborCost(tick, dailyCost(getHuman(manager.staffId))) * share : 0;
    const ai = manager.kind === 'ai' ? balance.manager.ai.costPerMinute * tick * share : 0;
    const projectRuns = { ...next.projects };
    for (const id of projects) {
      const run = projectRuns[id];
      if (!run) continue;
      const m = run.management;
      projectRuns[id] = {
        ...run,
        management: { ...m, minutes: m.minutes + minutes, laborCost: m.laborCost + wage, aiCost: m.aiCost + ai },
      };
    }
    next = { ...next, projects: projectRuns };
    if (manager.kind === 'ai') {
      const op = teamOperator(next, team.id);
      if (op !== null) next = consumeStaffUsage(next, op, balance.manager.ai.usagePerMinute * tick);
    }
  }
  return next;
};

/** 社員の Seat から使用量を使う（AI PM は AI Worker ではないので、運用者を直接指定する） */
function consumeStaffUsage(state: GameState, staffId: string, amount: number): GameState {
  const run = state.team[staffId];
  if (!run) return state;
  return { ...state, team: { ...state.team, [staffId]: { ...run, used: run.used + amount } } };
}
