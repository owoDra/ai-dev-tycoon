import { agentModels, humanModels, incidentModels, type ModelId } from '../assets/catalog';
import { getAssignMode } from '../content/assignModes';
import { getProject, getTask, humans } from '../content/index';
import {
  type AgentRole,
  agentRoleByTask,
  defaultWorldLookId,
  type Expression,
  fallbackAgentRole,
  humanLookByWorker,
  humanLooks,
  type WorldLook,
  type WorldRewardLook,
  worldLooks,
} from '../content/look/world';
import type { IncidentId, Stage } from '../content/types';
import { findBottleneck } from '../core/bottleneck';
import { type ActorProfile, reworkMinutes, stepMinutes } from '../core/formulas';
import { equippedParts, harnessModifiers } from '../core/harness';
import { libraryWorkflows } from '../core/library';
import type { GameState, TaskRun } from '../core/state';
import { aiActor, currentStep } from '../core/taskFlow';
import { humanSpeed, teamMembers } from '../core/team';
import { ja } from '../i18n/ja';
import { conveyorId, EXIT_ID } from '../world/layout';
import { type TaskStatusView, taskRows } from './project';

/**
 * GameState を 2.5D ワールドの表示用データに変換するセレクタ（純粋関数）。
 * 描画（src/world）はこれを読むだけで、ゲームの状態を直接は見ない。
 * パケットとキャラクターの居場所は表示のための解釈で、core の状態には持たない。
 */

/** ワールドで選択できるものの ID（`island:<taskId>` `human:<workerId>` `agent:<taskId>` `packet:<...>`） */
export type EntityId = string;

export const islandId = (taskId: string): EntityId => `island:${taskId}`;
export const humanActorId = (workerId: string): EntityId => `human:${workerId}`;
export const agentActorId = (taskId: string): EntityId => `agent:${taskId}`;

export interface IslandView {
  readonly id: EntityId;
  readonly taskId: string;
  readonly label: string;
  readonly deps: readonly string[];
  readonly status: TaskStatusView;
  /** 実行中なら現在の工程の集計単位 */
  readonly stage: Stage | null;
  /** Task 全体の進み具合（0〜1） */
  readonly progress: number;
  /** 島の前に積み上がっているパケットの数（届いたが未着手の成果物と、人間を待っている仕事） */
  readonly queueLength: number;
  /** ボトルネックの強度（0〜1）。この島がボトルネックでなければ 0 */
  readonly bottleneck: number;
  /** 目立たせるべきボトルネックか（吹き出しのアイコン表示にも使う） */
  readonly isBottleneck: boolean;
}

export type ActorActivity = 'idle' | 'work' | 'cheer';

/**
 * Agent に付く小物（装着している Harness 部品）。belt: Hook（強制するルール）のギアのベルト /
 * shield: Eval のチェックの盾 / drones: 周りを回る Subagent の子機の数。人間は何も付けない
 */
export interface ActorGear {
  readonly belt: boolean;
  readonly shield: boolean;
  readonly drones: number;
}

export const NO_GEAR: ActorGear = { belt: false, shield: false, drones: 0 };

/** AI Worker の Harness から、Agent に付ける小物を決める */
export function gearOf(state: GameState, workerId: string): ActorGear {
  const parts = equippedParts(state, workerId);
  return {
    belt: parts.some((p) => p.category === 'hook' && p.enforcement === 'system'),
    shield: parts.some((p) => p.category === 'eval'),
    drones: parts.filter((p) => p.category === 'subagent').length,
  };
}

export interface ActorView {
  readonly id: EntityId;
  readonly kind: 'human' | 'ai';
  readonly model: ModelId;
  readonly label: string;
  /** いる島。null なら休憩所 */
  readonly islandId: EntityId | null;
  readonly activity: ActorActivity;
  readonly expression: Expression;
  readonly bottleneck: number;
  readonly isBottleneck: boolean;
  readonly gear: ActorGear;
}

export type PacketPlace =
  /** コンベアの上を progress（0〜1）まで進んでいる */
  | { readonly kind: 'belt'; readonly conveyorId: string; readonly progress: number }
  /** 島の前に積まれて待っている（index は下から数えた段） */
  | { readonly kind: 'stack'; readonly islandId: EntityId; readonly index: number }
  /** 島のデスクの上で処理されている */
  | { readonly kind: 'desk'; readonly islandId: EntityId }
  /** 出口に届いた（納品済み） */
  | { readonly kind: 'exit'; readonly index: number };

