import { balance } from '../content/balance';
import { findWorker, getProject } from '../content/index';
import type { ProjectSize } from '../content/types';
import type { Command } from '../core/commands';
import { goalProgress, tierOf } from '../core/company';
import { perPersonDay } from '../core/formulas';
import { scoreProject } from '../core/scoring';
import type { GameState, ManagerRun } from '../core/state';
import {
  agentBlock,
  DIRECT,
  findTeam,
  isDelegated,
  isManager,
  managerBlock,
  staffBusy,
  teamAgents,
  teamBlock,
  teamIds,
  teamName,
  teamOfProject,
  teamProjects,
  teamStaff,
} from '../core/teams';
import { ja } from '../i18n/ja';

const t = ja.teams;

/** 会社の規模と、次の段階への昇格の条件 */
export interface CompanyView {
  readonly tier: string;
  readonly next: {
    readonly name: string;
    readonly items: readonly {
      readonly id: 'profit' | 'reputation' | 'delivered';
      readonly label: string;
      readonly now: number;
      readonly need: number;
      readonly done: boolean;
    }[];
  } | null;
}

/** チームの1人（社員か AI Worker）と、移す先の選択肢 */
export interface TeamMemberView {
  readonly id: string;
  readonly name: string;
  readonly kind: 'human' | 'ai';
  readonly pm: boolean;
  /** 移せない理由（仕事中）。移せるなら null */
  readonly blocked: string | null;
  readonly moves: readonly { readonly teamId: string; readonly label: string; readonly command: Command }[];
  /** この人を人間 PM にする Command（置けなければ null） */
  readonly appoint: Command | null;
}

/** チームのカード（進捗・利益 / 人日・問題） */
export interface TeamCardView {
  readonly id: string;
  readonly name: string;
  readonly direct: boolean;
  readonly manager: ManagerRun['kind'] | null;
  readonly managerName: string | null;
  readonly delegated: boolean;
  readonly intervened: boolean;
  readonly members: readonly TeamMemberView[];
  readonly projects: readonly {
    readonly projectId: string;
    readonly name: string;
    readonly progress: number;
    readonly moves: readonly { readonly teamId: string; readonly label: string; readonly command: Command }[];
  }[];
  /** チームの進行中の案件の完了した Task の割合 */
  readonly progress: number;
  /** チームの案件（納品済みを含む）の 利益 / 人日。人間が稼働していなければ null */
  readonly profitPerPersonDay: number | null;
  /** 問題の数（発生中の事件と、納期を過ぎた案件） */
  readonly problems: number;
  readonly setAiPm: Command | null;
  readonly removeManager: Command | null;
  readonly intervene: Command | null;
}

export interface TeamsView {
  readonly company: CompanyView;
  readonly teams: readonly TeamCardView[];
  readonly createTeam: Command | null;
  readonly createBlocked: string | null;
  readonly addAgent: Command | null;
  readonly agentBlocked: string | null;
  readonly agents: { readonly count: number; readonly max: number };
}

/** 会社の規模の表示用データ */
export function companyView(state: GameState): CompanyView {
  // 最上位の段階では、次の格付け（★）を目標にする
  const p = goalProgress(state);
  const r = ja.company.requires;
  return {
    tier: tierOf(state).name,
    next: p && {
      name: p.tier.name,
      items: (['profit', 'reputation', 'delivered'] as const).map((id) => ({
        id,
        label: r[id],
        now: p[id].now,
        need: p[id].need,
        done: p[id].now >= p[id].need,
      })),
    },
  };
}

/** チームに属する案件（直轄は、どのチームにも割り当てていない案件。納品済みを含む） */
const projectsOf = (state: GameState, teamId: string) =>
  Object.keys(state.projects).filter((id) => teamOfProject(state, id) === teamId);

function memberView(state: GameState, teamId: string, id: string): TeamMemberView {
  const w = findWorker(id);
  const busy = staffBusy(state, id);
  const pm = isManager(state, id);
  const human = w?.kind === 'human';
  const candidate: ManagerRun = { kind: 'human', staffId: id };
  return {
    id,
    name: w?.name ?? id,
    kind: human ? 'human' : 'ai',
    pm,
    blocked: busy ? t.moveBusy : null,
    moves: busy
      ? []
      : teamIds(state)
          .filter((to) => to !== teamId)
          .map((to) => ({
            teamId: to,
            label: teamName(state, to),
            command: { type: 'MoveMember', workerId: id, teamId: to },
          })),
    appoint:
      human && !pm && teamId !== DIRECT && managerBlock(state, teamId, candidate) === null
        ? { type: 'SetManager', teamId, manager: candidate }
        : null,
  };
}

