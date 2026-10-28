import { balance, type GameSpeed } from '../content/balance';
import { companyTiers, getCompanyTier } from '../content/companyTiers';
import { glossary } from '../content/glossary';
import { aiWorkers, getHuman, getProject } from '../content/index';
import { founders } from '../content/staff';
import type {
  AssignModeId,
  CompanyTierId,
  ContextFeed,
  ContextStatId,
  FeatureId,
  HandoffItemId,
  IncidentId,
  IndustryId,
  LibraryWorkflowDef,
  ModePhase,
  SeatId,
  Stage,
  TermId,
} from '../content/types';
import { allFeatures, unlockDefs } from '../content/unlocks';
import type { BidResult, InquiryRun } from './bidding';
import type { BottleneckRef } from './bottleneck';
import type { ScheduledEvent } from './events';
import { hashSeed, type RngState } from './rng';
import { initialTalent, marketCandidates } from './talent';

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
  /** 売上（円）。コンペで受注した案件は見積額、それ以外は案件の定義の売上 */
  readonly revenue: number;
  /** 納期（営業日）。コンペで受注した案件は提案した納期、それ以外は案件の定義の納期 */
  readonly deadlineDays: number;
  /** TaskDef の並び順で持つ */
  readonly tasks: Readonly<Record<string, TaskRun>>;
  /** 管理者がこの案件の運営に使った分（core/teams.ts の managementSystem）。人間 PM の稼働は人日に数える */
  readonly management: ManagementRun;
}

/** 管理者の運営の記録。人間 PM の稼働時間（分）と人件費、AI PM の AI 費用（円） */
export interface ManagementRun {
  readonly minutes: number;
  readonly laborCost: number;
  readonly aiCost: number;
  /** プレイヤーが担当を決めた Task の数（委任せずに進めた・介入した。実績の「管理者だけで納品」の判定に使う） */
  readonly playerAssigned: number;
}

/**
 * 累計の記録（core/archive.ts）。納品から balance.archive.keepDays 営業日たった案件は state.projects から外し、ここに数だけを足す。
 * 会社のスコア・解放の条件・コンペの実績・Workflow の実績は、ここと state.projects の両方を数える
 */
export interface LedgerRun {
  /** 記録に移した案件の数（どれも納品済み） */
  readonly delivered: number;
  readonly revenue: number;
  /** 案件の利益の合計（Harness 部品の導入コストを除く。core/scoring.ts の projectProfit と同じ数え方） */
  readonly projectProfit: number;
  readonly humanMinutes: number;
  readonly tasksCompleted: number;
  readonly defectsEscaped: number;
  /** 担当モードごとの完了した Task の数 */
  readonly modeCompleted: Readonly<Partial<Record<AssignModeId, number>>>;
  /** 納品した案件の型（content/projectTemplates.ts の id。標準の案件はその id） */
  readonly templates: readonly string[];
  /** 業種ごとの納品数（コンペの同業種の実績） */
  readonly industries: Readonly<Partial<Record<IndustryId, number>>>;
  /** Workflow Library の Workflow ごとの使用回数と削減した人間時間（分） */
  readonly library: Readonly<Record<string, { readonly uses: number; readonly savedHumanMinutes: number }>>;
}

/** 会社の累計の値（決算の前期比の起点。core/fiscal.ts の companyTotals） */
export interface CompanyTotals {
  readonly revenue: number;
  readonly profit: number;
  readonly humanMinutes: number;
  readonly delivered: number;
  readonly outages: number;
  readonly poached: number;
}

/** 期の中のチームごとの納品の集計 */
export interface FiscalTeamRun {
  readonly delivered: number;
  readonly profit: number;
  readonly humanMinutes: number;
}

/** 期の中で納品した案件の1件（いちばん良かった・悪かった案件） */
export interface FiscalHighlight {
  readonly projectId: string;
  readonly profitPerPersonDay: number;
}

