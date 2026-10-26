/**
 * ゲームデータのスキーマ。案件・Task・Worker・Model・担当モードはこの型のデータとして追加する。
 * 文言（name）は i18n/ja.ts から参照する。
 */

/** 作業の担い手の種類 */
export type Actor = 'human' | 'ai';

/** 担当モードを構成する工程の種類。instruct: AIへの指示出し / work: 作業 / review: 人間の確認 */
export type ModePhase = 'instruct' | 'work' | 'review';

/** ボトルネックを集計する単位。instruct は work に、手戻りは review に含める */
export type Stage = 'work' | 'review';

export type AssignModeId = 'human' | 'ai' | 'aiThenHumanReview' | 'humanThenAi' | 'agentWorkflow';

export interface ModeStep {
  readonly actor: Actor;
  readonly phase: ModePhase;
  /** Task の作業量（effort）のうち、この工程で処理する割合 */
  readonly effortShare: number;
  /** 依存 Task がすべて連鎖するモードで処理済みなら、この工程を省く（Agent Workflow の指示出し） */
  readonly skipWhenChained?: boolean;
}

/** 担当モード。計算式はモード名で分岐せず、工程の並びと modifier を読む */
export interface AssignModeDef {
  readonly id: AssignModeId;
  readonly name: string;
  /** 先頭から順に処理する工程。review は、それまでの作業の失敗を発見して手戻りにする */
  readonly steps: readonly ModeStep[];
  /** 同じく chains なモードの Task どうしは、人間を介さずに連続実行する */
  readonly chains: boolean;
}

export interface TaskDef {
  readonly id: string;
  readonly name: string;
  /** 先に完了している必要がある Task の id */
  readonly deps: readonly string[];
  /** 標準的な人間（skill 1）がこなしたときの作業量（ゲーム内の分） */
  readonly effort: number;
  /** 0〜1。高いほど失敗しやすい */
  readonly difficulty: number;
  /** 0〜1。高いほど AI が得意 */
  readonly aiAptitude: number;
  /** 0〜1。高いほど失敗しやすく、見逃したときの品質の落ち込みが大きい */
  readonly qualityReq: number;
  /** 0〜1。失敗のしやすさの基礎値。difficulty と qualityReq はこれに掛かる */
  readonly failRisk: number;
  /** 必要な Context の id（Phase 10 で使う。今は型だけ） */
  readonly contextNeeds: readonly string[];
}

export interface ProjectDef {
  readonly id: string;
  readonly name: string;
  /** 売上（円） */
  readonly revenue: number;
  /** 納期（営業日） */
  readonly deadlineDays: number;
  readonly tasks: readonly TaskDef[];
}

export interface ModelDef {
  readonly id: string;
  readonly name: string;
  /** 0〜1。成功確率の基礎になる能力 */
  readonly capability: number;
  /** 人間（skill 1）に対する作業速度の倍率 */
  readonly speed: number;
  /** AI が1分作業するごとの費用（円） */
  readonly costPerMinute: number;
}

export interface HumanWorkerDef {
  readonly kind: 'human';
  readonly id: string;
  readonly name: string;
  /** 時給（円） */
  readonly hourlyWage: number;
  /** 作業速度の倍率。1 が標準 */
  readonly skill: number;
}

export interface AiWorkerDef {
  readonly kind: 'ai';
  readonly id: string;
  readonly name: string;
  readonly modelId: string;
}

export type WorkerDef = HumanWorkerDef | AiWorkerDef;
