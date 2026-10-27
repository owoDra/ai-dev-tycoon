/**
 * バランス値の集約場所。ゲームの手応えに関わる数値はここ以外に書かない。
 */
export const balance = {
  time: {
    /** 1倍速のとき、実時間1秒で進むゲーム内の分数 */
    minutesPerRealSecond: 2,
    /** シミュレーションの固定ステップ幅（ゲーム内の分）。システムはこの幅ごとに1回ずつ適用される */
    tickMinutes: 1,
    /** 選べる速度倍率。先頭が既定値 */
    speeds: [1, 2, 4],
  },
  project: {
    /** 1営業日の長さ（ゲーム内の分）。納期の換算に使う */
    minutesPerBusinessDay: 480,
    /** 納期を1営業日超過するごとに失う、売上に対する割合 */
    delayLossPerDay: 0.1,
  },
  success: {
    /** 失敗リスクに対する難易度の重み */
    difficultyWeight: 0.5,
    /** 失敗リスクに対する品質要求の重み */
    qualityReqWeight: 0.4,
    /** 成功確率の下限・上限。どんな条件でも確実な成功・確実な失敗にはしない */
    min: 0.05,
    max: 0.99,
  },
  human: {
    /** skill 1 の人間の基礎的な正確さ */
    competence: 0.97,
    /** 人間が受けるリスクの倍率。人間は遅いが安定している（企画書5章） */
    riskScale: 0.3,
  },
  ai: {
    /** AI 適性 0 の Task で発揮できる能力の割合。適性 1 で能力をすべて発揮する */
    aptitudeFloor: 0.4,
  },
  assign: {
    /** AI への指示出しにかかる人間の時間（effort に対する割合） */
    instructShare: 0.05,
    /** AI の成果物の人間によるレビュー（effort に対する割合） */
    reviewShare: 0.25,
    /** Human → AI で人間が行う重要判断（effort に対する割合）。残りを AI が処理する */
    judgementShare: 0.3,
    /** レビューで失敗が見つかったときの手戻り（effort に対する割合） */
    reworkShare: 0.3,
    /** 自動テスト・Eval が見つけた失敗を AI が直す修復（effort に対する割合）。テストが場所を示すので、人間の手戻りより軽い */
    repairShare: 0.15,
    /** AI → 自動テスト → 確認：自動テスト（AI の工程、effort に対する割合） */
    evalShare: 0.1,
    /** AI → 自動テスト → 確認：自動テストの後の人間の最終確認（effort に対する割合）。レビューの 1/5 */
    finalCheckShare: 0.05,
    /**
     * AI の自動テストが、残っている失敗を見つける確率（Task の種類ごと）。コードやテストのように結果を機械で確かめられる仕事は高く、
     * 企画・設計・文章のように良し悪しが判断で決まる仕事は低い。自動テストは万能ではないので、仕事の性質で人間レビューと使い分ける
     */
    autoTestCatch: { planning: 0.15, research: 0.25, design: 0.25, content: 0.3, code: 0.9, test: 0.75, release: 0.5 },
    /** 種類のない Task（実務モードの工程など）の自動テストの検出率 */
    autoTestCatchDefault: 0.5,
    /** 人間の最終確認（軽く見るだけ）が、自動テストをすり抜けた失敗を見つける確率。じっくり見るレビューは必ず見つける */
    finalCheckCatch: 0.3,
    /** Workflow にまとめて任せる Task の最小数（企画書5章「複数工程を自動的につなげる」） */
    workflowMinTasks: 2,
  },
  quality: {
    /** 失敗を見逃して完了した Task の品質低下＝ escapedLossBase + escapedLossByReq × qualityReq */
    escapedLossBase: 0.3,
    escapedLossByReq: 0.4,
  },
  score: {
    /** 見逃した失敗が納品後に起こす損害（値引き・補償、円）＝ effort（分）× qualityReq × この値 */
    escapedDefectCostPerEffortMinute: 300,
    /**
     * 見逃した失敗を納品後に人間が直す時間（effort に対する割合）。本番での修正は最初から直すより重い。
     * レビューを省く手は「失敗が少なければ大勝ち、多ければ大損」の賭けになる
     */
    escapedFixShare: 1.2,
    /** 納品後の修正にかかる人件費（円/人日） */
    escapedFixDailyCost: 40_000,
  },
  /** Context（企画書9〜11章）。大きさは資料の size と同じ単位 */
  context: {
    /** AI が一度に抱えられる Context の大きさ。これを超えると溢れる */
    capacity: 100,
    /** Session を続けると溜まる履歴のノイズ（AI が1分作業するごと） */
    driftPerMinute: 1.2,
    /** Noise が Context の大きさに占める割合がこれ以上なら「散らかり」 */
    clutteredNoise: 0.2,
    /** Noise の割合 1 あたりに成功確率から引く量（誤判断率の上昇） */
    errorPerNoise: 0.45,
    /** Task に必要な資料が欠けている割合 1 あたりに成功確率から引く量 */
    missingPenalty: 0.4,
    /** Context が溢れている（使用率 1 以上）ときに成功確率から引く量 */
    overflowPenalty: 0.15,
    /** Task に関係する古い仕様を渡していると、それを参照して失敗する確率（古い仕様の参照） */
    staleReferenceChance: 0.3,
    /** 矛盾するルールの組1つあたりに成功確率から引く量 */
    conflictPenalty: 0.1,
    /** Context の使用率 1 あたりの AI 費用の増加率（AI 消費量の増加） */
    costPerFill: 0.8,
    /** Noise の割合 1 あたりの Tool の誤選択の確率。起きると AI の作業時間が toolMissExtra だけ延びる */
    toolMissPerNoise: 0.8,
    toolMissExtra: 0.6,
  },
  /** Session Reset と Handoff（企画書11〜12章） */
  handoff: {
    /** Handoff の項目1つが次の Session で占める Context の大きさ（関係のある情報として数える） */
    itemSize: 2,
    /** Handoff で残さなかった項目の影響が続く、Reset 後の AI の作業の回数 */
    recoverWorks: 3,
    /**
     * Handoff で残さなかった項目ごとの影響。成功確率から引く量と、作業の把握し直しで AI の作業時間に足す割合（effort に対する）。
     * Decisions の喪失が最も重い（企画書11章「Important Decisions Lost」）
     */
    loss: {
      goal: { successPenalty: 0.08, relearnShare: 0.1 },
      decisions: { successPenalty: 0.15, relearnShare: 0 },
      constraints: { successPenalty: 0.08, relearnShare: 0 },
      modifiedFiles: { successPenalty: 0.02, relearnShare: 0.2 },
      validation: { successPenalty: 0.06, relearnShare: 0 },
      remainingWork: { successPenalty: 0.02, relearnShare: 0.2 },
    },
    /** Artifact Driven Work：成果物（コード・テスト・Task State）に状態を保存するため、AI の作業に足す時間（effort に対する割合） */
    artifactShare: 0.04,
  },
  /** Harness（企画書7〜8章・13〜18章）。部品の補正（content/harness）の合算のしかた */
  harness: {
    /**
     * 補正の項目ごとの合算のしかたと上限・下限。add: 足す / mul: 掛ける / any: 1 − Π(1 − 値)（どれかが起きる確率）。
     * 上限があるので、同じ種類の部品を重ねるほど効き目は頭打ちになる
     */
    combine: {
      success: { op: 'add', min: -0.5, max: 0.35 },
      speed: { op: 'mul', min: 0.3, max: 3 },
      noise: { op: 'add', min: 0, max: 1 },
      humanTime: { op: 'mul', min: 0.25, max: 2 },
      aiCost: { op: 'mul', min: 0.5, max: 5 },
      risk: { op: 'add', min: 0, max: 0.6 },
      evalCatch: { op: 'any', min: 0, max: 0.95 },
    },
    /**
     * 同じカテゴリの部品の組ごとにかかる補正（n 個付けると n(n−1)/2 組）。数の2乗で増える調整コスト。
     * subagent: Agent 間の通信と Coordination Cost（企画書15章）/ tool: Tool の組み合わせによる複雑さ（企画書16章）
     */
    pairs: {
      subagent: { success: -0.06, aiCost: 1.08 },
      tool: { noise: 0.012, risk: 0.004 },
    },
    /** AI へのお願い（指示文に書いたルール）が1回の作業で守られる確率（企画書14章） */
    requestCompliance: 0.5,
    /** Eval の自動検証1回にかかる AI の時間（effort に対する割合） */
    evalShare: 0.1,
    /** Eval → Repair → Eval を繰り返す上限。超えたら残った失敗のまま次の工程へ進む */
    maxRepairLoops: 3,
    /** 事故（権限・Tool の誤用）1件の損害（円）。作業は失敗扱いになる */
    accidentCost: 50_000,
  },
  /** Autonomy（企画書23章）。人間が介入せずに AI が処理を続けた時間 */
  autonomy: {
    /** Streak がこの時間（分）を越えるたびに AutonomyMilestone を出す（AUTONOMY STREAK の演出）。昇順 */
    milestones: [30, 60, 120, 240],
  },
  /**
   * Seat（企画書6章）。価格（content/seats.ts の米ドル）をゲーム内の円に換算して日割りで計上する。
   * 人件費や売上と同じ桁で効くよう、為替レートではなくゲームの経済に合わせた係数にしている
   */
  seat: {
    /** 1米ドルあたりのゲーム内の円 */
    yenPerUsd: 2000,
    /** 月額を日割りにするときの1か月の営業日数 */
    businessDaysPerMonth: 20,
    /** 運用者の Seat の使用量が上限を超えた後の、AI Worker の作業速度の倍率（上限は営業日ごとに戻る） */
    overLimitSpeed: 0.25,
  },
  /** 社員（content/staff.ts） */
  staff: {
    /** 得意分野の Task の人間の工程の速度の倍率 */
    strengthSpeed: 1.25,
    /** 原価率。社員の1人日あたりの原価（給与）＝売値（dailyRate）× この値 */
    costRatio: 0.5,
  },
  /**
   * 人材の生成（core/talent.ts）。速度と正確さは [min, max] の三角分布（中央が最も多い）で、平均は中央の値。
   * 売値は能力から決める：mean ×（1 + perSkill ×（速度 − 平均）+ perAccuracy ×（正確さ − 平均）+ perStrength × 得意分野の数
   * − strengthOffset）を roundTo で丸め、floor を下回らない。得意分野の数の平均で strengthOffset を打ち消すので、売値の平均は mean 前後になる
   */
  talent: {
    skill: { min: 0.7, max: 1.3 },
    accuracy: { min: 0.92, max: 1.02 },
    /** 速度と正確さの刻み（表示と比べやすさのため） */
    statStep: 0.01,
    /** 得意分野の数（0〜2個）の重み */
    strengthCount: [3, 5, 2],
    rate: {
      mean: 80_000,
      floor: 50_000,
      perSkill: 1.1,
      perAccuracy: 3,
      perStrength: 0.08,
      strengthOffset: 0.072,
      roundTo: 1_000,
    },
  },
  /** 採用（core/team.ts の採用市場と Hire / Release） */
  hire: {
    /** 営業日ごとに入れ替わる採用候補の数（Phase 21 で会社の規模から決める） */
    candidates: 3,
    /** 人員の上限（Phase 21 で会社の規模から決める） */
    maxStaff: 6,
    /** 契約金は売値の何人日分か */
    signingDays: 3,
    /** チュートリアルなしで始めたときに seed から生成する最初の社員の数（平均的な能力の人） */
    initialStaff: 2,
  },
  /**
   * 案件の生成（core/projectGen.ts）。規模ごとに、作業量・市場の標準価格・納期の倍率、並行する複製の数（型の scales の Task）、
   * 省く Task（型の optional）を省くか、品質要求に足す量を決める
   */
  projectGen: {
    sizes: {
      S: { effort: 0.6, price: 0.6, deadline: 0.7, copies: 0, dropOptional: true, qualityReq: -0.05 },
      M: { effort: 1, price: 1, deadline: 1, copies: 0, dropOptional: false, qualityReq: 0 },
      L: { effort: 1.5, price: 1.5, deadline: 1.3, copies: 1, dropOptional: false, qualityReq: 0.05 },
      XL: { effort: 2.2, price: 2.2, deadline: 1.6, copies: 2, dropOptional: false, qualityReq: 0.1 },
    },
    /** Task ごとの作業量のばらつき（倍率の範囲）と、丸める刻み（分） */
    effortJitter: { min: 0.85, max: 1.15 },
    effortStep: 10,
    /** 案件ごとの標準価格のばらつき（倍率の範囲）と、丸める刻み（円） */
    priceJitter: { min: 0.9, max: 1.1 },
    priceStep: 10_000,
    /** 発注者の性格ごとの予算の上限（標準価格に対する倍率の範囲） */
    budget: {
      price: { min: 1.02, max: 1.12 },
      quality: { min: 1.12, max: 1.3 },
      deadline: { min: 1.06, max: 1.22 },
    },
    /** 競合の数の範囲 */
    rivals: { min: 2, max: 4 },
  },
  /**
   * 案件ボード（core/board.ts）。営業日ごとに引き合いが届き、応募の締切に結果が出る。
   * 数と規模の分布は Phase 21 で会社の規模から決める（それまでは固定）
   */
  board: {
    /** 営業日ごとに届く引き合いの数 */
    perDay: 2,
    /** 応募の締切（届いた営業日から数えて何営業日目の終わりか） */
    closeDays: 2,
    /** 引き合いに出る規模の重み（L・XL は Phase 21 の会社の成長で出す） */
    sizes: { S: 1, M: 1, L: 0, XL: 0 },
    /** 案件ボードに残す最近のコンペの結果の数 */
    history: 10,
  },
  /**
   * コンペ（core/bidding.ts）。見積の基準額 = 見積人日 × 平均売値（balance.talent.rate.mean）。
   * 見積人日は市場の標準価格を平均売値で割った値（請求の人日。ゲーム内の作業時間はこれより短く縮めてある）。
   * 各社の評価 = −価格の比 × price ＋ 提案力 × proposal − 納期の比 × deadline（重みは発注者の性格ごと）で、
   * 勝率 = exp(評価 / temperature) を競合とあわせて正規化した値。予算の上限を超える見積は 0
   */
  bid: {
    /** 選べる価格（基準額に対する倍率）。中央が基準 */
    prices: { minus20: 0.8, minus10: 0.9, base: 1, plus10: 1.1, plus20: 1.2 },
    /** 選べる納期（標準の納期に対する倍率。営業日に丸め、1日以上） */
    deadlines: { short: 0.8, standard: 1, long: 1.2 },
    /** 見積人日を丸める刻み */
    personDayStep: 0.5,
    /** 金額を丸める刻み（円） */
    amountStep: 10_000,
    temperature: 0.1,
    focus: {
      price: { price: 1.5, proposal: 0.4, deadline: 0.4 },
      quality: { price: 0.7, proposal: 1.2, deadline: 0.4 },
      deadline: { price: 0.7, proposal: 0.4, deadline: 1.2 },
    },
    /** 提案力（0〜1）= 評判 × reputation ＋ 同業種の実績（trackCap 件で頭打ち）× track ＋ AI 体制（aiCap で頭打ち）× ai */
    proposal: { reputation: 1, track: 0.15, trackCap: 3, ai: 0.15, aiCap: 4 },
    /** 競合の価格の比・提案力・納期の比の範囲（三角分布） */
    rival: {
      price: { min: -0.15, max: 0.15 },
      proposal: { min: 0.35, max: 0.65 },
      deadline: { min: -0.2, max: 0.2 },
    },
  },
  /**
   * 評判（0〜100）。納品のたびに変わる：納期内なら onTime を足し、遅れたら遅れた営業日（切り上げ）× perLateDay を引く。
   * さらに品質（作業量で重み付けした平均）が qualityPivot より高いほど足し、低いほど引く（× perQuality）
   */
  reputation: {
    initial: 50,
    min: 0,
    max: 100,
    onTime: 4,
    perLateDay: 8,
    qualityPivot: 0.9,
    perQuality: 40,
  },
  /** 結果画面と振り返り（view/retrospective.ts・view/rank.ts） */
  result: {
    /**
     * ランク（S / A / B / C）。Profit / Person-Day が、人間だけで進めた場合の見込みの何倍になったかの下限（上から順に判定）。
     * 納品していない・利益が出ていなければ C
     */
    rank: { S: 3, A: 2, B: 1.3 },
    /** 振り返りで「それが無かった場合」を再シミュレーションする改善の数（寄与の大きい順） */
    counterfactualTop: 2,
    /** 再シミュレーションで、Task ごとに seed を変えて平均する回数 */
    counterfactualSamples: 6,
    /** この大きさ（円換算）に満たない寄与は、振り返りのカードに出さない */
    minCardValue: 1_000,
  },
  /**
   * 閉じている間の進行（core/away.ts）。隙間時間に少しずつ遊べるよう、タブを閉じていた実時間の分だけ再開時に進める。
   * 進めるのはその営業日の終わりまでで、判断の機会を何日分も飛ばさない
   */
  away: {
    /** 閉じていた実時間をゲーム内の分に換算するときの速度の倍率 */
    speed: 1,
  },
  /** Workflow Library（core/library.ts） */
  library: {
    /** Workflow の名前の長さの上限（文字）。共有コードの文字列の上限（lib/codec.ts）にも収まる */
    maxNameLength: 20,
  },
  /**
   * 実務モード（core/practice.ts）。実際の業務の1回分を、ゲームと同じ式（工程 = Task、作業量 = 今の人間の分）で見積もる。
   * 人間は入力した本人（熟練度 1）とし、Model の費用・部品の導入コストはゲームと同じ円で数える
   */
  practice: {
    /** 頻度ごとの1年の実施回数（毎日は営業日） */
    runsPerYear: { daily: 240, weekly: 52, monthly: 12 },
    /** 人件費の既定値（円/人日）。人件費の換算と ROI に使う */
    dailyWage: 32_000,
    /** 工程の数の上限 */
    maxSteps: 8,
    /** 業務名・工程名の長さの上限（文字） */
    maxNameLength: 30,
    /** 1工程の人間時間の上限（分） */
    maxStepMinutes: 600,
  },
} as const;

export type GameSpeed = (typeof balance.time.speeds)[number];
