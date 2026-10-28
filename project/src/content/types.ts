import type { IconName } from '../assets/icons';
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
  /**
   * review の工程が、残っている失敗を見つける確率。省略すると、人間のレビューは必ず見つけ、
   * AI の自動テストは Task の種類ごとの検出率（balance.assign.autoTestCatch）で見つける
   */
  readonly catchRate?: number;
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
  /**
   * 売上（円）。生成した案件では市場の標準価格（見積の基準。core/bidding.ts）で、受注した案件の売上は見積額になる
   * （core/state.ts の ProjectRun.revenue）
   */
  readonly revenue: number;
  /** 納期（営業日）。生成した案件では標準の納期で、受注した案件の納期は提案した納期になる */
  readonly deadlineDays: number;
  readonly tasks: readonly TaskDef[];
  /** 生成した案件（core/projectGen.ts）の素性。固定の案件にはない */
  readonly brief?: ProjectBrief;
}

/** 案件の規模。Task の数・作業量・品質要求・納期・価格が変わる（balance.projectGen.sizes） */
export type ProjectSize = 'S' | 'M' | 'L' | 'XL';

/** 発注者の業種。文言は i18n の ja.projectGen.industries、補正は content/projectTemplates.ts の industries */
export type IndustryId = 'ec' | 'saas' | 'internal' | 'media' | 'payment';

/** 発注者の性格。コンペで何を重く見るか（balance.bid.focus） */
export type ClientFocus = 'price' | 'quality' | 'deadline';

/** 生成した案件の素性。コンペ（core/bidding.ts）と案件ボードの表示に使う */
export interface ProjectBrief {
  /** 案件の型（content/projectTemplates.ts の id） */
  readonly templateId: string;
  readonly industry: IndustryId;
  readonly size: ProjectSize;
  /** 発注者の名前 */
  readonly client: string;
  readonly focus: ClientFocus;
  /** 予算の上限（円）。これを超える見積は選ばれない */
  readonly budget: number;
  /** 競合の数 */
  readonly rivals: number;
}

/**
 * 案件の型。工程の依存関係と Task の性質を持ち、業種と規模を掛け合わせて案件を生成する（core/projectGen.ts）。
 * revenue・deadlineDays・tasks は規模 M・業種の補正なしの値で、id のまま引くとこの値の案件（標準の案件）になる
 */
export interface ProjectTemplateDef extends ProjectDef {
  /** この型の案件を出す業種 */
  readonly industries: readonly IndustryId[];
  /** 規模 L 以上で、並行する複製を増やして作業を分ける Task（依存する Task はすべての複製を待つ） */
  readonly scales: readonly string[];
  /** 規模 S では省く Task（依存していた Task は、その Task の依存を引き継ぐ） */
  readonly optional: readonly string[];
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
  /** AI が1分作業するごとに、運用者の Seat の使用量の上限から消費する量（content/seats.ts の dailyUsage と同じ単位） */
  readonly usagePerMinute: number;
}

/** Claude Team のシートの種類（企画書6章） */
export type SeatId = 'standard' | 'premium';

/** Seat（企画書6章）。月額費用と AI の使用量の上限。文言は i18n の ja.seats */
export interface SeatDef {
  readonly id: SeatId;
  readonly name: string;
  /** 月額費用（米ドル、企画書6章の月払いの価格）。balance.seat.yenPerUsd でゲーム内の円に換算し、日割りで計上する */
  readonly monthlyUsd: number;
  /** 1営業日に使える AI の使用量。超えると、その人が運用する AI Worker の作業が遅くなる */
  readonly dailyUsage: number;
}

/** 社員の職種。文言は i18n の ja.roles */
export type StaffRole = 'pm' | 'designer' | 'developer' | 'qa';

