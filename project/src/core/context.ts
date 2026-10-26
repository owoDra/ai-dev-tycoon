import { balance } from '../content/balance';
import { artifactCovers, documentsOf, handoffItems } from '../content/documents';
import type { ContextFeed, DocumentDef, HandoffItemId } from '../content/types';
import type { GameEvent } from './events';
import { createSession, type GameState, type SessionRun } from './state';

/*
 * Context（企画書9〜12章）。AI Worker の Session に渡した資料と、Reset からの履歴から、
 * Task ごとの relevant と noise を計算する。資料を持たない案件では Context は常に良好で、何も影響しない。
 */

/** Context の読み取り値。大きさは balance.context.capacity に対する割合 */
export interface ContextReading {
  /** Task に役立つ情報（必要な資料と Handoff で引き継いだ状態）の割合 */
  readonly relevant: number;
  /** 余計な情報（Task に関係のない資料・古い仕様・履歴）の割合 */
  readonly noise: number;
  /** 使用率（relevant + noise）。1 以上で溢れている */
  readonly fill: number;
  /** Task に必要な資料のうち、渡せている割合（0〜1） */
  readonly coverage: number;
  /** 渡している古い仕様のうち、この Task に関係するものの数 */
  readonly stale: number;
  /** 渡している資料の中の、矛盾するルールの組の数 */
  readonly conflicts: number;
}

export type ContextStatus = 'good' | 'cluttered' | 'overflow';

/** 何も渡していない・資料のない案件の読み取り値 */
const CLEAR: ContextReading = { relevant: 0, noise: 0, fill: 0, coverage: 1, stale: 0, conflicts: 0 };

/** 資料を持つ案件だけで Context が働く */
export function contextApplies(projectId: string): boolean {
  return documentsOf(projectId).length > 0;
}

/** Task に必要な資料（役に立つと書かれていて、古くないもの） */
export function neededDocs(projectId: string, taskId: string): DocumentDef[] {
  return documentsOf(projectId).filter((d) => !d.stale && d.relevantTo.includes(taskId));
}

/** 案件のどれかの Task に必要な資料（「必要な資料だけ」で渡すもの） */
export function projectNeededDocs(projectId: string): DocumentDef[] {
  return documentsOf(projectId).filter((d) => !d.stale && d.conflictsWith.length === 0 && d.relevantTo.length > 0);
}

/** 渡し方に従って、その Task の作業で AI に渡る資料。taskId が null なら案件全体（Router は案件の必要な資料） */
export function fedDocs(feed: ContextFeed, projectId: string, taskId: string | null): DocumentDef[] {
  const docs = documentsOf(projectId);
  switch (feed.mode) {
    case 'all':
      return [...docs];
    case 'needed':
      return projectNeededDocs(projectId);
    case 'router':
      return taskId === null ? projectNeededDocs(projectId) : neededDocs(projectId, taskId);
    case 'pick':
      return docs.filter((d) => feed.docs.includes(d.id));
  }
}

/** 資料の大きさの合計 */
const sizeOf = (docs: readonly DocumentDef[]) => docs.reduce((sum, d) => sum + d.size, 0);

/** 履歴のノイズ（大きさ） */
export function driftSize(session: SessionRun): number {
  return session.age * balance.context.driftPerMinute;
}

/**
 * Session の Context を、その Task の作業から見て読み取る（純粋関数）。taskId が null なら案件全体で見る
 * （案件のどれかの Task に必要な資料を relevant に数える。Context の状態表示に使う）。
 */
export function readContext(session: SessionRun, projectId: string, taskId: string | null): ContextReading {
  if (!contextApplies(projectId)) return CLEAR;
  const { capacity } = balance.context;
  const fed = fedDocs(session.feed, projectId, taskId);
  const needed = taskId === null ? projectNeededDocs(projectId) : neededDocs(projectId, taskId);
  const useful = fed.filter((d) => needed.includes(d));
  const relevantSize = sizeOf(useful) + session.carried;
  const noiseSize = sizeOf(fed) - sizeOf(useful) + driftSize(session);
  const fedIds = new Set(fed.map((d) => d.id));
  const neededSize = sizeOf(needed);
  return {
    relevant: relevantSize / capacity,
    noise: noiseSize / capacity,
    fill: (relevantSize + noiseSize) / capacity,
    coverage: neededSize > 0 ? sizeOf(useful) / neededSize : 1,
    stale: fed.filter((d) => d.stale && (taskId === null || d.relevantTo.includes(taskId))).length,
    conflicts: fed.reduce((n, d) => n + d.conflictsWith.filter((o) => fedIds.has(o)).length, 0),
  };
}

