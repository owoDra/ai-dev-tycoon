import { balance } from '../../src/content/balance';
import { getHuman, getProject } from '../../src/content/index';
import { openInquiries } from '../../src/core/board';
import { type Command, reduce } from '../../src/core/commands';
import { tierOf } from '../../src/core/company';
import type { GameEvent } from '../../src/core/events';
import { scoreCompany } from '../../src/core/scoring';
import { createInitialState, type GameState, type ManagerRun } from '../../src/core/state';
import { step } from '../../src/core/step';
import { teamFull } from '../../src/core/team';
import {
  agentBlock,
  DIRECT,
  isDelegated,
  projectDelegated,
  staffBusy,
  teamAgents,
  teamBlock,
  teamOfProject,
  teamProjects,
  workingStaff,
} from '../../src/core/teams';
import { FITTED } from './fitted';

/*
 * 会社を育てる戦略 Bot（画面なし）。チュートリアルなしで始めた会社で、届いた引き合いすべてに基準の価格で見積を出し、
 * 直轄チームの案件は smart の担当（AI 適性の高い Task は AI → 人間レビュー、残りは得意で手の空いている人）で進める。
 * AI Worker には Harness（Skill・Hook・Eval と必要な Tool・権限）を付ける（素の AI は割に合わない。balance.harness.bare）。
 * 進行中の案件が人数に比べて多ければ採用し、AI Worker を増やせるなら増やす。
 * 管理者を置ける規模になったら、チームを作って社員の半分と AI Worker を移し、管理者（manager）に任せる。
 * 新しく受注した案件は、仕事の少ない方のチームに割り当てる。
 */

const DAY = balance.time.minutesPerDay;
const CHUNK = 30;
/** smart が AI に任せる AI 適性の下限（tests/helpers/strategies.ts の smart と同じ） */
const SMART_APTITUDE = 0.6;
/** 社員1人あたりの進行中の案件がこれを超えたら採用する */
const PROJECTS_PER_STAFF = 0.5;

export interface GrowthRecord {
  readonly day: number;
  readonly from: string;
  readonly tier: string;
  readonly profit: number;
  readonly reputation: number;
  readonly delivered: number;
  readonly staff: number;
  readonly agents: number;
  readonly teams: number;
}

export interface GrowthResult {
  readonly state: GameState;
  readonly promotions: readonly GrowthRecord[];
  readonly events: readonly GameEvent[];
}

const apply = (s: GameState, c: Command) => reduce(s, c).state;

/** 直轄チームの、担当の決まっていない Task を smart で決める */
function assignDirect(state: GameState): GameState {
  let s = state;
  for (const projectId of teamProjects(s, DIRECT)) {
    for (const t of getProject(projectId).tasks) {
      if (s.projects[projectId]?.tasks[t.id]?.assignment !== null) continue;
      const ai = t.aiAptitude >= SMART_APTITUDE;
      const agent = teamAgents(s, DIRECT)[0] ?? s.agents[0] ?? '';
      const humans = workingStaff(s, DIRECT);
      const human = [...humans].sort((a, b) => Number(staffBusy(s, a)) - Number(staffBusy(s, b)))[0] ?? '';
      s = apply(s, {
        type: 'AssignTask',
        projectId,
        taskId: t.id,
        mode: ai ? 'aiThenHumanReview' : 'human',
        workerId: ai ? agent : human,
      });
    }
  }
  return s;
}

/** 進行中の案件が人数に比べて多ければ、その日の候補で一番速い人を採用する */
function hireIfNeeded(state: GameState): GameState {
  const active = Object.values(state.projects).filter((p) => p.completedAt === null).length;
  const staff = Object.keys(state.team).length;
  if (teamFull(state) || active <= staff * PROJECTS_PER_STAFF) return state;
  const best = [...state.market.candidates].sort((a, b) => getHuman(b).skill - getHuman(a).skill)[0];
  return best ? apply(state, { type: 'Hire', staffId: best }) : state;
}

/** AI Worker に Harness の部品を付ける（付いていない部品だけ） */
function equipAgents(state: GameState): GameState {
  let s = state;
  for (const workerId of s.agents) {
    const parts = s.harnesses[workerId]?.parts ?? [];
    for (const partId of FITTED) if (!parts.includes(partId)) s = apply(s, { type: 'EquipPart', workerId, partId });
  }
  return s;
}