export interface HumanWorkerDef {
  readonly kind: 'human';
  readonly id: string;
  readonly name: string;
  /**
   * 売値（見積単価、円/人日）。能力が高い人ほど高い。原価（給与）は売値に balance.staff.costRatio を掛けたもの
   */
  readonly dailyRate: number;
  /** 作業速度の倍率。1 が標準 */
  readonly skill: number;
  /** 正確さ（skill 1 のときの作業の成功確率の基礎。balance.human.competence が平均） */
  readonly accuracy: number;
  readonly role: StaffRole;
  /** 得意分野。この種類の Task の人間の工程は balance.staff.strengthSpeed 倍の速さで進む */
  readonly strengths: readonly TaskKind[];
  /** 入社したときに割り当てる Seat */
  readonly seat: SeatId;
}

export interface AiWorkerDef {
  readonly kind: 'ai';
  readonly id: string;
  readonly name: string;
  readonly modelId: string;
  /** この AI Worker を運用する社員。AI の使用量はこの人の Seat の上限から消費する（いなければ上限なし） */
  readonly operatorId?: string;
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
  /** その型（content/projectTemplates.ts）の案件を納品した。生成した案件と、型の id の標準の案件の両方を数える */
  | { readonly type: 'templateCompleted'; readonly templateId: string }
  /** Context の記録（core/state.ts の ContextStats）の値が count 以上 */
  | { readonly type: 'contextStat'; readonly stat: ContextStatId; readonly count: number }
  /** どれかの AI Worker の Session が、Reset からこの時間（AI が作業した分）以上続いている */
  | { readonly type: 'sessionAge'; readonly minutes: number }
  /** 会社の規模がこの段階（content/companyTiers.ts の並び）以上 */
  | { readonly type: 'tier'; readonly tier: CompanyTierId }
  /** 会社の資産になった Harness の部品（導入済み）が count 個以上 */
  | { readonly type: 'partsOwned'; readonly count: number }
  /** すべてを満たす */
  | { readonly type: 'all'; readonly of: readonly Condition[] }
  /** どれかを満たす（体験の条件に、規模の昇格などの「いずれは届く」条件を添えて、取り残されないようにする） */
  | { readonly type: 'any'; readonly of: readonly Condition[] };

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
  /**
   * harness: Harness Builder（Model・CLAUDE.md と Rules・Skill）/ harness:*: 部品のカテゴリごとの解放。
   * harness:tool は MCP・コネクタ（カテゴリ mcp。セーブの解放の記録と合わせるため id は変えない）
   */
  | 'harness'
  | 'harness:hook'
  | 'harness:tool'
  | 'harness:permission'
  | 'harness:eval'
  | 'harness:subagent'
  | 'harness:mod'
  | 'harness:routine'
  /** team: 社員と Seat の画面（Seat の変更） / hire: 社員の画面と採用・退職 */
  | 'team'
  | 'hire';

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
  | 'workflow'
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
  | 'harnessSubagent'
  | 'harnessMod'
  | 'harnessRoutine'
  | 'team'
  | 'hire';

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
  readonly alwaysAllowed: readonly ('SetSpeed' | 'TogglePause' | 'SeeFeatures' | 'StartProject' | 'SkipTutorial')[];
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

/**
 * 事件の発生条件に使える読み取り値（core/incidents.ts の IncidentReading）。Context の値に加えて、
 * retries: 今の Task で失敗を見つけて直した回数（Task が終われば 0）/ streak: AI Worker の Autonomy Streak（分）/
 * unvalidated: AI の作業の後に確認が何もない（レビューの工程も Eval もない）なら 1 / subagents: 装着している Subagent の数 /
 * humanQueue: この AI Worker の仕事で、人間の手が空くのを待っている件数
 */
export type IncidentMetric = ContextMetric | 'retries' | 'streak' | 'unvalidated' | 'subagents' | 'humanQueue';

/**
 * 事件の発生を判定する時点。aiWork: AI が作業を始める / repair: AI が見つかった失敗の修復を始める /
 * humanCheck: AI の仕事が人間の指示出し・確認に回る
 */
export type IncidentMoment = 'aiWork' | 'repair' | 'humanCheck';

export type IncidentId =
  | 'contextOverflow'
  | 'staleContext'
  | 'instructionConflict'
  | 'retrySpiral'
  | 'agentDrift'
  | 'missingValidation'
  | 'coordinationExplosion'
  | 'humanBottleneck';

/** 事件の解決アクション。ResolveIncident の Command で、事件の起きた AI Worker の Session と Harness に順に適用する */
export type IncidentAction =
  | { readonly type: 'SetContextFeed'; readonly feed: ContextFeed }
  | { readonly type: 'NewSession' }
  /** stale: 古い仕様を外す / conflicting: 矛盾するルールを外す */
  | { readonly type: 'DropDocs'; readonly which: 'stale' | 'conflicting' }
  /** 部品を装着する。parts のうち事件の Task に効く最初の部品（どれも効かなければ先頭）。初めてなら導入コストを払う */
  | { readonly type: 'EquipPart'; readonly parts: readonly string[] }
  /** カテゴリの部品を keep 個まで減らす（後から付けたものから外す） */
  | { readonly type: 'TrimParts'; readonly category: HarnessCategory; readonly keep: number };

/**
 * 事件（企画書19章）。moment の時点で、読み取り値から発生確率を計算する。
 * 発生した事件は、解決するまで（または条件を満たさなくなるまで）その AI Worker の作業に影響する。文言は i18n の ja.incidents
 */
export interface IncidentDef {
  readonly id: IncidentId;
  readonly moment: IncidentMoment;
  /** 発生確率 = min(max, perUnit × (読み取り値 metric − threshold))。metric が threshold 以下なら起きず、起きていれば解消する */
  readonly trigger: {
    readonly metric: IncidentMetric;
    readonly threshold: number;
    readonly perUnit: number;
    readonly max: number;
  };
  /**
   * 防ぐ部品のカテゴリ。これらのカテゴリの、強制する（お願いでない）部品が事件の Task に効いていれば起きず、起きていれば解消する
   */
  readonly guard?: readonly HarnessCategory[];
  /**
   * 影響。成功確率から引く量、AI の作業時間の倍率、AI の仕事での人間の指示出し・確認の時間の倍率
   */
  readonly effect: {
    readonly successPenalty: number;
    readonly aiTimeFactor: number;
    readonly humanTimeFactor: number;
  };
  readonly resolve: readonly IncidentAction[];
  /** この機能が解放されるまでは起きない（チュートリアルや、まだ解決の手段を持たないうちは出さない） */
  readonly unlock: FeatureId;
  /** 表示に使うアイコン */
  readonly icon: 'context' | 'warning' | 'session' | 'eval' | 'hook' | 'subagent' | 'review' | 'bottleneck';
}

/**
 * Harness 部品のカテゴリ（企画書13〜18章・10章の Context Router）。いまの Claude Code で実際にできるカスタマイズに対応させる。
 * claudeMd: CLAUDE.md・メモリ（毎回読む）/ rules: .claude/rules（関係するファイルを触るときだけ読む）/ skill: Skill・スラッシュコマンド /
 * hook: Hook（タイミング別）と、同じ内容の「お願い」/ mcp: MCP・コネクタ / subagent: Subagent・worktree /
 * permission: 権限モード / mod: Mod（人間が見張る画面）/ routine: Routine・定期実行 / eval: Eval / contextRouter: Context Router
 */
export type HarnessCategory =
  | 'claudeMd'
  | 'rules'
  | 'skill'
  | 'hook'
  | 'mcp'
  | 'subagent'
  | 'permission'
  | 'mod'
  | 'routine'
  | 'eval'
  | 'contextRouter';

/** Hook が動くタイミング（Claude Code の hooks のイベント） */
export type HookTiming = 'SessionStart' | 'PreToolUse' | 'PostToolUse' | 'Stop';

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
  /**
   * AI の仕事を型にはめる度合い（add、0〜1）。ルール（Hook・お願い）・Skill・Eval のように、AI の出力を決まった手順と検査に
   * 通す部品が持つ。1 に届かない分（1 − guard）だけ「Harness なしの素の AI」の弱さが残る（balance.harness.bare）
   */
  readonly guard: number;
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
  /** 同じ group の部品は同時に1つしか付けられない（同じ内容の「お願い」と「Hook」・同じルールの CLAUDE.md と Rules・権限モード） */
  readonly group?: string;
  /** 効かない Task の作業にだけかかる補正。CLAUDE.md に書いたルールは毎回読むので、役に立たない仕事では Noise になる */
  readonly offTarget?: Partial<HarnessModifiers>;
  /**
   * 書いた量。カテゴリの合計が balance.harness.budgets の目安を超えると、そのカテゴリの部品の補正は
   * 目安 ÷ 合計 の割合でしか効かない（長すぎる CLAUDE.md の読み落とし）
   */
  readonly size?: number;
  /** 同じカテゴリの組ごとの調整コスト（balance.harness.pairs）を、この割合だけ打ち消す（worktree で Subagent どうしが衝突しない） */
  readonly pairRelief?: Partial<Record<HarnessCategory, number>>;
  /** Hook の動くタイミング（hook のみ）。Builder で盾を置く場所と、書き出す settings.json のイベント */
  readonly timing?: HookTiming;
  /** この機能が解放されると選べる */
  readonly unlock: FeatureId;
}

