import { primaryActor } from '../content/assignModes';
import { balance, type GameSpeed } from '../content/balance';
import { findDocument } from '../content/documents';
import { content, findProject, findWorker } from '../content/index';
import { seats } from '../content/seats';
import type { AssignModeId, ContextFeed, FeatureId, HandoffItemId, IncidentId, SeatId } from '../content/types';
import { allFeatures, modeFeature } from '../content/unlocks';
import { type DeadlineStep, type PriceStep, submitBid } from './bidding';
import { canStartProject } from './board';
import { newSession, updateSession } from './context';
import type { GameEvent } from './events';
import { workerHumanHours } from './expectation';
import { equipPart, removePart, setModel } from './harness';
import { resolveIncident, settleIncidents } from './incidents';
import { applyWorkflow, findWorkflow, saveWorkflow, type WorkflowDraft } from './library';
import { settleProgress } from './progress';
import type { ManagerRun } from './state';
import { createProjectRun, type GameState, updateTask } from './state';
import { hire, inTeam, release, setSeat } from './team';
import {
  addAgent,
  createTeam,
  isManager,
  moveMember,
  moveProject,
  projectDelegated,
  setIntervened,
  setManager,
} from './teams';
import { isAllowed } from './tutorial';
import { isUnlocked } from './unlocks';

