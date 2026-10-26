import { primaryActor } from '../content/assignModes';
import { balance, type GameSpeed } from '../content/balance';
import { content, findWorker } from '../content/index';
import type { AssignModeId, ContextFeed, FeatureId, HandoffItemId, IncidentId } from '../content/types';
import { allFeatures, modeFeature } from '../content/unlocks';
import { newSession, updateSession } from './context';
import type { GameEvent } from './events';
import { resolveIncident, settleIncidents } from './incidents';
import { settleProgress } from './progress';
import { createTaskRun, type GameState, updateTask } from './state';
import { isAllowed } from './tutorial';
import { isUnlocked } from './unlocks';

/** プレイヤー操作。状態を変える唯一の入口 */
export type Command =
  | { readonly type: 'SetSpeed'; readonly speed: GameSpeed }
  | { readonly type: 'TogglePause' }
  | { readonly type: 'StartProject'; readonly projectId: string }
  /**
   * Task の担当を決める。依存が未完了でも先に決めておける。開始後は変更できない。
   * workerId はモードの主な担い手（AI が関わるモードでは AI Worker）。人間の工程は空いている人が担う。
   */
  | {
      readonly type: 'AssignTask';
      readonly projectId: string;
      readonly taskId: string;
      readonly mode: AssignModeId;
      readonly workerId: string;
    }
  /** チュートリアルをやめる。残りの機能をすべて解放し、案件はそのまま続ける */
  | { readonly type: 'SkipTutorial' }
  /** AI Worker の Session に渡す資料を決める（企画書10章）。pick の資料は、その AI Worker が作業する案件のもの */
  | { readonly type: 'SetContextFeed'; readonly workerId: string; readonly feed: ContextFeed }
  /** 次の Reset で残す項目を決める（企画書11章） */
  | { readonly type: 'SetHandoff'; readonly workerId: string; readonly items: readonly HandoffItemId[] }
  /** Artifact Driven Work（企画書12章）の切り替え */
  | { readonly type: 'SetArtifactDriven'; readonly workerId: string; readonly on: boolean }
  /** Session を始め直す。履歴のノイズは 0 になり、Handoff で残さなかった項目は失われる */
  | { readonly type: 'NewSession'; readonly workerId: string }
  /** 事件の解決アクション（content/incidents.ts の resolve）を実行する */
  | { readonly type: 'ResolveIncident'; readonly incident: IncidentId; readonly workerId: string };

export interface Transition {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

const unchanged = (state: GameState): Transition => ({ state, events: [] });

/**
 * Command を適用する。無効な Command（チュートリアルの今のステップで許していない操作・未解放のモードを含む）は
 * 状態を変えず、events も出さない。状態が変わったら、解放とチュートリアルの進行を判定する。
 */
export function reduce(state: GameState, command: Command): Transition {
  if (!isAllowed(state, command)) return unchanged(state);
  const result = apply(state, command);
  if (result.state === state) return result;
  const events = [...result.events];
  const emit = (e: GameEvent) => events.push(e);
  const settled = settleProgress(settleIncidents(result.state, emit), emit);
  return { state: settled, events };
}

function apply(state: GameState, command: Command): Transition {
  switch (command.type) {
    case 'SetSpeed': {
      if (command.speed === state.speed || !balance.time.speeds.includes(command.speed)) {
        return unchanged(state);
      }
      return { state: { ...state, speed: command.speed }, events: [{ type: 'SpeedChanged', speed: command.speed }] };
    }
    case 'TogglePause': {
      const paused = !state.paused;
      return { state: { ...state, paused }, events: [{ type: 'PauseToggled', paused }] };
    }
    case 'StartProject': {
      const def = content.projects.find((p) => p.id === command.projectId);
      if (!def || state.projects[def.id]) return unchanged(state);
      const tasks = Object.fromEntries(def.tasks.map((t) => [t.id, createTaskRun()]));
      const run = { projectId: def.id, startedAt: state.clock, completedAt: null, tasks };
      return { state: { ...state, projects: { ...state.projects, [def.id]: run } }, events: [] };
    }
    case 'AssignTask': {
      const run = state.projects[command.projectId]?.tasks[command.taskId];
      const mode = content.assignModes.find((m) => m.id === command.mode);
      const worker = findWorker(command.workerId);
      if (
        run?.status !== 'waiting' ||
        !mode ||
        !isUnlocked(state, modeFeature(mode.id)) ||
        worker?.kind !== primaryActor(mode)
      ) {
        return unchanged(state);
      }
      const assignment = { mode: mode.id, workerId: worker.id };
      return { state: updateTask(state, command.projectId, command.taskId, (r) => ({ ...r, assignment })), events: [] };
    }
    case 'SkipTutorial': {
      if (!state.tutorial) return unchanged(state);
      const events: GameEvent[] = allFeatures
        .filter((f) => !state.unlocked.includes(f))
        .map((feature) => ({ type: 'FeatureUnlocked', feature }));
      events.push({ type: 'TutorialEnded', skipped: true });
      return { state: { ...state, tutorial: null, unlocked: allFeatures }, events };
    }
    case 'SetContextFeed': {
      const { feed, workerId } = command;
      const valid = feed.mode !== 'pick' || feed.docs.every((id) => content.documents.some((d) => d.id === id));
      if (!isAi(workerId) || !valid || !isUnlocked(state, feedFeature[feed.mode])) return unchanged(state);
      return { state: updateSession(state, workerId, (s) => ({ ...s, feed })), events: [] };
    }
    case 'SetHandoff': {
      if (!isAi(command.workerId) || !isUnlocked(state, 'session')) return unchanged(state);
      const items = [...new Set(command.items)];
      return { state: updateSession(state, command.workerId, (s) => ({ ...s, handoff: items })), events: [] };
    }
    case 'SetArtifactDriven': {
      if (!isAi(command.workerId) || !isUnlocked(state, 'session:artifacts')) return unchanged(state);
      return { state: updateSession(state, command.workerId, (s) => ({ ...s, artifacts: command.on })), events: [] };
    }
    case 'NewSession': {
      if (!isAi(command.workerId) || !isUnlocked(state, 'session')) return unchanged(state);
      const events: GameEvent[] = [];
      return { state: newSession(state, command.workerId, (e) => events.push(e)), events };
    }
    case 'ResolveIncident': {
      const events: GameEvent[] = [];
      const next = resolveIncident(state, command.incident, command.workerId, (e) => events.push(e));
      return { state: next, events };
    }
  }
}

/** 資料の渡し方ごとに必要な機能 */
const feedFeature: Readonly<Record<ContextFeed['mode'], FeatureId>> = {
  needed: 'context',
  all: 'context',
  pick: 'context:pick',
  router: 'context:router',
};

const isAi = (workerId: string) => findWorker(workerId)?.kind === 'ai';