/**
 * Workflow に保存する資料の渡し方。needed: 必要な資料だけ / all: すべての資料 / router: Context Router。
 * 資料を個別に選ぶ（pick）は案件ごとの選び方なので、needed として保存する
 */
export type WorkflowContext = 'needed' | 'all' | 'router';

/**
 * Workflow Library の Workflow（企画書25章）。AI Worker の構成（Model・資料の渡し方・Harness 部品）と担当モードの組。
 * プレイヤーが Harness Builder で組んで保存したもの（GameState.library）だけで、同梱のものはない
 */
export interface LibraryWorkflowDef {
  readonly id: string;
  readonly name: string;
  /** 適用した Task の担当モード（AI が関わるモード） */
  readonly mode: AssignModeId;
  readonly modelId: string;
  readonly context: WorkflowContext;
  /** 装着する部品の id（Context Router は context で表すので含めない） */
  readonly parts: readonly string[];
}

/** 実務モードの業務の頻度 */
export type PracticeFrequency = 'daily' | 'weekly' | 'monthly';

/** 実務モードの工程の AI 適性（選択式）。content/practice の practiceAptitudes で Task の性質に置き換える */
export type PracticeAptitude = 'high' | 'mid' | 'low';

/** AI 適性の選択肢が表す Task の性質（TaskDef の同名の値） */
export interface PracticeAptitudeDef {
  readonly aiAptitude: number;
  readonly difficulty: number;
  readonly qualityReq: number;
  readonly failRisk: number;
}

