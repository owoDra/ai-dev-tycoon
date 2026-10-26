import { balance, type GameSpeed } from '../content/balance';
import { glossary } from '../content/glossary';
import { aiWorkers, humans } from '../content/index';
import type {
  AssignModeId,
  ContextFeed,
  ContextStatId,
  FeatureId,
  HandoffItemId,
  IncidentId,
  ModePhase,
  Stage,
  TermId,
} from '../content/types';
import { allFeatures, unlockDefs } from '../content/unlocks';
import type { BottleneckRef } from './bottleneck';
import type { ScheduledEvent } from './events';
import { hashSeed, type RngState } from './rng';

/**
 * Task の現在の工程。rework は人間のレビューで見つかった失敗の手戻り、repair は自動テストで見つかった失敗の AI による修復。
 * eval と evalRepair は Harness の Eval 部品による AI の作業の直後の検証と修復（Generate → Eval → Repair → Eval）
 */
export type TaskPhase = ModePhase | 'rework' | 'repair' | 'eval' | 'evalRepair';

export interface Assignment {
  readonly mode: AssignModeId;
  /** モードの主な担い手。AI が関わるモードでは AI Worker、人間だけのモードでは人間 */
  readonly workerId: string;
}

/** 実行中の Task の状態 */
export interface TaskRun {
  readonly assignment: Assignment | null;
  /** waiting: 未割り当てか依存が未完了 / running: 工程を処理中（人間の待ち行列に並んでいる間も含む） / done: 完了 */
  readonly status: 'waiting' | 'running' | 'done';
  /** 担当モードの steps の何番目を処理しているか */
  readonly stepIndex: number;
  readonly phase: TaskPhase | null;
  /** 現在の工程の残り時間（分） */
  readonly remaining: number;
  /** 現在の人間の工程を担う人 */
  readonly humanId: string | null;
  /** まだ発見されていない失敗を抱えているか */
  readonly defect: boolean;
  /** 失敗を見逃したまま完了したか */
  readonly escaped: boolean;
  readonly failures: number;
  readonly reworks: number;
  /** 完了時の品質（0〜1） */
  readonly quality: number | null;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
  /** 人間が実際に作業した時間（分） */
  readonly humanMinutes: number;
  /** AI が作業した時間（分） */
  readonly aiMinutes: number;
  readonly laborCost: number;
  readonly aiCost: number;
  /** 集計単位ごとのリードタイム（待ち時間を含む、分）。ボトルネック検出に使う */
  readonly lead: Readonly<Record<Stage, number>>;
  /** 今回の AI の作業で守られなかったお願いの Harness 部品 */
  readonly skipped: readonly string[];
  /** Eval → Repair を繰り返した回数（今回の作業の分） */
  readonly evalLoops: number;
  /** 起きた事故（権限・Tool の誤用）の数 */
  readonly accidents: number;
  /** AI が関わる Task で人間が介入した（指示出し・確認・手戻りの工程に入った）回数 */
  readonly interventions: number;
}

export interface ProjectRun {
  readonly projectId: string;
  readonly startedAt: number;
  readonly completedAt: number | null;
  /** TaskDef の並び順で持つ */
  readonly tasks: Readonly<Record<string, TaskRun>>;
}

/** 人間の待ち行列の1件。先頭だけが処理される */
export interface QueueItem {
  readonly projectId: string;
  readonly taskId: string;
  readonly queuedAt: number;
}

/**
 * AI Worker の Session（企画書9〜12章）。渡す資料と、Reset からの履歴を持つ。
 * relevant と noise は、ここと Task から core/context.ts が計算する
 */
export interface SessionRun {
  /** 資料の渡し方 */
  readonly feed: ContextFeed;
  /** Reset から AI が作業した時間（分）。長いほど履歴のノイズが溜まる */
  readonly age: number;
  /** 次の Reset で残す項目 */
  readonly handoff: readonly HandoffItemId[];
  /** Artifact Driven Work：成果物に作業状態を保存する */
  readonly artifacts: boolean;
  /** 直前の Reset で引き継がれた項目の大きさ（Context を占める） */
  readonly carried: number;
  /** 直前の Reset で失った項目。recover 回の AI の作業が終わるまで影響する */
  readonly lost: readonly HandoffItemId[];
  readonly recover: number;
}

/** 発生中の事件 */
export interface IncidentRun {
  readonly id: IncidentId;
  readonly workerId: string;
  readonly projectId: string;
  /** 事件のきっかけになった Task（Context の読み取りに使う） */
  readonly taskId: string;
  readonly since: number;
}

/** AI Worker の Harness（企画書8章）。Model と装着している部品 */
export interface HarnessRun {
  readonly modelId: string;
  /** 装着している部品の id（Context Router は Session の資料の渡し方で表すので含めない） */
  readonly parts: readonly string[];
}

/** Harness 部品の導入コストの支払い */
export interface HarnessLedgerEntry {
  readonly partId: string;
  readonly cost: number;
  readonly at: number;
}

/** Context に関わる出来事の回数。解放と用語の条件（contextStat）に使う */
export type ContextStats = Readonly<Record<ContextStatId, number>>;

/** 進行中のチュートリアル（台本は content/tutorial.ts） */
export interface TutorialRun {
  /** 今のステップの添字 */
  readonly step: number;
}

/**
 * ゲームの全状態。JSON にそのままシリアライズできる値（数値・文字列・真偽値・配列・素のオブジェクト）だけを持つ。
 * Map・class・関数・undefined は入れない。
 */
