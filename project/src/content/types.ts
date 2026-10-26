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

/** Task の種類。Harness 部品が効く範囲（HarnessPartDef.appliesTo）の判定に使う */
export type TaskKind = 'planning' | 'research' | 'design' | 'content' | 'code' | 'test' | 'release';

export interface TaskDef {
  readonly id: string;
  readonly name: string;
  /** Task の種類。案件のデータでは必須（content/validate.ts が検査する） */
  readonly kind?: TaskKind;
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
  | { readonly type: 'projectCompleted'; readonly projectId: string }
  /** Context の記録（core/state.ts の ContextStats）の値が count 以上 */
  | { readonly type: 'contextStat'; readonly stat: ContextStatId; readonly count: number }
  /** どれかの AI Worker の Session が、Reset からこの時間（AI が作業した分）以上続いている */
  | { readonly type: 'sessionAge'; readonly minutes: number };

/** 担当カードの1枚を表す機能 ID */
export type ModeFeatureId = `mode:${AssignModeId}`;

/**
 * 解放の対象になる機能。UI は isUnlocked(state, featureId) を見て表示・非表示を切り替える。
 * mode:*: 担当モードのカード / dock:*: ドックの項目 / problems: 「次に対応すべき問題」のトーストとドックのボタン
 */
export type FeatureId =
  | ModeFeatureId
  | 'dock:speed'
  | 'dock:utilization'
  | 'problems'
  /** context: 資料の渡し方の2択と Context の状態 / context:pick: 資料を個別に選ぶチェックリスト / context:router: Context Router */
  | 'context'
  | 'context:pick'
  | 'context:router'
  /** session: New Session と Handoff / session:artifacts: Artifact Driven Work */
  | 'session'
  | 'session:artifacts'
  /** harness: Harness Builder（Model と Skill）/ harness:*: 部品のカテゴリごとの解放 */
  | 'harness'
  | 'harness:hook'
  | 'harness:tool'
  | 'harness:permission'
  | 'harness:eval'
  | 'harness:subagent';

export interface UnlockDef {
  readonly id: string;
  readonly feature: FeatureId;
  readonly when: Condition;
  /** 解放時に出す文言の ID（i18n の ja.unlocks） */
  readonly message: UnlockMessageId;
}

export type UnlockMessageId =
  | 'review'
  | 'eval'
  | 'speed'
  | 'utilization'
  | 'advanced'
  | 'problems'
  | 'basic'
  | 'context'
  | 'contextPick'
  | 'contextRouter'
  | 'session'
  | 'artifacts'
  | 'harness'
  | 'harnessHook'
  | 'harnessTool'
  | 'harnessPermission'
  | 'harnessEval'
  | 'harnessSubagent';

/** 体験の後で名前を教える用語（企画書34章）。文言（名前・平易な説明）は i18n の ja.glossary */
export type TermId =
  | 'delegation'
  | 'humanInTheLoop'
  | 'eval'
  | 'harnessEngineering'
  | 'contextRouting'
  | 'sessionHandoff';

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

/** 資料（企画書9〜10章）。AI に渡すと Context を占める。文言は i18n の ja.documents */
export interface DocumentDef {
  readonly id: string;
  /** どの案件の資料か */
  readonly projectId: string;
  readonly name: string;
  /** この資料が役に立つ Task。古い仕様（stale）は載っていても役に立たず、誤った参照のもとになる */
  readonly relevantTo: readonly string[];
  /** 古い仕様。渡すと「古い仕様の参照」で失敗しやすくなる（Stale Context） */
  readonly stale: boolean;
  /** この資料と矛盾するルールの資料。両方を渡すと衝突する（Instruction Conflict）。外すべき側に書く */
  readonly conflictsWith: readonly string[];
  /** Context を占める大きさ（balance.context.capacity に対する量） */
  readonly size: number;
}

/**
 * AI Worker の Session に資料をどう渡すか（企画書10章）。
 * needed: 案件の Task に必要な資料だけ / all: すべての資料 / pick: 個別に選んだ資料 / router: Task ごとに必要な資料だけを自動で選ぶ（Context Router）
 */
export type ContextFeed =
  | { readonly mode: 'needed' }
  | { readonly mode: 'all' }
  | { readonly mode: 'router' }
  | { readonly mode: 'pick'; readonly docs: readonly string[] };

/** Session Reset のときに次の Session へ残す項目（企画書11章）。文言は i18n の ja.handoff */
export type HandoffItemId = 'goal' | 'decisions' | 'constraints' | 'modifiedFiles' | 'validation' | 'remainingWork';

/** Context の記録（core/state.ts の ContextStats）の項目 */
export type ContextStatId = 'resets' | 'handoffResets' | 'incidents' | 'resolved' | 'routedWorks';

/** Context の読み取り値（core/context.ts の ContextReading）のうち、事件の発生条件に使える値 */
export type ContextMetric = 'fill' | 'noise' | 'stale' | 'conflicts';

export type IncidentId = 'contextOverflow' | 'staleContext' | 'instructionConflict';

/** 事件の解決アクション。ResolveIncident の Command で、事件の起きた AI Worker の Session に順に適用する */
export type IncidentAction =
  | { readonly type: 'SetContextFeed'; readonly feed: ContextFeed }
  | { readonly type: 'NewSession' }
  /** stale: 古い仕様を外す / conflicting: 矛盾するルールを外す */
  | { readonly type: 'DropDocs'; readonly which: 'stale' | 'conflicting' };

/**
 * 事件（企画書19章）。AI が作業を始めるたびに、その Session の Context の読み取り値から発生確率を計算する。
 * 発生した事件は、解決するまで（または条件を満たさなくなるまで）その Session の AI の作業に影響する。文言は i18n の ja.incidents
 */
export interface IncidentDef {
  readonly id: IncidentId;
  /** 発生確率 = min(max, perUnit × (読み取り値 metric − threshold))。metric が threshold 以下なら起きず、起きていれば解消する */
  readonly trigger: {
    readonly metric: ContextMetric;
    readonly threshold: number;
    readonly perUnit: number;
    readonly max: number;
  };
  /** 影響。成功確率から引く量と、AI の作業時間の倍率 */
  readonly effect: { readonly successPenalty: number; readonly aiTimeFactor: number };
  readonly resolve: readonly IncidentAction[];
  /** 表示に使うアイコン */
  readonly icon: 'context' | 'warning' | 'session';
}

/** Harness 部品のカテゴリ（企画書13〜18章・10章の Context Router） */
export type HarnessCategory = 'skill' | 'hook' | 'tool' | 'permission' | 'eval' | 'subagent' | 'contextRouter';

/**
 * Harness 部品が AI Worker の作業に与える補正。合算のしかたはカテゴリに関係なく項目ごとに balance.harness.combine で決める
 * （add: 足す / mul: 掛ける / any: 独立な確率として「どれかが起きる」確率にする。どれも上限・下限付き）
 */
export interface HarnessModifiers {
  /** 成功確率に足す量（add） */
  readonly success: number;
  /** AI の作業速度の倍率（mul） */
  readonly speed: number;
  /** Context の Noise の割合に足す量（add）。Tool の複雑さや、指示文に書いたお願いが占める分 */
  readonly noise: number;
  /** AI が関わる Task で人間がする指示出しと確認の時間の倍率（mul）。人間の介入の重さ */
  readonly humanTime: number;
  /** AI の費用の倍率（mul） */
  readonly aiCost: number;
  /** AI の作業1回ごとに事故（権限・Tool の誤用）が起きる確率（add） */
  readonly risk: number;
  /** AI の作業の直後に自動の検証が失敗を見つける確率（any）。見つけた失敗は AI が直して再び検証する */
  readonly evalCatch: number;
}

export type HarnessModifierKey = keyof HarnessModifiers;

/** Harness 部品（企画書13〜18章）。部品ごとの特別扱いは計算式に書かず、すべてこのデータで表す。文言は i18n の ja.harness.parts */
export interface HarnessPartDef {
  readonly id: string;
  readonly category: HarnessCategory;
  readonly name: string;
  /** 導入コスト（円）。会社の資産になるので、一度払えば付け外ししても再び払わない */
  readonly installCost: number;
  /** ランニングコスト（AI が1分作業するごとの円） */
  readonly runningCost: number;
  /** appliesTo の種類の Task の作業にだけ効く補正 */
  readonly modifiers: Partial<HarnessModifiers>;
  /** 装着しているだけで、どの Task の作業にもかかる補正（Tool の複雑さ・権限の危うさ・AI の利用量） */
  readonly burden: Partial<HarnessModifiers>;
  /** 補正が効く Task の種類 */
  readonly appliesTo: readonly TaskKind[];
  /**
   * 守られ方。system: システムとして強制する（Hook など。毎回効く）/
   * request: AI へのお願い（指示文に書く。作業ごとに balance.harness.requestCompliance の確率でしか守られない）
   */
  readonly enforcement: 'system' | 'request';
  /** 同じ group の部品は同時に1つしか付けられない（同じ内容の「お願い」と「Hook」） */
  readonly group?: string;
  /** この機能が解放されると選べる */
  readonly unlock: FeatureId;
}