/** 実務モードの工程。今の人間時間と、改善後の担当モード・Model・Harness 部品 */
export interface PracticeStepInput {
  readonly name: string;
  /** 今、人間がこの工程にかけている時間（分） */
  readonly minutes: number;
  /** 仕事の種類。Harness 部品が効くかどうかを決める */
  readonly kind: TaskKind;
  readonly aptitude: PracticeAptitude;
  readonly mode: AssignModeId;
  readonly modelId: string;
  /** 割り当てる部品（Context Router を除く。実務モードには案件の資料がない） */
  readonly parts: readonly string[];
}

/** 実務モードで入力する実際の業務（1回分） */
export interface PracticeJobInput {
  readonly name: string;
  readonly frequency: PracticeFrequency;
  /** 1年の実施回数。省けば頻度の既定値（balance.practice.runsPerYear） */
  readonly runsPerYear?: number;
  /** 人件費（円/人日）。人件費の換算に使う */
  readonly dailyWage: number;
  /** 業務1回が生む価値（円）。人日あたりの利益に使う */
  readonly valuePerRun: number;
  /** 上から順に行う工程（最大 balance.practice.maxSteps） */
  readonly steps: readonly PracticeStepInput[];
}

/** 実務モードのテンプレート（企画書24章の例） */
export interface PracticeTemplateDef {
  readonly id: string;
  readonly job: PracticeJobInput;
}