/** 締めた期の決算（core/fiscal.ts）。金額は円、時間はゲーム内の分 */
export interface FiscalReport {
  /** 期の番号（1 から） */
  readonly no: number;
  /** 期の最初と最後の営業日（ゲーム開始からの番号、終わりは含まない） */
  readonly startDay: number;
  readonly endDay: number;
  readonly revenue: number;
  readonly profit: number;
  readonly humanMinutes: number;
  readonly profitPerPersonDay: number;
  readonly delivered: number;
  readonly reputation: number;
  readonly tier: CompanyTierId;
  readonly rank: number;
  readonly cash: number;
  readonly valuation: number;
  readonly staff: number;
  readonly agents: number;
  readonly teams: Readonly<Record<string, FiscalTeamRun>>;
  readonly best: FiscalHighlight | null;
  readonly worst: FiscalHighlight | null;
  readonly outages: number;
  readonly poached: number;
  /** この期に達成した実績の id */
  readonly achievements: readonly string[];
}

/** 会社の期（core/fiscal.ts） */
export interface FiscalRun {
  /** 今の期の番号（1 から） */
  readonly no: number;
  /** 今の期が始まった営業日。まだ会社が営業していなければ（チュートリアル中・単発のプレイ）null */
  readonly startDay: number | null;
  /** 期首の会社の累計 */
  readonly opening: CompanyTotals;
  /** 今の期のチームごとの納品の集計（チームの id がキー） */
  readonly teams: Readonly<Record<string, FiscalTeamRun>>;
  readonly best: FiscalHighlight | null;
  readonly worst: FiscalHighlight | null;
  readonly achievements: readonly string[];
  /** 締めた期（古い順、balance.fiscal.keep 期まで） */
  readonly reports: readonly FiscalReport[];
}

/** 時価総額の推移の1点 */
export interface ValuationSample {
  readonly day: number;
  readonly valuation: number;
  readonly cash: number;
  /** 会社の累計の利益（直近の利益のペースの計算に使う） */
  readonly profit: number;
}

/** 資金と倒産（core/funds.ts） */
export interface FundsRun {
  /** 資金がマイナスのまま続いている営業日の数 */
  readonly shortDays: number;
  /** 倒産した時刻。倒産していなければ null（倒産した会社は時間が進まず、Command も受け付けない） */
  readonly bankruptAt: number | null;
  /** 時価総額の推移（古い順） */
  readonly samples: readonly ValuationSample[];
  /** 推移を記録する間隔（営業日） */
  readonly sampleEvery: number;
}

/** 達成した実績（content/achievements.ts） */
export interface AchievementRun {
  readonly id: string;
  readonly at: number;
}

/** 人材の引き抜きの打診（core/companyEvents.ts） */
export interface PoachRun {
  readonly staffId: string;
  /** 返事の期限（ゲーム内の時刻）。過ぎたら退職が決まる */
  readonly deadline: number;
  /** 退職が決まった（仕事を抱えていれば終わってから退職する） */
  readonly leaving: boolean;
}

/** 後半の事件の状態 */
export interface CompanyEventsRun {
  readonly offers: readonly PoachRun[];
  /** 競合の値下げが続く時刻。値下げしていなければ null */
  readonly priceWarUntil: number | null;
  /** 起きた回数（決算の集計に使う） */
  readonly outages: number;
  readonly poached: number;
}

/** チームの管理者。人間 PM はチームの社員を1人任命する。AI PM は運用者の Seat の使用量と AI 費用を使う */
export type ManagerRun = { readonly kind: 'human'; readonly staffId: string } | { readonly kind: 'ai' };

/**
 * 直轄以外のチーム（core/teams.ts）。どのチームにも入っていない社員・AI Worker・案件は直轄チーム（プレイヤーが直接操作する）に属する
 */
export interface TeamRun {
  readonly id: string;
  /** 作った順の番号（表示名に使う。直轄チームが 1） */
  readonly no: number;
  /** 所属する社員と AI Worker の id */
  readonly members: readonly string[];
  /** 割り当てた案件の id */
  readonly projects: readonly string[];
  readonly manager: ManagerRun | null;
  /** プレイヤーが介入して、一時的に直轄として担当を決めている（管理者は判断しない） */
  readonly intervened: boolean;
}

/** 会社にいる社員の Seat と、今日の AI の使用量 */
export interface StaffRun {
  readonly seat: SeatId;
  /** 今日（state.usageDay の営業日）に、この人が運用する AI Worker が使った量 */
  readonly used: number;
}

