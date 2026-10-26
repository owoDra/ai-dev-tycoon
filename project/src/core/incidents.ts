import { content } from '../content/index';
import type { IncidentAction, IncidentDef, IncidentId } from '../content/types';
import { type ContextReading, dropDocs, getSession, newSession, readContext, updateSession } from './context';
import type { GameEvent } from './events';
import type { GameState, IncidentRun } from './state';
import type { SystemContext } from './system';

/*
 * 事件（企画書19章）。定義（content/incidents.ts）の発生条件を Context の読み取り値で評価し、
 * AI が作業を始めるたびに確率で発生させる。発生中の事件は、その Session の AI の作業に影響する。
 */

export function getIncidentDef(id: IncidentId): IncidentDef {
  const def = content.incidents.find((d) => d.id === id);
  if (!def) throw new Error(`未定義の事件: ${id}`);
  return def;
}

/** 発生確率。読み取り値が threshold を超えた分に比例し、max で頭打ちにする */
export function incidentChance(def: IncidentDef, reading: ContextReading): number {
  const over = reading[def.trigger.metric] - def.trigger.threshold;
  return over > 0 ? Math.min(def.trigger.max, over * def.trigger.perUnit) : 0;
}

/** 発生条件を満たしているか（満たさなくなった事件は解消する） */
export function incidentHolds(def: IncidentDef, reading: ContextReading): boolean {
  return reading[def.trigger.metric] > def.trigger.threshold;
}

const isFor = (run: IncidentRun, workerId: string) => run.workerId === workerId;

/** AI Worker に発生中の事件 */
export function activeIncidents(state: GameState, workerId: string): IncidentRun[] {
  return state.incidents.filter((r) => isFor(r, workerId));
}

/** 発生中の事件が AI の作業に与える影響。成功確率から引く量の合計と、作業時間の倍率の積 */
export function incidentEffects(
  state: GameState,
  workerId: string,
): { readonly successPenalty: number; readonly aiTimeFactor: number } {
  let successPenalty = 0;
  let aiTimeFactor = 1;
  for (const run of activeIncidents(state, workerId)) {
    const def = getIncidentDef(run.id);
    successPenalty += def.effect.successPenalty;
    aiTimeFactor *= def.effect.aiTimeFactor;
  }
  return { successPenalty, aiTimeFactor };
}

/** AI が Task の作業を始めるときに、まだ起きていない事件を発生確率で起こす */
export function rollIncidents(
  state: GameState,
  workerId: string,
  projectId: string,
  taskId: string,
  ctx: SystemContext,
): GameState {
  const reading = readContext(getSession(state, workerId), projectId, taskId);
  let next = state;
  for (const def of content.incidents) {
    if (next.incidents.some((r) => r.id === def.id && isFor(r, workerId))) continue;
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

/** 発生条件を満たさなくなった事件（プレイヤーが自分で資料を外した・Reset したなど）を解消する */
export function settleIncidents(state: GameState, emit: (e: GameEvent) => void): GameState {
  let next = state;
  for (const run of state.incidents) {
    const reading = readContext(getSession(next, run.workerId), run.projectId, run.taskId);
    if (!incidentHolds(getIncidentDef(run.id), reading)) next = resolved(next, run, emit);
  }
  return next;
}