/** 会社の規模の段階（balance.company.tiers の並びが昇格の順） */
export type CompanyTierId = 'solo' | 'startup' | 'small' | 'mid' | 'large';

/** 会社の規模の段階の定義（content/companyTiers.ts）。値は balance.company.tiers、名前は i18n */
export interface CompanyTierDef {
  readonly id: CompanyTierId;
  readonly name: string;
  /** 昇格の条件。累計の会社の利益（円）・評判・納品数のすべてを満たすと、この段階になる */
  readonly requires: { readonly profit: number; readonly reputation: number; readonly delivered: number };
  /** 人員の上限 */
  readonly maxStaff: number;
  /** AI Worker の上限 */
  readonly maxAiWorkers: number;
  /** チーム数の上限（直轄チームを含む） */
  readonly maxTeams: number;
  /** 管理者（人間 PM / AI PM）を置けるか */
  readonly managers: boolean;
  /** 営業日ごとに届く引き合いの数 */
  readonly inquiries: number;
  /** 引き合いに出る案件の規模の重み */
  readonly sizes: Readonly<Record<ProjectSize, number>>;
  /** 採用市場の候補の数 */
  readonly candidates: number;
  /** オフィスの固定費（円/営業日） */
  readonly officeDaily: number;
}

/**
 * 実績の条件（content/achievements.ts。判定は core/achievements.ts）。
 * delivery は納品した1件の案件で、fiscal は締めた1期の決算で、ほかは会社の今の state で判定する
 */
export type AchievementCondition =
  /** 累計の納品数が count 件以上 */
  | { readonly type: 'delivered'; readonly count: number }
  /** 会社の規模がその段階以上 */
  | { readonly type: 'tier'; readonly tier: CompanyTierId }
  /** 大手の格付けが rank 以上（★ の数 − 1） */
  | { readonly type: 'rank'; readonly rank: number }
  /**
   * 条件に合う案件を納品した。size はその規模以上、manager は運営した人（ai: AI PM だけ / human: 人間 PM だけ / player: 管理者なし）、
   * flawless は失敗を見逃さず納期内、minProfitPerPersonDay はその案件の 利益 / 人日 の下限
   */
  | {
      readonly type: 'delivery';
      readonly size?: ProjectSize;
      readonly manager?: 'ai' | 'human' | 'player';
      readonly flawless?: boolean;
      readonly minProfitPerPersonDay?: number;
    }
  /** 決算で、利益 / 人日 が minProfitPerPersonDay 以上、または利益が前期の growth 倍以上（前期の利益がプラスのとき） */
  | { readonly type: 'fiscal'; readonly minProfitPerPersonDay?: number; readonly growth?: number }
  /** 評判が min 以上 */
  | { readonly type: 'reputation'; readonly min: number }
  /** 時価総額が min 円以上 */
  | { readonly type: 'valuation'; readonly min: number }
  /** AI Worker の最長の介入間隔（Autonomy）が minutes 分以上 */
  | { readonly type: 'autonomy'; readonly minutes: number }
  /** Workflow Library に保存した Workflow が count 個以上 */
  | { readonly type: 'library'; readonly count: number }
  /** 管理者に任せているチームが count 個以上 */
  | { readonly type: 'delegated'; readonly count: number };

/** 実績（content/achievements.ts）。名前と説明は i18n の ja.achievements */
export interface AchievementDef {
  readonly id: string;
  readonly when: AchievementCondition;
  readonly icon: IconName;
}

/** 後半の事件の種類（content/companyEvents.ts。値は balance.companyEvents） */
export type CompanyEventId = 'outage' | 'poach' | 'priceWar';
