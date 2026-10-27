import { artifactCovers, documentsOf, handoffItems } from '../content/documents';
import { findWorker } from '../content/index';
import type { ContextFeed, HandoffItemId, IncidentId } from '../content/types';
import {
  type ContextReading,
  type ContextStatus,
  contextApplies,
  contextStatus,
  fedDocs,
  getSession,
  itemsToLose,
  projectNeededDocs,
  readContext,
} from '../core/context';
import type { GameState } from '../core/state';
import { isUnlocked } from '../core/unlocks';
import { projectAgent } from './project';

/** 資料のチェックリストの1行 */
export interface DocumentRowView {
  readonly id: string;
  readonly name: string;
  /** いま渡しているか */
  readonly fed: boolean;
  /** 案件のどれかの Task に必要か */
  readonly needed: boolean;
  readonly stale: boolean;
  readonly conflict: boolean;
}

/** Context の状態と操作（企画書9〜12章・41章）。基本は status の意味だけを見せ、開くと内訳と操作を見せる */
export interface ContextView {
  readonly workerId: string;
  readonly status: ContextStatus;
  readonly reading: ContextReading;
  readonly feed: ContextFeed['mode'];
  /** 選べる渡し方（解放済みのもの、並びは UI の順） */
  readonly feeds: readonly ContextFeed['mode'][];
  readonly docs: readonly DocumentRowView[];
  /** New Session と Handoff を出すか */
  readonly session: {
    readonly age: number;
    readonly handoff: readonly HandoffItemId[];
    /** 成果物に残るので選ばなくても失わない項目（Artifact Driven Work が有効なとき） */
    readonly covered: readonly HandoffItemId[];
    readonly items: readonly HandoffItemId[];
    readonly artifacts: boolean | null;
    readonly willLose: readonly HandoffItemId[];
    readonly lost: readonly HandoffItemId[];
    readonly recover: number;
  } | null;
  readonly incidents: readonly IncidentId[];
}

/**
 * Context の表示用データ（純粋関数）。資料のない案件や、Context の機能が未解放なら null。
 * 案件の AI Worker の Session を、案件全体の目で読み取る（readContext の taskId: null）。
 */
export function contextView(state: GameState, projectId: string): ContextView | null {
  const worker = findWorker(projectAgent(state, projectId));
  if (!worker || !contextApplies(projectId) || !isUnlocked(state, 'context')) return null;
  const session = getSession(state, worker.id);
  const reading = readContext(session, projectId, null);
  const fed = new Set(fedDocs(session.feed, projectId, null).map((d) => d.id));
  const needed = new Set(projectNeededDocs(projectId).map((d) => d.id));
  const feeds: ContextFeed['mode'][] = ['needed', 'all'];
  if (isUnlocked(state, 'context:pick')) feeds.push('pick');
  if (isUnlocked(state, 'context:router')) feeds.push('router');
  return {
    workerId: worker.id,
    status: contextStatus(reading),
    reading,
    feed: session.feed.mode,
    feeds,
    docs: documentsOf(projectId).map((d) => ({
      id: d.id,
      name: d.name,
      fed: fed.has(d.id),
      needed: needed.has(d.id),
      stale: d.stale,
      conflict: d.conflictsWith.length > 0,
    })),
    session: isUnlocked(state, 'session')
      ? {
          age: session.age,
          handoff: session.handoff,
          covered: session.artifacts ? artifactCovers : [],
          items: handoffItems,
          artifacts: isUnlocked(state, 'session:artifacts') ? session.artifacts : null,
          willLose: itemsToLose(session),
          lost: session.recover > 0 ? session.lost : [],
          recover: session.recover,
        }
      : null,
    incidents: state.incidents.filter((r) => r.workerId === worker.id && r.projectId === projectId).map((r) => r.id),
  };
}

/** 資料を1つ渡す・外すときの、個別に選んだ渡し方 */
export function toggleDoc(state: GameState, projectId: string, workerId: string, docId: string): ContextFeed {
  const fed = fedDocs(getSession(state, workerId).feed, projectId, null).map((d) => d.id);
  const docs = fed.includes(docId) ? fed.filter((id) => id !== docId) : [...fed, docId];
  return { mode: 'pick', docs };
}
