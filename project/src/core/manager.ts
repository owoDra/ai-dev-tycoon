import { primaryActor } from '../content/assignModes';
import { balance } from '../content/balance';
import { content, getProject } from '../content/index';
import type { AssignModeDef, TaskDef } from '../content/types';
import { modeFeature } from '../content/unlocks';
import { type Command, reduce } from './commands';
import { expectTask, type TaskExpectation } from './expectation';
import { escapedDefectCost, escapedFixMinutes, laborCost, personDays } from './formulas';
import { hashSeed, next } from './rng';
import type { GameState, ManagerRun } from './state';
import type { System } from './system';
import { humanSpeed } from './team';
import { findTeam, isDelegated, isManager, teamAgents, teamProjects, workingStaff } from './teams';
import { isUnlocked } from './unlocks';

/*
 * 管理者の判断。委任されたチームの進行中の案件で、担当の決まっていない Task の担当モードと担当者を決める。
 * 判断は決定論的（state と seed だけから決まり、state の乱数は引かない）で、プレイヤーと同じ AssignTask の Command を発行して
 * reduce を通す（by: 'manager'）。
 *
 * どちらの管理者も、モードごとの見込み（core/expectation.ts）を balance.manager の式で評価し、最も高いモードを選ぶ。
 * - 人間 PM：見逃しの損害を正しく見積もり、ばらつきがない（Task の性質に合ったモードを選ぶ）
 * - AI PM：見逃しの損害を軽く見て（qualityWeight）、評価にばらつき（noise）がある。品質要求の低い案件ではほぼ最善を選ぶが、
 *   高い案件では人間のレビューを省きがちで、見逃しが増える
 */

/** 管理者の種類ごとの判断の癖 */
const styleOf = (manager: ManagerRun) => balance.manager[manager.kind];

/** 人間の時間（分）の評価上の費用（円）。原価と、利益 / 人日 のために人日を重く見る分 */
const humanTimeCost = (minutes: number) =>
  laborCost(minutes, balance.manager.wage) + personDays(minutes) * balance.manager.personDayValue;

/** 見逃した失敗1件の評価上の損害（円）。納品後の損害と、修正の人間の時間 */
const escapeLoss = (task: TaskDef) => escapedDefectCost(task) + humanTimeCost(escapedFixMinutes(task));

/** 評価のばらつき（−1〜1）。案件・Task・モードと seed から決まる */
function jitter(state: GameState, projectId: string, taskId: string, modeId: string): number {
  const [u] = next(hashSeed(`${state.seed}:pm:${projectId}:${taskId}:${modeId}`));
  return u - (1 - u);
}

/** モードの見込みの評価（円。高いほど良い） */
export function appraiseMode(
  state: GameState,
  manager: ManagerRun,
  projectId: string,
  task: TaskDef,
  modeId: string,
  e: TaskExpectation,
): number {
  const style = styleOf(manager);
  const cost =
    humanTimeCost(e.humanMinutes) + e.aiCost + e.accidentCost + e.pEscape * escapeLoss(task) * style.qualityWeight;
  const noise = jitter(state, projectId, task.id, modeId) * style.noise * laborCost(task.effort, balance.manager.wage);
  return noise - cost;
}

/** 担当者の候補の社員。チームの作業をする社員（いなければ、PM 以外の会社の社員） */
function staffPool(state: GameState, teamId: string): string[] {
  const own = workingStaff(state, teamId);
  return own.length > 0 ? own : Object.keys(state.team).filter((id) => !isManager(state, id));
}

/** 社員が抱えている、終わっていない人間だけのモードの Task の数 */
function humanLoad(state: GameState, staffId: string): number {
  let n = state.humanQueues[staffId]?.length ?? 0;
  for (const p of Object.values(state.projects)) {
    for (const t of Object.values(p.tasks)) {
      if (t.status !== 'done' && t.assignment?.workerId === staffId) n++;
    }
  }
  return n;
}

/** 人間だけのモードの担当者。得意で速い人を優先し、抱えている Task の多い人を避ける */
function pickStaff(state: GameState, pool: readonly string[], task: TaskDef): string | null {
  let best: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const id of pool) {
    const score = humanSpeed(id, task) - humanLoad(state, id);
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

/** 人間の工程を担う人の平均の速さ（AI が関わるモードの見込みに使う） */
function poolSpeed(pool: readonly string[], task: TaskDef): number {
  if (pool.length === 0) return 1;
  return pool.reduce((sum, id) => sum + humanSpeed(id, task), 0) / pool.length;
}

/** 1つの Task の担当の判断。選べるモードがなければ null */
export function decideTask(
  state: GameState,
  manager: ManagerRun,
  teamId: string,
  projectId: string,
  task: TaskDef,
): Command | null {
  const pool = staffPool(state, teamId);
  const agent = teamAgents(state, teamId)[0];
  const modes = content.assignModes.filter((m) => isUnlocked(state, modeFeature(m.id)));
  let best: Command | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const mode of modes) {
    const workerId = workerFor(state, mode, pool, agent, task);
    if (workerId === null) continue;
    const skill = primaryActor(mode) === 'human' ? humanSpeed(workerId, task) : poolSpeed(pool, task);
    const e = expectTask(state, projectId, task, mode, workerId, skill);
    const value = appraiseMode(state, manager, projectId, task, mode.id, e);
    if (value > bestValue) {
      bestValue = value;
      best = { type: 'AssignTask', projectId, taskId: task.id, mode: mode.id, workerId, by: 'manager' };
    }
  }
  return best;
}

function workerFor(
  state: GameState,
  mode: AssignModeDef,
  pool: readonly string[],
  agent: string | undefined,
  task: TaskDef,
): string | null {
  if (primaryActor(mode) === 'ai') return agent ?? null;
  return pickStaff(state, pool, task);
}

/** 委任されたチームの、担当の決まっていない Task への判断（案件を始めた順・Task の並び順）。委任されていなければ空 */
export function managerCommands(state: GameState, teamId: string, limit = Number.POSITIVE_INFINITY): Command[] {
  const manager = findTeam(state, teamId)?.manager;
  if (!manager || !isDelegated(state, teamId)) return [];
  const commands: Command[] = [];
  for (const projectId of teamProjects(state, teamId)) {
    const run = state.projects[projectId];
    for (const task of getProject(projectId).tasks) {
      const t = run?.tasks[task.id];
      if (t?.status !== 'waiting' || t.assignment !== null) continue;
      const command = decideTask(state, manager, teamId, projectId, task);
      if (command) commands.push(command);
      if (commands.length >= limit) return commands;
    }
  }
  return commands;
}

/**
 * 委任されたチームの管理者が判断する。判断した Command を順に reduce に通し（プレイヤーの操作と同じ経路）、出来事も出す。
 * 前の判断で担当が増えた後の state で次の Task を判断するので、同じ人に仕事が偏らない
 */
export const managerSystem: System = (state, ctx) => {
  let s = state;
  for (const team of state.teams) {
    if (!isDelegated(s, team.id)) continue;
    for (;;) {
      const command = managerCommands(s, team.id, 1)[0];
      if (!command) break;
      const result = reduce(s, command);
      if (result.state === s) break;
      for (const e of result.events) ctx.emit(e);
      s = result.state;
    }
  }
  return s;
};
