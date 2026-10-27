import { balance, type GameSpeed } from '../content/balance';
import { campaign } from '../content/campaign';
import { glossary } from '../content/glossary';
import { aiWorkers, getHuman } from '../content/index';
import type {
  AssignModeId,
  ContextFeed,
  ContextStatId,
  FeatureId,
  HandoffItemId,
  IncidentId,
  ModePhase,
  SeatId,
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
  /** AI が作業したときの AI Worker の構成（寄与の分析に使う。core/attribution.ts）。AI が作業していなければ null */
  readonly setup: TaskSetup | null;
}

/**
 * AI の作業を始めたときの AI Worker の構成（Harness と Session）。作業のたびに記録し直すので、最後の作業の構成が残る。
 * 発生中の事件は一時的なものなので含めない
 */
export interface TaskSetup {
  readonly harness: HarnessRun;
  readonly session: SessionRun;
}

export interface ProjectRun {
  readonly projectId: string;
  readonly startedAt: number;
  readonly completedAt: number | null;
  /** TaskDef の並び順で持つ */
  readonly tasks: Readonly<Record<string, TaskRun>>;
}

/** 会社にいる社員の Seat と、今日の AI の使用量 */
export interface StaffRun {
  readonly seat: SeatId;
  /** 今日（state.usageDay の営業日）に、この人が運用する AI Worker が使った量 */
  readonly used: number;
}

/** 進行中のキャンペーン（content/campaign.ts） */
export interface CampaignRun {
  /** 受注できるようになった段階の id（なった順） */
  readonly reached: readonly string[];
  /** すべての案件を納品した */
  readonly cleared: boolean;
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

/**
 * AI Worker の自律の記録（企画書23章）。人間が介入せずに AI が処理を続けた時間（Streak）と、人間の介入間隔
 */
export interface AutonomyRun {
  /** 今の Streak（分）。AI がこの Worker の仕事を処理していた時間で、人間の介入で 0 に戻る */
  readonly streak: number;
  /** 今の Streak で越えたしきい値（balance.autonomy.milestones）の数 */
  readonly milestones: number;
  /** 記録した介入間隔の数（AI が処理を進めた後に人間が介入した回数） */
  readonly intervals: number;
  /** 記録した介入間隔の合計（分） */
  readonly intervalTotal: number;
  /** 最長の介入間隔（分）。今の Streak を含む */
  readonly longest: number;
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
  /** AI Worker ごとの自律の記録（AI Worker の id がキー。なければまだ何も処理していない） */
  readonly autonomy: Readonly<Record<string, AutonomyRun>>;
  /** 会社にいる社員（人間の Worker の id がキー）。人間の工程はこの人たちが担う */
  readonly team: Readonly<Record<string, StaffRun>>;
  /** Seat の使用量を数えている営業日（ゲーム開始からの営業日の番号、0 から） */
  readonly usageDay: number;
  /** 日割りで計上した Seat の固定費の合計（円）。会社の固定費なので案件のスコアには入れず、会社のスコアで引く */
  readonly seatCost: number;
  /** キャンペーン。キャンペーンでなければ null（どの案件でも始められる） */
  readonly campaign: CampaignRun | null;
}

export interface InitialStateOptions {
  /** チュートリアルとして始める。start の機能だけを解放し、用語はまだ明かさない */
  readonly tutorial?: boolean;
  /**
   * キャンペーンとして始める（チュートリアルから始まる）。受注できる案件はキャンペーンの段階で決まり、
   * 機能の解放・社員・Harness 部品は案件をまたいで持ち越す
   */
  readonly campaign?: boolean;
  /** 最初からいる社員。既定はキャンペーンの最初の社員 */
  readonly team?: readonly string[];
}

/**
 * ゲームの初期状態。キャンペーンはチュートリアルから始まり、解放の進み具合を案件をまたいで持ち越す。
 * キャンペーンでもチュートリアルでもなければ（単発の案件・テスト）、すべての機能を解放し、すべての用語を明かした状態で始める。
 */
export function createInitialState(seed: string, options: InitialStateOptions = {}): GameState {
  const isCampaign = options.campaign === true;
  const tutorial = options.tutorial === true || isCampaign;
  const team = options.team ?? campaign.team;
  return {
    seed,
    rng: hashSeed(seed),
    clock: 0,
    carryMinutes: 0,
    speed: balance.time.speeds[0],
    paused: false,
    entities: {},
    projects: {},
    humanQueues: createHumanQueues(team),
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
    autonomy: {},
    team: createTeam(team),
    usageDay: 0,
    seatCost: 0,
    campaign: isCampaign
      ? { reached: campaign.stages.filter((s) => s.when.type === 'start').map((s) => s.id), cleared: false }
      : null,
  };
}

/** 社員を入社したときの Seat で迎える */
export function createTeam(ids: readonly string[]): Record<string, StaffRun> {
  return Object.fromEntries(ids.map((id) => [id, { seat: getHuman(id).seat, used: 0 }]));
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

export function createHumanQueues(team: readonly string[] = campaign.team): Record<string, readonly QueueItem[]> {
  return Object.fromEntries(team.map((id) => [id, []]));
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
    setup: null,
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