/** 状態の意味（企画書41章）。溢れ > 散らかり > 良好 */
export function contextStatus(reading: ContextReading): ContextStatus {
  if (reading.fill >= 1) return 'overflow';
  if (reading.noise >= balance.context.clutteredNoise) return 'cluttered';
  return 'good';
}

/** Context が AI の作業に与える影響 */
export interface ContextEffects {
  /** 成功確率から引く量（誤判断率の上昇・必要な資料の欠け・溢れ・矛盾） */
  readonly successPenalty: number;
  /** 古い仕様を参照して失敗する確率 */
  readonly staleChance: number;
  /** AI 費用の倍率（AI 消費量の増加） */
  readonly costFactor: number;
  /** Tool を誤選択する確率（起きると作業時間が延びる） */
  readonly toolMissChance: number;
}

/** Context の読み取り値から AI の作業への影響を計算する（係数は balance.context） */
export function contextEffects(reading: ContextReading): ContextEffects {
  const c = balance.context;
  return {
    successPenalty:
      reading.noise * c.errorPerNoise +
      (1 - reading.coverage) * c.missingPenalty +
      (reading.fill >= 1 ? c.overflowPenalty : 0) +
      reading.conflicts * c.conflictPenalty,
    staleChance: reading.stale > 0 ? c.staleReferenceChance : 0,
    costFactor: 1 + reading.fill * c.costPerFill,
    toolMissChance: Math.min(1, reading.noise * c.toolMissPerNoise),
  };
}

/** Reset で失った項目が、まだ AI の作業に与える影響（成功確率から引く量と、把握し直しの時間の割合） */
export function lossEffects(session: SessionRun): { readonly successPenalty: number; readonly relearnShare: number } {
  if (session.recover <= 0) return { successPenalty: 0, relearnShare: 0 };
  let successPenalty = 0;
  let relearnShare = 0;
  for (const item of session.lost) {
    successPenalty += balance.handoff.loss[item].successPenalty;
    relearnShare += balance.handoff.loss[item].relearnShare;
  }
  return { successPenalty, relearnShare };
}

/** 今の設定で Reset したら失う項目。Handoff で残さず、成果物にも残らないもの。履歴がなければ何も失わない */
export function itemsToLose(session: SessionRun): HandoffItemId[] {
  if (session.age <= 0) return [];
  return handoffItems.filter((i) => !session.handoff.includes(i) && !(session.artifacts && artifactCovers.includes(i)));
}

export function getSession(state: GameState, workerId: string): SessionRun {
  return state.sessions[workerId] ?? createSession();
}

export function updateSession(state: GameState, workerId: string, fn: (s: SessionRun) => SessionRun): GameState {
  return { ...state, sessions: { ...state.sessions, [workerId]: fn(getSession(state, workerId)) } };
}

/**
 * New Session（企画書11章）。履歴のノイズを 0 にし、Handoff で残した項目を次の Session へ引き継ぐ。
 * 残さなかった項目は失われ、Reset 後の AI の作業 recoverWorks 回に影響する（Important Decisions Lost）。
 */
export function newSession(state: GameState, workerId: string, emit: (e: GameEvent) => void): GameState {
  const session = getSession(state, workerId);
  const history = session.age > 0;
  const lost = itemsToLose(session);
  const kept = history ? session.handoff.length : 0;
  emit({ type: 'SessionReset', workerId, lost });
  const next = updateSession(state, workerId, (s) => ({
    ...s,
    age: 0,
    carried: kept * balance.handoff.itemSize,
    lost,
    recover: lost.length > 0 ? balance.handoff.recoverWorks : 0,
  }));
  const stats = next.contextStats;
  return {
    ...next,
    contextStats: {
      ...stats,
      resets: stats.resets + 1,
      handoffResets: stats.handoffResets + (kept > 0 ? 1 : 0),
    },
  };
}

/**
 * 資料を外す。stale: 古い仕様 / conflicting: 矛盾するルール。外した残りを個別に選んだ渡し方にする。
 * 外すのは Session が今作業している案件（projectId）の資料。
 */
export function dropDocs(
  state: GameState,
  workerId: string,
  projectId: string,
  which: 'stale' | 'conflicting',
): GameState {
  const session = getSession(state, workerId);
  const fed = fedDocs(session.feed, projectId, null);
  const docs = fed.filter((d) => (which === 'stale' ? !d.stale : d.conflictsWith.length === 0)).map((d) => d.id);
  if (docs.length === fed.length) return state;
  return updateSession(state, workerId, (s) => ({ ...s, feed: { mode: 'pick', docs } }));
}