export interface PacketView {
  readonly id: EntityId;
  /** どの Task の成果物か */
  readonly taskId: string;
  readonly label: string;
  readonly place: PacketPlace;
}

/** 事件の「バグ生物」。事件の起きた Task の島に出る */
export interface IncidentBugView {
  readonly id: EntityId;
  readonly incident: IncidentId;
  readonly islandId: EntityId;
  readonly model: ModelId;
}

export interface WorldViewModel {
  readonly projectId: string;
  readonly started: boolean;
  readonly paused: boolean;
  readonly islands: readonly IslandView[];
  readonly actors: readonly ActorView[];
  readonly packets: readonly PacketView[];
  /** 最大のボトルネック（強度が threshold 未満なら null） */
  readonly bottleneck: { readonly entityId: EntityId; readonly intensity: number } | null;
  /** 自動化レーンに変わったコンベア（Workflow で前後の Task が AI どうしでつながる区間）の id */
  readonly lanes: readonly string[];
  /** 発生中の事件のバグ生物 */
  readonly incidents: readonly IncidentBugView[];
  /** 整理度（0〜1、企画書61章）。良い業務設計ほどオフィスが明るく整う */
  readonly tidiness: number;
  /** ライブラリ棚のバインダーの数（Workflow Library の Workflow の数。企画書25章） */
  readonly binders: number;
}

/** 発生中の事件のうち、この案件のもの */
export function incidentBugs(state: GameState, projectId: string): IncidentBugView[] {
  return state.incidents
    .filter((r) => r.projectId === projectId)
    .map((r) => ({
      id: `incident:${r.id}:${r.workerId}`,
      incident: r.id,
      islandId: islandId(r.taskId),
      model: incidentModels[r.id],
    }));
}

/**
 * 整理度（0〜1、企画書61章「良い業務設計をすると画面自体が綺麗になる」）。
 * 人間の仕事が減って（AI に任せた仕事の割合）、AI の仕事がレビューや Eval で守られている（確認のある割合）ほど高く、
 * 発生中の事件があると下がる。割合は Task の作業量で数え、担当が決まっていない Task は人間の仕事とみなす
 */
export function tidinessOf(
  state: GameState,
  projectId: string,
  reward: Pick<WorldRewardLook, 'automatedWeight' | 'validatedWeight' | 'incidentPenalty'>,
): number {
  const run = state.projects[projectId];
  if (!run) return 0;
  let total = 0;
  let automated = 0;
  let validated = 0;
  for (const task of getProject(projectId).tasks) {
    total += task.effort;
    const assignment = run.tasks[task.id]?.assignment;
    if (!assignment) continue;
    const mode = getAssignMode(assignment.mode);
    if (!mode.steps.some((s) => s.actor === 'ai')) continue;
    automated += task.effort;
    const checked =
      mode.steps.some((s) => s.phase === 'review') || harnessModifiers(state, assignment.workerId, task).evalCatch > 0;
    if (checked) validated += task.effort;
  }
  if (total === 0) return 0;
  const incidents = state.incidents.filter((r) => r.projectId === projectId).length;
  const score =
    (reward.automatedWeight * automated + reward.validatedWeight * validated) / total -
    reward.incidentPenalty * incidents;
  return Math.min(1, Math.max(0, score));
}

/** 前後の Task がどちらも連鎖するモード（Agent Workflow）なら、その間のコンベアは自動化レーン */
export function automatedLanes(state: GameState, projectId: string): string[] {
  const tasks = state.projects[projectId]?.tasks;
  const chains = (taskId: string) => {
    const mode = tasks?.[taskId]?.assignment?.mode;
    return mode !== undefined && getAssignMode(mode).chains;
  };
  return getProject(projectId).tasks.flatMap((t) =>
    chains(t.id) ? t.deps.filter(chains).map((d) => conveyorId(d, t.id)) : [],
  );
}

export type WorldViewLook = Pick<WorldLook, 'flow' | 'bottleneck' | 'character'> & Partial<Pick<WorldLook, 'reward'>>;