/** 管理者を置けるようになったらチームを作り、手の空いた社員の半分と AI Worker を移して管理者に任せる */
function organize(state: GameState, manager: ManagerRun['kind']): GameState {
  let s = state;
  if (agentBlock(s) === null) s = apply(s, { type: 'AddAiWorker' });
  if (teamBlock(s) === null && s.teams.length === 0) s = apply(s, { type: 'CreateTeam' });
  const team = s.teams[0];
  if (!team) return s;
  const direct = workingStaff(s, DIRECT);
  const wanted = Math.floor(Object.keys(s.team).length / 2);
  for (const id of direct.filter((h) => !staffBusy(s, h)).slice(0, Math.max(0, wanted - team.members.length))) {
    if (workingStaff(s, team.id).length + (team.manager ? 1 : 0) >= wanted) break;
    s = apply(s, { type: 'MoveMember', workerId: id, teamId: team.id });
  }
  const spare = s.agents.find((id) => teamAgents(s, DIRECT).includes(id) && id !== s.agents[0]);
  if (spare && teamAgents(s, team.id).length === 0)
    s = apply(s, { type: 'MoveMember', workerId: spare, teamId: team.id });
  if (!s.teams[0]?.manager) {
    const pm = manager === 'human' ? workingStaff(s, team.id).find((id) => !staffBusy(s, id)) : undefined;
    if (manager === 'ai' || pm) {
      s = apply(s, {
        type: 'SetManager',
        teamId: team.id,
        manager: pm ? { kind: 'human', staffId: pm } : { kind: 'ai' },
      });
    }
  }
  return s;
}

/** 新しく受注した直轄の案件（まだどの Task も始まっていない）を、仕事の少ない方のチームに割り当てる */
function distribute(state: GameState): GameState {
  const team = state.teams[0];
  if (!team || !isDelegated(state, team.id)) return state;
  let s = state;
  for (const projectId of teamProjects(s, DIRECT)) {
    const untouched = Object.values(s.projects[projectId]?.tasks ?? {}).every((t) => t.status === 'waiting');
    if (!untouched || projectDelegated(s, projectId)) continue;
    const load = (id: string) => teamProjects(s, id).length / Math.max(1, workingStaff(s, id).length);
    if (load(team.id) < load(DIRECT)) s = apply(s, { type: 'MoveProject', projectId, teamId: team.id });
  }
  return s;
}

/** 会社を days 営業日育て、昇格の記録を返す */
export function growCompany(seed: string, days: number, manager: ManagerRun['kind'] = 'human'): GrowthResult {
  let s = createInitialState(seed, { board: true, tutorial: false, talent: true });
  const promotions: GrowthRecord[] = [];
  const events: GameEvent[] = [];
  while (s.clock < days * DAY) {
    for (const projectId of openInquiries(s)) {
      s = apply(s, { type: 'SubmitBid', projectId, price: 'base', deadline: 'standard' });
    }
    s = hireIfNeeded(s);
    s = organize(s, manager);
    s = equipAgents(s);
    s = distribute(s);
    s = assignDirect(s);
    const r = step(s, CHUNK);
    s = r.state;
    events.push(...r.events.filter((e) => e.type !== 'TaskStarted' && e.type !== 'TaskCompleted'));
    for (const e of r.events) {
      if (e.type !== 'CompanyPromoted') continue;
      const c = scoreCompany(s);
      promotions.push({
        day: Math.floor(s.clock / DAY),
        from: e.from,
        tier: tierOf(s).name,
        profit: c.profit,
        reputation: s.reputation,
        delivered: c.delivered,
        staff: Object.keys(s.team).length,
        agents: s.agents.length,
        teams: 1 + s.teams.length,
      });
    }
  }
  return { state: s, promotions, events };
}

/** 案件のチーム（直轄か、作ったチーム）ごとの数 */
export function projectsByTeam(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(state.projects)) {
    const team = teamOfProject(state, id);
    out[team] = (out[team] ?? 0) + 1;
  }
  return out;
}
