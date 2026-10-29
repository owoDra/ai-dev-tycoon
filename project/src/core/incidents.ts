import { getAssignMode, primaryActor } from '../content/assignModes';
import { balance } from '../content/balance';
import { content, getTask } from '../content/index';
import type {
  HarnessCategory,
  IncidentAction,
  IncidentDef,
  IncidentId,
  IncidentMetric,
  IncidentMoment,
} from '../content/types';
import { autonomyOf } from './autonomy';
import { tierAtLeast } from './companyEvents';
import { type ContextReading, dropDocs, getSession, newSession, readContext, updateSession } from './context';
import type { GameEvent } from './events';
import { appliesTo, equipPart, equippedParts, harnessModifiers, removePart } from './harness';
import type { GameState, IncidentRun } from './state';
import type { System, SystemContext } from './system';
import { isUnlocked } from './unlocks';

/*
 * 事件（企画書19章）。定義（content/incidents.ts）の発生条件を読み取り値（Context・Harness・Task・Autonomy）で評価し、
 * 定義の時点（AI の作業の開始・修復の開始・人間の確認に回るとき）に確率で発生させる。
 * 発生中の事件は、その AI Worker の作業に影響する。事件ごとの特別扱いはここに書かず、すべて定義のデータで表す。
 */

export function getIncidentDef(id: IncidentId): IncidentDef {
  const def = content.incidents.find((d) => d.id === id);
  if (!def) throw new Error(`未定義の事件: ${id}`);
  return def;
}

/** Context 以外の読み取り値（意味は IncidentMetric の説明のとおり） */
export interface WorkReading {
  readonly retries: number;
  readonly streak: number;
  readonly unvalidated: number;
  readonly subagents: number;
  readonly humanQueue: number;
  /** 事件の Task に効いている、強制する部品のカテゴリ（事件の guard と照らし合わせる） */
  readonly guards: readonly HarnessCategory[];
}

/**
 * 事件の発生条件の読み取り値。Context だけの読み取り値（core/context.ts の readContext）も渡せる
 * （そのときほかの値は 0 で、防ぐ部品はないとみなす）
 */
export type IncidentReading = ContextReading & Partial<WorkReading>;

const metricOf = (reading: IncidentReading, metric: IncidentMetric): number => reading[metric] ?? 0;

/** 防ぐ部品が効いているか */
function guarded(def: IncidentDef, reading: IncidentReading): boolean {
  return def.guard?.some((c) => reading.guards?.includes(c)) ?? false;
}

/** 発生確率。読み取り値が threshold を超えた分に比例し、max で頭打ちにする。防ぐ部品が効いていれば 0 */
export function incidentChance(def: IncidentDef, reading: IncidentReading): number {
  if (guarded(def, reading)) return 0;
  const over = metricOf(reading, def.trigger.metric) - def.trigger.threshold;
  return over > 0 ? Math.min(def.trigger.max, over * def.trigger.perUnit) : 0;
}

/** 発生条件を満たしているか（満たさなくなった事件は解消する） */
export function incidentHolds(def: IncidentDef, reading: IncidentReading): boolean {
  return !guarded(def, reading) && metricOf(reading, def.trigger.metric) > def.trigger.threshold;
}

/** AI Worker の仕事で、人間の手が空くのを待っている件数（待ち行列の先頭は処理中なので数えない） */
function waitingForHumans(state: GameState, workerId: string): number {
  let n = 0;
  for (const queue of Object.values(state.humanQueues)) {
    for (const q of queue.slice(1)) {
      const assignment = state.projects[q.projectId]?.tasks[q.taskId]?.assignment;
      if (assignment?.workerId === workerId && primaryActor(getAssignMode(assignment.mode)) === 'ai') n++;
    }
  }
  return n;
}

/** AI Worker の、その Task の作業から見た読み取り値（純粋関数） */
export function readIncident(state: GameState, workerId: string, projectId: string, taskId: string): IncidentReading {
  const task = getTask(projectId, taskId);
  const run = state.projects[projectId]?.tasks[taskId];
  const parts = equippedParts(state, workerId);
  const mode = run?.assignment ? getAssignMode(run.assignment.mode) : null;
  const checked =
    mode === null ||
    mode.steps.some((s) => s.phase === 'review') ||
    harnessModifiers(state, workerId, task).evalCatch > 0;
  return {
    ...readContext(getSession(state, workerId), projectId, taskId),
    retries: run?.status === 'running' ? run.reworks : 0,
    streak: autonomyOf(state, workerId).streak,
    unvalidated: checked ? 0 : 1,
    subagents: parts.filter((p) => p.category === 'subagent').length,
    humanQueue: waitingForHumans(state, workerId),
    guards: [...new Set(parts.filter((p) => p.enforcement === 'system' && appliesTo(p, task)).map((p) => p.category))],
  };
}

const readRun = (state: GameState, run: IncidentRun) => readIncident(state, run.workerId, run.projectId, run.taskId);

const isFor = (run: IncidentRun, workerId: string) => run.workerId === workerId;

/** AI Worker に発生中の事件 */
export function activeIncidents(state: GameState, workerId: string): IncidentRun[] {
  return state.incidents.filter((r) => isFor(r, workerId));
}