/** 実行中の Task の進み具合（0〜1）。工程の数で等分し、現在の工程の中は残り時間で補う */
export function taskProgress(state: GameState, projectId: string, taskId: string, run: TaskRun): number {
  if (run.status === 'done') return 1;
  if (run.status !== 'running' || !run.assignment) return 0;
  const steps = getAssignMode(run.assignment.mode).steps;
  const task = getTask(projectId, taskId);
  const skill = run.humanId ? humanSpeed(run.humanId, task) : 1;
  const step = currentStep(run);
  let total = 0;
  if (run.phase === 'rework') total = reworkMinutes(task, skill);
  else if (step) {
    const actor: ActorProfile = step.actor === 'ai' ? aiActor(state, run, task) : { kind: 'human', skill };
    total = stepMinutes(task, step, actor);
  }
  const within = total > 0 ? Math.min(1, Math.max(0, 1 - run.remaining / total)) : 0;
  return Math.min(1, (run.stepIndex + within) / steps.length);
}

/** 人間の Worker の見た目。対応表になければ humanLooks を並び順に割り当てる */
export function humanModelOf(workerId: string): ModelId {
  const index = humans.findIndex((h) => h.id === workerId);
  const look = humanLookByWorker[workerId] ?? humanLooks[Math.max(0, index) % humanLooks.length] ?? 'bob';
  return humanModels[look];
}

export function agentRoleOf(taskId: string): AgentRole {
  return agentRoleByTask[taskId] ?? fallbackAgentRole;
}

