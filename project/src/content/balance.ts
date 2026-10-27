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
    /** レビューで失敗が見つかったときの手戻り（effort に対する割合）。AI の修復も同じ量を AI の速度で処理する */
    reworkShare: 0.3,
    /** AI → 自動テスト → 確認：自動テスト（AI の工程、effort に対する割合） */
    evalShare: 0.1,
    /** AI → 自動テスト → 確認：自動テストの後の人間の最終確認（effort に対する割合）。レビューの 1/5 */
    finalCheckShare: 0.05,
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
    /** 納品後の修正にかかる人件費の時給（円） */
    escapedFixHourlyWage: 4000,
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
    evalShare: 0.06,
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
  },
  /** 結果画面と振り返り（view/retrospective.ts・view/rank.ts） */
  result: {
    /**
     * ランク（S / A / B / C）。Profit / Human Hour が、人間だけで進めた場合の見込みの何倍になったかの下限（上から順に判定）。
     * 納品していない・利益が出ていなければ C
     */
    rank: { S: 3, A: 2, B: 1.3 },
    /** 振り返りで「それが無かった場合」を再シミュレーションする改善の数（寄与の大きい順） */
    counterfactualTop: 2,
    /** 再シミュレーションで、Task ごとに seed を変えて平均する回数 */
    counterfactualSamples: 6,
    /** この大きさ（円換算）に満たない寄与は、振り返りのカードに出さない */
    minCardValue: 500,
  },
} as const;

export type GameSpeed = (typeof balance.time.speeds)[number];