function cardView(state: GameState, teamId: string): TeamCardView {
  const team = findTeam(state, teamId);
  const manager = team?.manager ?? null;
  const active = teamProjects(state, teamId);
  let profit = 0;
  let minutes = 0;
  let done = 0;
  let total = 0;
  let late = 0;
  for (const id of projectsOf(state, teamId)) {
    const s = scoreProject(state, id);
    const run = state.projects[id];
    if (!s || !run) continue;
    profit += s.profit;
    minutes += s.humanMinutes;
    if (run.completedAt !== null) continue;
    const tasks = Object.values(run.tasks);
    done += tasks.filter((x) => x.status === 'done').length;
    total += tasks.length;
    if (state.clock - run.startedAt > run.deadlineDays * balance.time.minutesPerDay) late++;
  }
  const incidents = state.incidents.filter((i) => active.includes(i.projectId)).length;
  const others = teamIds(state).filter((to) => to !== teamId);
  const managerName =
    manager === null ? null : manager.kind === 'ai' ? t.aiPm : (findWorker(manager.staffId)?.name ?? t.humanPm);
  return {
    id: teamId,
    name: teamName(state, teamId),
    direct: teamId === DIRECT,
    manager: manager?.kind ?? null,
    managerName,
    delegated: isDelegated(state, teamId),
    intervened: team?.intervened ?? false,
    members: [...teamStaff(state, teamId), ...teamAgents(state, teamId)].map((id) => memberView(state, teamId, id)),
    projects: active.map((projectId) => {
      const tasks = Object.values(state.projects[projectId]?.tasks ?? {});
      return {
        projectId,
        name: getProject(projectId).name,
        progress: tasks.length > 0 ? tasks.filter((x) => x.status === 'done').length / tasks.length : 0,
        moves: others.map((to) => ({
          teamId: to,
          label: teamName(state, to),
          command: { type: 'MoveProject', projectId, teamId: to },
        })),
      };
    }),
    progress: total > 0 ? done / total : 0,
    profitPerPersonDay: minutes > 0 ? perPersonDay(profit, minutes) : null,
    problems: incidents + late,
    setAiPm:
      team && manager?.kind !== 'ai' && managerBlock(state, teamId, { kind: 'ai' }) === null
        ? { type: 'SetManager', teamId, manager: { kind: 'ai' } }
        : null,
    removeManager: manager ? { type: 'SetManager', teamId, manager: null } : null,
    intervene: manager ? { type: 'Intervene', teamId, on: !(team?.intervened ?? false) } : null,
  };
}

/** チームの一覧と編成の画面の表示用データ（純粋関数） */
export function teamsView(state: GameState): TeamsView {
  const tb = teamBlock(state);
  const ab = agentBlock(state);
  return {
    company: companyView(state),
    teams: teamIds(state).map((id) => cardView(state, id)),
    createTeam: tb === null ? { type: 'CreateTeam' } : null,
    createBlocked: tb === null ? null : t.createBlocked[tb],
    addAgent: ab === null ? { type: 'AddAiWorker' } : null,
    agentBlocked: ab === null ? null : t.agentBlocked[ab],
    agents: { count: state.agents.length, max: tierOf(state).maxAiWorkers },
  };
}

/** 昇格で新しく解放された要素の案内（通知の文言） */
export function promotionNotes(state: GameState, fromTierId: GameState['tier']): string[] {
  const c = ja.company;
  const from = { ...balance.company.tiers[fromTierId] };
  const to = tierOf(state);
  const notes: string[] = [];
  if (to.maxStaff > from.maxStaff) notes.push(c.unlockedStaff(to.maxStaff));
  if (to.maxAiWorkers > from.maxAiWorkers) notes.push(c.unlockedAi(to.maxAiWorkers));
  if (to.maxTeams > from.maxTeams) notes.push(c.unlockedTeams(to.maxTeams));
  if (to.managers && !from.managers) notes.push(c.unlockedManagers);
  if (to.inquiries > from.inquiries) notes.push(c.unlockedInquiries(to.inquiries));
  const sizes = (Object.keys(to.sizes) as ProjectSize[]).filter((s) => to.sizes[s] > 0 && from.sizes[s] === 0);
  if (sizes.length > 0) notes.push(c.unlockedSizes(sizes.join('・')));
  return notes;
}

/** プレイ中の案件のチームの札（ワールドとタブに出す）。チームが直轄だけなら null */
export function projectTeamBadge(state: GameState, projectId: string): string | null {
  if (state.teams.length === 0) return null;
  const teamId = teamOfProject(state, projectId);
  const team = findTeam(state, teamId);
  const manager = team?.manager;
  const label = !manager ? t.direction : team.intervened ? t.intervened : manager.kind === 'ai' ? t.aiPm : t.humanPm;
  return ja.teams.worldBadge(teamName(state, teamId), label);
}
