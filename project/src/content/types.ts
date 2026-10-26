/**
 * ゲームデータのスキーマ。案件・Task・Worker・Model・担当モードはこの型のデータとして追加する。
 * 文言（name）は i18n/ja.ts から参照する。
 */

/** 作業の担い手の種類 */
export type Actor = 'human' | 'ai';

/** 担当モードを構成する工程の種類。instruct: AIへの指示出し / work: 作業 / review: 確認（人間のレビュー、または AI による自動テスト） */
export type ModePhase = 'instruct' | 'work' | 'review';

/** ボトルネックを集計する単位。instruct は work に、手戻りは review に含める */
export type Stage = 'work' | 'review';

export type AssignModeId = 'human' | 'ai' | 'aiThenHumanReview' | 'aiThenEval' | 'humanThenAi' | 'agentWorkflow';

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

/**
 * 解放・用語の明かし・チュートリアルの進行に使う条件（state から判定する宣言的な表現）。
 * 「出来事が起きたら」は、出来事が state に残す結果（完了した Task の数・品質低下など）で表す。
 * 判定は core/conditions.ts。
 */
export type Condition =
  /** 最初から満たす（初期状態で解放されている） */
  | { readonly type: 'start' }
  /** 開始した Task が count 件以上（全案件の合計） */
  | { readonly type: 'tasksStarted'; readonly count: number }
  /** 完了した Task が count 件以上 */
  | { readonly type: 'tasksCompleted'; readonly count: number }
  /** 失敗を見逃して品質低下のまま完了した Task が count 件以上 */
  | { readonly type: 'defectsEscaped'; readonly count: number }
  /** そのモードで完了した Task が count 件以上 */
  | { readonly type: 'modeCompleted'; readonly mode: AssignModeId; readonly count: number }
  /** 納品した案件が count 件以上 */
  | { readonly type: 'projectsCompleted'; readonly count: number }
  /** 別の機能が解放済み */
  | { readonly type: 'unlocked'; readonly feature: FeatureId }
  /** 特定の Task の担当が決まった（mode を指定すればそのモードで） */
  | { readonly type: 'taskAssigned'; readonly projectId: string; readonly taskId: string; readonly mode?: AssignModeId }
  /** 特定の Task が完了した */
  | { readonly type: 'taskCompleted'; readonly projectId: string; readonly taskId: string }
  /** 特定の案件を納品した */
  | { readonly type: 'projectCompleted'; readonly projectId: string };

/** 担当カードの1枚を表す機能 ID */
export type ModeFeatureId = `mode:${AssignModeId}`;

/**
 * 解放の対象になる機能。UI は isUnlocked(state, featureId) を見て表示・非表示を切り替える。
 * mode:*: 担当モードのカード / dock:*: ドックの項目 / problems: 「次に対応すべき問題」のトーストとドックのボタン
 */
export type FeatureId = ModeFeatureId | 'dock:speed' | 'dock:utilization' | 'problems';

export interface UnlockDef {
  readonly id: string;
  readonly feature: FeatureId;
  readonly when: Condition;
  /** 解放時に出す文言の ID（i18n の ja.unlocks） */
  readonly message: UnlockMessageId;
}

export type UnlockMessageId = 'review' | 'eval' | 'speed' | 'utilization' | 'advanced' | 'problems' | 'basic';

/** 体験の後で名前を教える用語（企画書34章）。文言（名前・平易な説明）は i18n の ja.glossary */
export type TermId = 'delegation' | 'humanInTheLoop' | 'eval' | 'harnessEngineering';

export interface TermDef {
  readonly id: TermId;
  /** 名前を明かすタイミング。その仕組みを使った後にする */
  readonly reveal: Condition;
}

/** チュートリアルの文言の ID（i18n の ja.tutorial.say） */
export type TutorialSayId =
  | 'choose'
  | 'aiWorking'
  | 'humanWorking'
  | 'aiFast'
  | 'humanSlow'
  | 'aiAgain'
  | 'needReview'
  | 'reviewing'
  | 'tryEval'
  | 'evaluating';

/** 文言。条件で2つの言い方を切り替えられる（プレイヤーの選んだ担当に合わせる） */
export type TutorialSay =
  | TutorialSayId
  | { readonly if: Condition; readonly yes: TutorialSayId; readonly no: TutorialSayId };

/**
 * コーチマークで照らす場所。task は、その Task の詳細シートが開いていれば担当カード（mode を指定すればその1枚）、
 * 閉じていればワールドの島のラベルを照らす
 */
export type TutorialHighlight = { readonly kind: 'task'; readonly taskId: string; readonly mode?: AssignModeId };

/** チュートリアル中に許す操作（alwaysAllowed 以外）。Task の担当を、決めたモードの中から選ばせる */
export interface TutorialAllow {
  readonly type: 'AssignTask';
  readonly taskId: string;
  readonly modes: readonly AssignModeId[];
}

export interface TutorialStepDef {
  readonly id: string;
  /** 前のステップの後、この条件を満たしたらこのステップへ進む */
  readonly when: Condition;
  /** null なら照らさない（待つだけのステップ） */
  readonly highlight: TutorialHighlight | null;
  readonly say: TutorialSay;
  readonly allow: readonly TutorialAllow[];
}

export interface TutorialScript {
  readonly projectId: string;
  /** チュートリアルの seed。成否はシナリオで決めるが、それ以外の乱数もこの seed で固定する */
  readonly seed: string;
  /** AI の作業の成否をシナリオで決める（true: 成功 / false: 失敗）。載っていない Task は通常どおり確率で決まる */
  readonly forcedAiOutcomes: Readonly<Record<string, boolean>>;
  /** ステップに関係なく、いつでも受け付ける Command */
  readonly alwaysAllowed: readonly ('SetSpeed' | 'TogglePause' | 'StartProject' | 'SkipTutorial')[];
  readonly steps: readonly TutorialStepDef[];
  /** この条件を満たしたらチュートリアルを終える */
  readonly completeWhen: Condition;
}