export function worldView(state: GameState, projectId: string, look: WorldViewLook): WorldViewModel {
  const def = getProject(projectId);
  const run = state.projects[projectId];
  const now = state.clock + state.carryMinutes;
  const rows = new Map(taskRows(state, projectId).map((r) => [r.id, r]));
  const travel = look.flow.travelMinutes;

  // ボトルネック
  const found = findBottleneck(state);
  const intensity = found ? Math.min(1, found.minutes / look.bottleneck.fullMinutes) : 0;
  let bottleneckEntity: EntityId | null = null;
  if (found?.ref.kind === 'stage' && found.ref.projectId === projectId) bottleneckEntity = islandId(found.ref.taskId);
  if (found?.ref.kind === 'human') bottleneckEntity = humanActorId(found.ref.humanId);
  const strengthOf = (id: EntityId) => (id === bottleneckEntity ? intensity : 0);
  const flagged = (id: EntityId) => strengthOf(id) > 0 && strengthOf(id) >= look.bottleneck.threshold;

  // パケット
  const packets: PacketView[] = [];
  const stacks = new Map<EntityId, number>();
  const stackAt = (island: EntityId) => {
    const index = stacks.get(island) ?? 0;
    stacks.set(island, index + 1);
    return index;
  };
  const label = (taskId: string) => ja.world.packet(getTask(projectId, taskId).name);
  let delivered = 0;
  if (run) {
    for (const task of def.tasks) {
      const from = run.tasks[task.id];
      if (from?.status !== 'done' || from.completedAt === null) continue;
      const progress = (now - from.completedAt) / travel;
      const targets = def.tasks.filter((t) => t.deps.includes(task.id)).map((t) => t.id);
      for (const to of targets.length > 0 ? targets : [EXIT_ID]) {
        const id = `packet:${conveyorId(task.id, to)}`;
        const cid = conveyorId(task.id, to);
        if (progress < 1) {
          packets.push({
            id,
            taskId: task.id,
            label: label(task.id),
            place: { kind: 'belt', conveyorId: cid, progress },
          });
        } else if (to === EXIT_ID) {
          packets.push({ id, taskId: task.id, label: label(task.id), place: { kind: 'exit', index: delivered++ } });
        } else if (run.tasks[to]?.status === 'waiting') {
          // 届いたが、次の Task がまだ始まっていない
          const island = islandId(to);
          packets.push({
            id,
            taskId: task.id,
            label: label(task.id),
            place: { kind: 'stack', islandId: island, index: stackAt(island) },
          });
        }
      }
    }
    for (const task of def.tasks) {
      const row = rows.get(task.id);
      if (row?.status !== 'running' && row?.status !== 'queued') continue;
      const island = islandId(task.id);
      const place: PacketPlace =
        row.status === 'queued'
          ? { kind: 'stack', islandId: island, index: stackAt(island) }
          : { kind: 'desk', islandId: island };
      packets.push({ id: `packet:${task.id}`, taskId: task.id, label: label(task.id), place });
    }
  }

  const islands: IslandView[] = def.tasks.map((task) => {
    const row = rows.get(task.id);
    const id = islandId(task.id);
    const t = run?.tasks[task.id];
    return {
      id,
      taskId: task.id,
      label: task.name,
      deps: task.deps,
      status: row?.status ?? 'unassigned',
      stage: row?.stage ?? null,
      progress: t ? taskProgress(state, projectId, task.id, t) : 0,
      queueLength: stacks.get(id) ?? 0,
      bottleneck: strengthOf(id),
      isBottleneck: flagged(id),
    };
  });

  // キャラクター
  const projectDone = run?.completedAt !== null && run?.completedAt !== undefined;
  // 人は案件をまたいで共有するので、どのフロアにも会社の全員を出す（別のフロアの仕事中は休憩所に立つ）
  const actors: ActorView[] = teamMembers(state).map((h) => {
    const queue = state.humanQueues[h.id] ?? [];
    const head = queue[0]?.projectId === projectId ? queue[0] : undefined;
    const id = humanActorId(h.id);
    const working = head !== undefined;
    const crowded = queue.length >= 2 || flagged(id);
    const expression: Expression = projectDone ? 'joy' : crowded ? 'trouble' : working ? 'focus' : 'normal';
    return {
      id,
      kind: 'human',
      model: humanModelOf(h.id),
      label: h.name,
      islandId: head ? islandId(head.taskId) : null,
      activity: projectDone ? 'cheer' : working ? 'work' : 'idle',
      expression,
      bottleneck: strengthOf(id),
      isBottleneck: flagged(id),
      gear: NO_GEAR,
    };
  });
  if (run) {
    for (const task of def.tasks) {
      const t = run.tasks[task.id];
      if (!t?.assignment || !getAssignMode(t.assignment.mode).steps.some((s) => s.actor === 'ai')) continue;
      const cheering =
        t.status === 'done' && t.completedAt !== null && now - t.completedAt < look.character.cheerMinutes;
      if (t.status !== 'running' && !cheering) continue;
      const aiWorking = currentStep(t)?.actor === 'ai';
      const waitingHuman = rows.get(task.id)?.status === 'queued';
      const role = agentRoleOf(task.id);
      actors.push({
        id: agentActorId(task.id),
        kind: 'ai',
        model: agentModels[role],
        label: ja.world.agentRoles[role],
        islandId: islandId(task.id),
        activity: cheering ? 'cheer' : aiWorking ? 'work' : 'idle',
        expression: cheering ? 'joy' : aiWorking ? 'focus' : waitingHuman ? 'trouble' : 'normal',
        bottleneck: 0,
        isBottleneck: false,
        gear: gearOf(state, t.assignment.workerId),
      });
    }
  }

  return {
    projectId,
    started: run !== undefined,
    paused: state.paused,
    islands,
    actors,
    packets,
    bottleneck:
      bottleneckEntity && intensity >= look.bottleneck.threshold ? { entityId: bottleneckEntity, intensity } : null,
    lanes: automatedLanes(state, projectId),
    incidents: incidentBugs(state, projectId),
    tidiness: tidinessOf(state, projectId, look.reward ?? worldLooks[defaultWorldLookId].reward),
    binders: libraryWorkflows(state).length,
  };
}

export type EntityKind = 'island' | 'human' | 'agent' | 'packet';

/** 選択したものの種類と表示名。ViewModel にない（消えた）ものなら null */
export function describeEntity(vm: WorldViewModel, entityId: EntityId): { kind: EntityKind; label: string } | null {
  const island = vm.islands.find((i) => i.id === entityId);
  if (island) return { kind: 'island', label: island.label };
  const actor = vm.actors.find((a) => a.id === entityId);
  if (actor) return { kind: actor.kind === 'human' ? 'human' : 'agent', label: actor.label };
  const packet = vm.packets.find((p) => p.id === entityId);
  if (packet) return { kind: 'packet', label: packet.label };
  return null;
}