/** プレイヤー操作。状態を変える唯一の入口 */
export type Command =
  | { readonly type: 'SetSpeed'; readonly speed: GameSpeed }
  | { readonly type: 'TogglePause' }
  /**
   * 案件を始める。案件ボードのある会社では、チュートリアルの案件だけ（ほかの案件はコンペで受注する）。進行中の案件と同時に進められる
   */
  | { readonly type: 'StartProject'; readonly projectId: string }
  /** 案件ボードの引き合いに見積を出す（締切までは出し直せる）。価格と納期は選択肢から選ぶ（core/bidding.ts） */
  | {
      readonly type: 'SubmitBid';
      readonly projectId: string;
      readonly price: PriceStep;
      readonly deadline: DeadlineStep;
    }
  /** 採用市場の候補を採用する。契約金を払って入社する。人員の上限に達していたらできない */
  | { readonly type: 'Hire'; readonly staffId: string }
  /** 社員を退職させる。担当している Task が終わっていなければできない。最後の1人は退職できない */
  | { readonly type: 'Release'; readonly staffId: string }
  /** 社員の Seat を変える（企画書6章）。固定費は日割りなので、変えた時点から新しい月額で計上する */
  | { readonly type: 'SetSeat'; readonly staffId: string; readonly seat: SeatId }
  /**
   * Task の担当を決める。依存が未完了でも先に決めておける。開始後は変更できない。
   * workerId はモードの主な担い手（AI が関わるモードでは AI Worker）。人間の工程は案件のチームの空いている人が担う。
   * 管理者に委任したチームの案件は、管理者の判断（by: 'manager'。core/manager.ts）だけが決められる
   */
  | {
      readonly type: 'AssignTask';
      readonly projectId: string;
      readonly taskId: string;
      readonly mode: AssignModeId;
      readonly workerId: string;
      readonly by?: 'manager';
    }
  /** AI Worker を1つ増やす（会社の規模の上限まで）。直轄チームに入る */
  | { readonly type: 'AddAiWorker' }
  /** チームを作る（管理者を置ける規模から、チーム数の上限まで） */
  | { readonly type: 'CreateTeam' }
  /** 社員・AI Worker をチームに移す（teamId は core/teams.ts の DIRECT か、作ったチーム）。仕事を抱えていたら移せない */
  | { readonly type: 'MoveMember'; readonly workerId: string; readonly teamId: string }
  /** 進行中の案件をチームに割り当てる */
  | { readonly type: 'MoveProject'; readonly projectId: string; readonly teamId: string }
  /** チームの管理者を置く・替える（人間 PM はそのチームの社員）・外す（null） */
  | { readonly type: 'SetManager'; readonly teamId: string; readonly manager: ManagerRun | null }
  /** 委任したチームに介入する（一時的に直轄として担当を決める）・委任に戻す */
  | { readonly type: 'Intervene'; readonly teamId: string; readonly on: boolean }
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
    }
  /** AI Worker の構成と担当モードの組を、Workflow Library に名前を付けて保存する（企画書25章） */
  | { readonly type: 'SaveLibraryWorkflow'; readonly workflow: WorkflowDraft }
  /**
   * Workflow Library の Workflow を Task に適用する。AI Worker の構成を Workflow に揃え、Task の担当を Workflow のモードにする。
   * まだ解放されていない部品は付けない
   */
  | {
      readonly type: 'ApplyLibraryWorkflow';
      readonly projectId: string;
      readonly taskId: string;
      readonly workflowId: string;
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
      const def = findProject(command.projectId);
      if (!def || !canStartProject(state, def.id)) return unchanged(state);
      const run = createProjectRun(def.id, state.clock);
      return { state: { ...state, projects: { ...state.projects, [def.id]: run } }, events: [] };
    }
    case 'SubmitBid': {
      const { projectId, price, deadline } = command;
      if (!(price in balance.bid.prices) || !(deadline in balance.bid.deadlines)) return unchanged(state);
      const next = submitBid(state, projectId, price, deadline);
      const bid = next.board?.inquiries.find((i) => i.projectId === projectId)?.bid;
      if (next === state || !bid) return unchanged(state);
      return {
        state: next,
        events: [{ type: 'BidSubmitted', projectId, amount: bid.amount, winChance: bid.winChance }],
      };
    }
    case 'AssignTask': {
      const run = state.projects[command.projectId]?.tasks[command.taskId];
      const mode = content.assignModes.find((m) => m.id === command.mode);
      const worker = findWorker(command.workerId);
      if (
        run?.status !== 'waiting' ||
        !mode ||
        projectDelegated(state, command.projectId) !== (command.by === 'manager') ||
        !isUnlocked(state, modeFeature(mode.id)) ||
        worker?.kind !== primaryActor(mode) ||
        (worker.kind === 'human' && (!inTeam(state, worker.id) || isManager(state, worker.id))) ||
        (worker.kind === 'ai' && !state.agents.includes(worker.id))
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
    case 'Hire': {
      if (!isUnlocked(state, 'hire')) return unchanged(state);
      const next = hire(state, command.staffId);
      return next === state
        ? unchanged(state)
        : { state: next, events: [{ type: 'StaffJoined', staffId: command.staffId }] };
    }
    case 'Release': {
      if (!isUnlocked(state, 'hire')) return unchanged(state);
      const next = release(state, command.staffId);
      return next === state
        ? unchanged(state)
        : { state: next, events: [{ type: 'StaffReleased', staffId: command.staffId }] };
    }
    case 'AddAiWorker': {
      const added = addAgent(state);
      return added
        ? { state: added.state, events: [{ type: 'AiWorkerAdded', workerId: added.workerId }] }
        : unchanged(state);
    }
    case 'CreateTeam': {
      const created = createTeam(state);
      return created
        ? { state: created.state, events: [{ type: 'TeamCreated', teamId: created.teamId }] }
        : unchanged(state);
    }
    case 'MoveMember': {
      const next = moveMember(state, command.workerId, command.teamId);
      return next === state ? unchanged(state) : { state: next, events: [] };
    }
    case 'MoveProject': {
      const next = moveProject(state, command.projectId, command.teamId);
      return next === state ? unchanged(state) : { state: next, events: [] };
    }
    case 'SetManager': {
      const next = setManager(state, command.teamId, command.manager);
      if (next === state) return unchanged(state);
      return {
        state: next,
        events: [{ type: 'ManagerAssigned', teamId: command.teamId, manager: command.manager?.kind ?? null }],
      };
    }
    case 'Intervene': {
      const next = setIntervened(state, command.teamId, command.on);
      return next === state ? unchanged(state) : { state: next, events: [] };
    }
    case 'SetSeat': {
      const { staffId, seat } = command;
      if (!isUnlocked(state, 'team') || !seats.some((s) => s.id === seat)) return unchanged(state);
      const next = setSeat(state, staffId, seat);
      return next === state ? unchanged(state) : { state: next, events: [{ type: 'SeatChanged', staffId, seat }] };
    }
    case 'SetContextFeed': {
      const { feed, workerId } = command;
      const valid = feed.mode !== 'pick' || feed.docs.every((id) => findDocument(id) !== undefined);
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
        projectDelegated(state, projectId) ||
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
    case 'SaveLibraryWorkflow': {
      if (!isUnlocked(state, 'harness')) return unchanged(state);
      const saved = saveWorkflow(state, command.workflow);
      return saved
        ? { state: saved.state, events: [{ type: 'WorkflowSaved', workflowId: saved.id }] }
        : unchanged(state);
    }
    case 'ApplyLibraryWorkflow': {
      const { projectId, taskId, workflowId, workerId } = command;
      const workflow = findWorkflow(state, workflowId);
      if (projectDelegated(state, projectId)) return unchanged(state);
      const applied = workflow && applyWorkflow(state, workflow, { projectId, taskId, workerId });
      if (!applied) return unchanged(state);
      const savedHumanHours = workerHumanHours(state, workerId) - workerHumanHours(applied.state, workerId);
      const { skipped } = applied;
      const event: GameEvent = {
        type: 'LibraryWorkflowApplied',
        workflowId,
        projectId,
        taskId,
        skipped,
        savedHumanHours,
      };
      return { state: applied.state, events: [event] };
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