/** 採用市場。営業日ごとに候補が入れ替わる（core/team.ts の marketSystem） */
export interface MarketRun {
  /** 候補を出した営業日（ゲーム開始からの営業日の番号） */
  readonly day: number;
  /** まだ採用していない候補の人材の id（core/talent.ts） */
  readonly candidates: readonly string[];
}

/** 案件ボード（core/board.ts）。営業日ごとに引き合いが届き、見積を出してコンペに勝つと受注する（core/bidding.ts） */
export interface BoardRun {
  /** 最後に引き合いが届いた営業日。チュートリアルの間はまだ届かない（null） */
  readonly day: number | null;
  /** 応募の締切前の引き合い（届いた順） */
  readonly inquiries: readonly InquiryRun[];
  /** 最近のコンペの結果（新しい順、balance.board.history 件まで） */
  readonly results: readonly BidResult[];
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

/** Workflow Library の Workflow を Task に適用した記録（実績の表示に使う。core/library.ts） */
export interface LibraryUse {
  readonly workflowId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly workerId: string;
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
  /** チュートリアルの後に最後に機能を解放した営業日（1営業日に1つずつ渡す。core/unlocks.ts）。まだなら null */
  readonly unlockDay: number | null;
  /** 解放したが、まだ開いていない・使っていない機能（担当カードとメニューの「NEW」の印。content/unlocks.ts の hasNewBadge） */
  readonly fresh: readonly FeatureId[];
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
  /** 採用市場 */
  readonly market: MarketRun;
  /** 採用の契約金の合計（円）。会社の費用なので案件のスコアには入れず、会社のスコアで引く */
  readonly hireCost: number;
  /**
   * 待機中の社員の給与の合計（円）。社員の原価は在籍しているだけで日割りでかかり、作業した分は案件の人件費、
   * 作業していない分はここに計上する。Seat の固定費と同じく、進行中の案件があるときだけ数える
   */
  readonly idleCost: number;
  /** 案件ボード。会社として遊んでいなければ null（単発のプレイ・テスト。どの案件でも始められる） */
  readonly board: BoardRun | null;
  /** 会社の評判（balance.reputation の 0〜100）。納品のたびに納期と品質で変わり、コンペの提案力になる */
  readonly reputation: number;
  /** 会社の規模の段階（content/companyTiers.ts）。納品のたびに昇格の条件を判定する（core/company.ts） */
  readonly tier: CompanyTierId;
  /** 日割りで計上したオフィスの固定費の合計（円）。会社の費用なので会社のスコアで引く */
  readonly officeCost: number;
  /** 会社にいる AI Worker の id（加えた順。先頭は content/workers.ts の AI Worker、後は core/teams.ts で生成した id） */
  readonly agents: readonly string[];
  /** 直轄以外のチーム（作った順） */
  readonly teams: readonly TeamRun[];
  /** 大手の後の格付け（0 は格付けなし、n は ★n+1。core/company.ts） */
  readonly rank: number;
  /** 後半の事件の損害と引き留めの賞与の合計（円）。会社の費用なので会社のスコアで引く */
  readonly eventCost: number;
  /** 累計の記録（core/archive.ts） */
  readonly ledger: LedgerRun;
  /** 会社の期と決算（core/fiscal.ts） */
  readonly fiscal: FiscalRun;
  /** 資金と時価総額（core/funds.ts） */
  readonly funds: FundsRun;
  /** 達成した実績（達成した順） */
  readonly achievements: readonly AchievementRun[];
  /** 後半の事件（core/companyEvents.ts） */
  readonly companyEvents: CompanyEventsRun;
  /** Workflow Library にプレイヤーが保存した Workflow（保存した順。同梱のプリセットは content/library.ts） */
  readonly library: readonly LibraryWorkflowDef[];
  /** Workflow を Task に適用した記録（適用した順。同じ Task に適用し直したら古い記録は消す） */
  readonly libraryUses: readonly LibraryUse[];
}

export interface InitialStateOptions {
  /** チュートリアルとして始める。start の機能だけを解放し、用語はまだ明かさない */
  readonly tutorial?: boolean;
  /**
   * 会社として始める（案件ボード）。既定ではチュートリアルから始まり、終わると引き合いが届き始める。
   * 機能の解放・社員・Harness 部品は案件をまたいで持ち越す
   */
  readonly board?: boolean;
  /** 最初からいる社員。既定は創業メンバー（チュートリアルの2人） */
  readonly team?: readonly string[];
  /** 最初の社員を、平均的な能力の人材として seed から生成する（チュートリアルなしで始めるとき）。team より優先する */
  readonly talent?: boolean;
  /** 会社の規模の段階。既定は最初の段階 */
  readonly tier?: CompanyTierId;
}

/**
 * ゲームの初期状態。会社（案件ボード）は既定でチュートリアルから始まり、解放の進み具合を案件をまたいで持ち越す。
 * ゲームの会社はいつもチュートリアルから始まる（「チュートリアルなしで始める」も、始めてすぐ飛ばすだけ）ので、遊んでも飛ばしても
 * start の機能だけから同じ条件で解放していく。チュートリアルでない状態（単発の案件・テスト・開発用の確認ページ）は、
 * すべての機能を解放し、すべての用語を明かした状態で始める。
 */
export function createInitialState(seed: string, options: InitialStateOptions = {}): GameState {
  const isBoard = options.board === true;
  const tutorial = options.tutorial ?? isBoard;
  const team = options.talent ? initialTalent(seed) : (options.team ?? founders);
  const tier = options.tier ?? companyTiers[0]?.id ?? 'solo';
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
    unlockDay: null,
    fresh: [],
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
    market: { day: 0, candidates: marketCandidates(seed, 0, getCompanyTier(tier).candidates) },
    hireCost: 0,
    idleCost: 0,
    board: isBoard ? { day: null, inquiries: [], results: [] } : null,
    reputation: balance.reputation.initial,
    tier,
    officeCost: 0,
    agents: aiWorkers.map((w) => w.id),
    teams: [],
    rank: 0,
    eventCost: 0,
    ledger: createLedger(),
    fiscal: createFiscal(isBoard && !tutorial ? 0 : null),
    funds: createFunds(),
    achievements: [],
    companyEvents: { offers: [], priceWarUntil: null, outages: 0, poached: 0 },
    library: [],
    libraryUses: [],
  };
}