/** 発生中の事件の影響。成功確率から引く量の合計と、AI の作業時間・人間の指示出しと確認の時間の倍率の積 */
export interface IncidentEffects {
  readonly successPenalty: number;
  readonly aiTimeFactor: number;
  readonly humanTimeFactor: number;
}

/** 発生中の事件が AI Worker の作業に与える影響 */
export function incidentEffects(state: GameState, workerId: string): IncidentEffects {
  let successPenalty = 0;
  let aiTimeFactor = 1;
  let humanTimeFactor = 1;
  for (const run of activeIncidents(state, workerId)) {
    const { effect } = getIncidentDef(run.id);
    successPenalty += effect.successPenalty;
    aiTimeFactor *= effect.aiTimeFactor;
    humanTimeFactor *= effect.humanTimeFactor;
  }
  return { successPenalty, aiTimeFactor, humanTimeFactor };
}

/** moment の時点で、まだ起きていない事件を発生確率で起こす（解放されていない事件と、会社が序盤の規模のうちは起きない） */
export function rollIncidents(
  state: GameState,
  moment: IncidentMoment,
  workerId: string,
  projectId: string,
  taskId: string,
  ctx: SystemContext,
): GameState {
  if (state.board !== null && !tierAtLeast(state, balance.companyEvents.later.incidents)) return state;
  let next = state;
  let reading: IncidentReading | null = null;
  for (const def of content.incidents) {
    if (def.moment !== moment || !isUnlocked(next, def.unlock)) continue;
    if (next.incidents.some((r) => r.id === def.id && isFor(r, workerId))) continue;
    reading ??= readIncident(next, workerId, projectId, taskId);
    const p = incidentChance(def, reading);
    if (p <= 0 || !ctx.rng.chance(p)) continue;
    ctx.emit({ type: 'IncidentStarted', incident: def.id, workerId, projectId, taskId });
    next = {
      ...next,
      incidents: [...next.incidents, { id: def.id, workerId, projectId, taskId, since: next.clock }],
      contextStats: { ...next.contextStats, incidents: next.contextStats.incidents + 1 },
    };
  }
  return next;
}

/** 事件の Task に効く最初の部品（どれも効かなければ先頭） */
function partFor(run: IncidentRun, parts: readonly string[]): string | undefined {
  const task = getTask(run.projectId, run.taskId);
  return parts.find((id) => content.harnessParts.some((p) => p.id === id && appliesTo(p, task))) ?? parts[0];
}

function applyAction(
  state: GameState,
  run: IncidentRun,
  action: IncidentAction,
  emit: (e: GameEvent) => void,
): GameState {
  switch (action.type) {
    case 'SetContextFeed':
      return updateSession(state, run.workerId, (s) => ({ ...s, feed: action.feed }));
    case 'NewSession':
      return newSession(state, run.workerId, emit);
    case 'DropDocs':
      return dropDocs(state, run.workerId, run.projectId, action.which);
    case 'EquipPart': {
      const partId = partFor(run, action.parts);
      if (partId === undefined) return state;
      const next = equipPart(state, run.workerId, partId, (p) => isUnlocked(state, p.unlock));
      if (next !== state) emit({ type: 'HarnessChanged', workerId: run.workerId, change: 'equip', id: partId });
      return next;
    }
    case 'TrimParts': {
      const extra = equippedParts(state, run.workerId)
        .filter((p) => p.category === action.category)
        .slice(action.keep);
      let next = state;
      for (const p of extra.reverse()) {
        next = removePart(next, run.workerId, p.id);
        emit({ type: 'HarnessChanged', workerId: run.workerId, change: 'remove', id: p.id });
      }
      return next;
    }
  }
}

function resolved(state: GameState, run: IncidentRun, emit: (e: GameEvent) => void): GameState {
  emit({ type: 'IncidentResolved', incident: run.id, workerId: run.workerId });
  return {
    ...state,
    incidents: state.incidents.filter((r) => r !== run),
    contextStats: { ...state.contextStats, resolved: state.contextStats.resolved + 1 },
  };
}

/** 事件の解決アクションを順に適用し、事件を解消する。発生していなければ state をそのまま返す */
export function resolveIncident(
  state: GameState,
  id: IncidentId,
  workerId: string,
  emit: (e: GameEvent) => void,
): GameState {
  const run = state.incidents.find((r) => r.id === id && isFor(r, workerId));
  if (!run) return state;
  let next = state;
  for (const action of getIncidentDef(id).resolve) next = applyAction(next, run, action, emit);
  return resolved(next, run, emit);
}

/** 発生条件を満たさなくなった事件（プレイヤーが自分で原因を取り除いた・人間が確認して Streak が途切れたなど）を解消する */
export function settleIncidents(state: GameState, emit: (e: GameEvent) => void): GameState {
  let next = state;
  for (const run of state.incidents) {
    if (!incidentHolds(getIncidentDef(run.id), readRun(next, run))) next = resolved(next, run, emit);
  }
  return next;
}

/** 時間の経過で条件を満たさなくなった事件（待ち行列が空いた・Task が終わったなど）を解消する */
export const incidentSystem: System = (state, ctx) =>
  state.incidents.length === 0 ? state : settleIncidents(state, (e) => ctx.emit(e));