export interface GameState {
  /** ゲーム開始に使った seed。結果の再現・比較に使う */
  readonly seed: string;
  /** 乱数の現在状態 */
  readonly rng: RngState;
  /** ゲーム開始からの経過時間（ゲーム内の分）。固定ステップ幅の整数倍で進む */
  readonly clock: number;
  /** 固定ステップに満たず持ち越している時間（ゲーム内の分、0 以上 tickMinutes 未満）。描画の補間係数にも使う */
  readonly carryMinutes: number;
  /** 実時間あたりの進み方の倍率。シミュレーション結果には影響しない */
  readonly speed: GameSpeed;
  readonly paused: boolean;
  /** ゲーム内の存在物。後続の Phase で中身を定義する */
  readonly entities: Readonly<Record<string, never>>;
  /** 開始した案件（案件の id がキー） */
  readonly projects: Readonly<Record<string, ProjectRun>>;
  /** 人間ごとの作業・レビューの待ち行列（人間の Worker の id がキー）。人間1人は同時に1件しか処理しない */
  readonly humanQueues: Readonly<Record<string, readonly QueueItem[]>>;
  /** 現在のボトルネック */
  readonly bottleneck: BottleneckRef | null;
  /** 発火時刻待ちの出来事（at の昇順） */
  readonly pendingEvents: readonly ScheduledEvent[];
  /** 解放済みの機能（解放した順） */
  readonly unlocked: readonly FeatureId[];
  /** 名前を明かした用語（明かした順） */
  readonly revealed: readonly TermId[];
  /** 進行中のチュートリアル。チュートリアルでなければ null */
  readonly tutorial: TutorialRun | null;
  /** AI Worker ごとの Session（AI Worker の id がキー） */
  readonly sessions: Readonly<Record<string, SessionRun>>;
  /** 発生中の事件（発生した順） */
  readonly incidents: readonly IncidentRun[];
  readonly contextStats: ContextStats;
  /** AI Worker ごとの Harness（AI Worker の id がキー。なければ既定の Model で部品なし） */
  readonly harnesses: Readonly<Record<string, HarnessRun>>;
  /** 導入コストを払い、会社の資産になった部品（付け直しても再び払わない） */
  readonly ownedParts: readonly string[];
  /** 導入コストの支払い（払った順） */
  readonly harnessLedger: readonly HarnessLedgerEntry[];
}

export interface InitialStateOptions {
  /** チュートリアルとして始める。start の機能だけを解放し、用語はまだ明かさない */
  readonly tutorial?: boolean;
}

/**
 * ゲームの初期状態。チュートリアル以外は、解放の進み具合を持ち越す仕組み（Phase 13）ができるまで、
 * すべての機能を解放し、すべての用語を明かした状態で始める。
 */
export function createInitialState(seed: string, options: InitialStateOptions = {}): GameState {
  const tutorial = options.tutorial === true;
  return {
    seed,
    rng: hashSeed(seed),
    clock: 0,
    carryMinutes: 0,
    speed: balance.time.speeds[0],
    paused: false,
    entities: {},
    projects: {},
    humanQueues: createHumanQueues(),
    bottleneck: null,
    pendingEvents: [],
    unlocked: tutorial ? unlockDefs.filter((u) => u.when.type === 'start').map((u) => u.feature) : allFeatures,
    revealed: tutorial ? [] : glossary.map((g) => g.id),
    tutorial: tutorial ? { step: 0 } : null,
    sessions: createSessions(),
    incidents: [],
    contextStats: { resets: 0, handoffResets: 0, incidents: 0, resolved: 0, routedWorks: 0 },
    harnesses: {},
    ownedParts: [],
    harnessLedger: [],
  };
}

/**
 * 新しい Session。資料は最初「すべての資料」を渡している（とりあえず全部渡す、から始めて絞ることを覚える）。
 * Handoff は何も選んでいない（最初の Reset で「決定事項の喪失」を体験してから選ぶ）
 */
export function createSession(): SessionRun {
  return { feed: { mode: 'all' }, age: 0, handoff: [], artifacts: false, carried: 0, lost: [], recover: 0 };
}

export function createSessions(): Record<string, SessionRun> {
  return Object.fromEntries(aiWorkers.map((w) => [w.id, createSession()]));
}

export function createHumanQueues(): Record<string, readonly QueueItem[]> {
  return Object.fromEntries(humans.map((h) => [h.id, []]));
}

export function createTaskRun(): TaskRun {
  return {
    assignment: null,
    status: 'waiting',
    stepIndex: 0,
    phase: null,
    remaining: 0,
    humanId: null,
    defect: false,
    escaped: false,
    failures: 0,
    reworks: 0,
    quality: null,
    startedAt: null,
    completedAt: null,
    humanMinutes: 0,
    aiMinutes: 0,
    laborCost: 0,
    aiCost: 0,
    lead: { work: 0, review: 0 },
    skipped: [],
    evalLoops: 0,
    accidents: 0,
    interventions: 0,
  };
}

/** Task の状態を1つ差し替えた新しい state を返す */
export function updateTask(
  state: GameState,
  projectId: string,
  taskId: string,
  fn: (run: TaskRun) => TaskRun,
): GameState {
  const project = state.projects[projectId];
  const run = project?.tasks[taskId];
  if (!project || !run) return state;
  return {
    ...state,
    projects: { ...state.projects, [projectId]: { ...project, tasks: { ...project.tasks, [taskId]: fn(run) } } },
  };
}
