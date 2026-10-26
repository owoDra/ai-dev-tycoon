import { primaryActor } from '../content/assignModes';
import { balance, type GameSpeed } from '../content/balance';
import { content, findWorker } from '../content/index';
import { seats } from '../content/seats';
import type { AssignModeId, ContextFeed, FeatureId, HandoffItemId, IncidentId, SeatId } from '../content/types';
import { allFeatures, modeFeature } from '../content/unlocks';
import { canStartProject } from './campaign';
import { newSession, updateSession } from './context';
import type { GameEvent } from './events';
import { workerHumanHours } from './expectation';
import { equipPart, removePart, setModel } from './harness';
import { resolveIncident, settleIncidents } from './incidents';
import { settleProgress } from './progress';
import { createTaskRun, type GameState, updateTask } from './state';
import { inTeam, setSeat } from './team';
import { isAllowed } from './tutorial';
import { isUnlocked } from './unlocks';

/** プレイヤー操作。状態を変える唯一の入口 */
export type Command =
  | { readonly type: 'SetSpeed'; readonly speed: GameSpeed }
  | { readonly type: 'TogglePause' }
  /** 案件を始める（受注する）。キャンペーンでは受注できるようになった案件だけ。進行中の案件と同時に進められる */
  | { readonly type: 'StartProject'; readonly projectId: string }
  /** 社員の Seat を変える（企画書6章）。固定費は日割りなので、変えた時点から新しい月額で計上する */
  | { readonly type: 'SetSeat'; readonly staffId: string; readonly seat: SeatId }
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
  | { readonly type: 'ResolveIncident'; readonly incident: IncidentId; readonly workerId: string }
  /** AI Worker の Model を変える（Harness Builder） */
  | { readonly type: 'SetModel'; readonly workerId: string; readonly modelId: string }
  /** Harness 部品を装着する。同じ group の部品は付け替える。初めての部品は導入コストを払う */
  | { readonly type: 'EquipPart'; readonly workerId: string; readonly partId: string }
  | { readonly type: 'RemovePart'; readonly workerId: string; readonly partId: string }
  /**
   * 複数の Task を1つの Workflow にまとめて AI Worker に任せる（企画書5章）。どれも Agent Workflow の担当になり、
   * 前の Task から指示出しなしで続けて実行する。まだ始まっていない Task が2件以上必要
   */
  | {
      readonly type: 'AssignWorkflow';
      readonly projectId: string;
      readonly taskIds: readonly string[];
      readonly workerId: string;
    };

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
      if (!def || !canStartProject(state, def.id)) return unchanged(state);
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
        worker?.kind !== primaryActor(mode) ||
        (worker.kind === 'human' && !inTeam(state, worker.id))
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
    case 'SetSeat': {
      const { staffId, seat } = command;
      if (!isUnlocked(state, 'team') || !seats.some((s) => s.id === seat)) return unchanged(state);
      const next = setSeat(state, staffId, seat);
      return next === state ? unchanged(state) : { state: next, events: [{ type: 'SeatChanged', staffId, seat }] };
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
    case 'SetModel': {
      if (!isUnlocked(state, 'harness')) return unchanged(state);
      const next = setModel(state, command.workerId, command.modelId);
      return harnessChanged(state, next, command.workerId, 'model', command.modelId);
    }
    case 'EquipPart': {
      const next = equipPart(state, command.workerId, command.partId, (p) => isUnlocked(state, p.unlock));
      return harnessChanged(state, next, command.workerId, 'equip', command.partId);
    }
    case 'RemovePart': {
      const next = removePart(state, command.workerId, command.partId);
      return harnessChanged(state, next, command.workerId, 'remove', command.partId);
    }
    case 'AssignWorkflow': {
      const { projectId, workerId } = command;
      const taskIds = [...new Set(command.taskIds)];
      const runs = taskIds.map((id) => state.projects[projectId]?.tasks[id]);
      if (
        taskIds.length < balance.assign.workflowMinTasks ||
        !isAi(workerId) ||
        !isUnlocked(state, modeFeature('agentWorkflow')) ||
        runs.some((r) => r?.status !== 'waiting')
      ) {
        return unchanged(state);
      }
      let next = state;
      for (const taskId of taskIds) {
        next = updateTask(next, projectId, taskId, (r) => ({ ...r, assignment: { mode: 'agentWorkflow', workerId } }));
      }
      return { state: next, events: [{ type: 'WorkflowAssigned', projectId, taskIds }] };
    }
  }
}

/** Harness を変えたときの出来事。変更で減る人間時間の見込みを添える（大きければ Tier 3 の演出） */
function harnessChanged(
  before: GameState,
  after: GameState,
  workerId: string,
  change: 'equip' | 'remove' | 'model',
  id: string,
): Transition {
  if (after === before) return unchanged(before);
  const savedHumanHours = workerHumanHours(before, workerId) - workerHumanHours(after, workerId);
  return { state: after, events: [{ type: 'HarnessChanged', workerId, change, id, savedHumanHours }] };
}

/** 資料の渡し方ごとに必要な機能 */
const feedFeature: Readonly<Record<ContextFeed['mode'], FeatureId>> = {
  needed: 'context',
  all: 'context',
  pick: 'context:pick',
  router: 'context:router',
};

const isAi = (workerId: string) => findWorker(workerId)?.kind === 'ai';