export function createLedger(): LedgerRun {
  return {
    delivered: 0,
    revenue: 0,
    projectProfit: 0,
    humanMinutes: 0,
    tasksCompleted: 0,
    defectsEscaped: 0,
    modeCompleted: {},
    templates: [],
    industries: {},
    library: {},
  };
}

export const emptyTotals: CompanyTotals = {
  revenue: 0,
  profit: 0,
  humanMinutes: 0,
  delivered: 0,
  outages: 0,
  poached: 0,
};

/** 最初の期。startDay が null なら、会社が営業を始めた営業日から数える */
export function createFiscal(startDay: number | null): FiscalRun {
  return { no: 1, startDay, opening: emptyTotals, teams: {}, best: null, worst: null, achievements: [], reports: [] };
}

export function createFunds(): FundsRun {
  return { shortDays: 0, bankruptAt: null, samples: [], sampleEvery: balance.valuation.sampleDays };
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

export function createHumanQueues(team: readonly string[] = founders): Record<string, readonly QueueItem[]> {
  return Object.fromEntries(team.map((id) => [id, []]));
}

/**
 * 案件を始めた状態。terms はコンペで決まった売上（見積額）と納期で、省けば案件の定義の値
 */
export function createProjectRun(
  projectId: string,
  clock: number,
  terms?: { readonly revenue: number; readonly deadlineDays: number },
): ProjectRun {
  const def = getProject(projectId);
  const tasks = Object.fromEntries(def.tasks.map((t) => [t.id, createTaskRun()]));
  const { revenue, deadlineDays } = terms ?? def;
  const management = { minutes: 0, laborCost: 0, aiCost: 0, playerAssigned: 0 };
  return { projectId, startedAt: clock, completedAt: null, revenue, deadlineDays, tasks, management };
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

/** プレイヤーが案件の Task の担当を決めたことを記録する（ManagementRun.playerAssigned） */
export function notePlayerAssigned(state: GameState, projectId: string, count = 1): GameState {
  const project = state.projects[projectId];
  if (!project) return state;
  const management = { ...project.management, playerAssigned: project.management.playerAssigned + count };
  return { ...state, projects: { ...state.projects, [projectId]: { ...project, management } } };
}
