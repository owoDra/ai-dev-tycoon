/**
 * バランス値の集約場所。ゲームの手応えに関わる数値はここ以外に書かない。
 */
export const balance = {
  time: {
    /** シミュレーションの固定ステップ幅（ゲーム内の分）。システムはこの幅ごとに1回ずつ適用される */
    tickMinutes: 1,
    /** 1日の長さ（ゲーム内の分）。納期・営業日・日割りの固定費はこの単位で数える */
    minutesPerDay: 1440,
    /** 時計の 0 が指す時刻（0:00 からの分）。ゲームは1日目の始業から始まり、営業日はこの時刻で切り替わる */
    origin: 600,
    /**
     * 人間の勤務時間（0:00 からの分）。始業から終業まで働き、昼休みは手を止める。
     * 勤務時間の外は人間が帰っていて、AI は手元の工程だけを進める（人間の工程は翌朝まで待つ）
     */
    workday: { start: 600, lunchStart: 780, lunchEnd: 840, end: 1140 },
    /** 「判断が必要になるまで進める」で一度に進める日数の上限（core/turn.ts） */
    maxSkipDays: 20,
  },
  project: {
    /** 1人日の長さ（人間が働くゲーム内の分）。勤務時間から昼休みを除いた長さ */
    minutesPerPersonDay: 480,
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
    /**
     * 掛け持ちの切り替えの手間。2件以上を掛け持ちすると、合計の進み方がこの割合だけ減り、それを件数で等分する
     * （core/formulas.ts の multitaskShare。2件なら各40%、3件なら各約27%）
     */
    switchLoss: 0.2,
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
    /**
     * 1か月の勤務日数。成果は「人間1人あたり、月換算でいくらの利益ペースか」（利益 / 人日 × この日数）で見せる。
     * 1人日は8時間（balance.project.minutesPerPersonDay）なので、月160時間働いた場合の利益になる
     */
    workDaysPerMonth: 20,
    /**
     * 見逃した失敗が納品後に起こす損害（値引き・補償、円）＝ effort（分）× qualityReq × この値。
     * effort はゲーム内の縮めた時間なので、人件費と同じく作業時間の縮尺（balance.staff.timeScale）を掛けた額にしてある
     */
    escapedDefectCostPerEffortMinute: 1_800,
    /**
     * 見逃した失敗を納品後に人間が直す時間（effort に対する割合）。本番での修正は最初から直すより重い。
     * レビューを省く手は「失敗が少なければ大勝ち、多ければ大損」の賭けになる
     */
    escapedFixShare: 1.2,
    /** 納品後の修正にかかる人件費（円/ゲーム内の人日。社員の平均的な原価） */
    escapedFixDailyCost: 240_000,
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
      guard: { op: 'add', min: 0, max: 1 },
    },
    /**
     * 同じカテゴリの部品の組ごとにかかる補正（n 個付けると n(n−1)/2 組）。数の2乗で増える調整コスト。
     * subagent: Agent 間の通信と Coordination Cost（企画書15章）/ mcp: MCP の組み合わせによる複雑さ（企画書16章）。
     * 部品の pairRelief（worktree）があれば、その割合だけ組の数を減らして数える
     */
    pairs: {
      subagent: { success: -0.06, aiCost: 1.08 },
      mcp: { noise: 0.012, risk: 0.004 },
    },
    /**
     * カテゴリごとの書いた量（HarnessPartDef.size の合計）の目安。超えると、そのカテゴリの部品の補正は 目安 ÷ 合計 の割合でしか効かない。
     * claudeMd: CLAUDE.md は毎回すべて読むので、長すぎると読み落とす
     */
    budgets: { claudeMd: 12 },
    /** CLAUDE.md に書いたルールが、役に立たない仕事で Noise になる量（書いた量 1 あたり） */
    claudeMdNoisePerSize: 0.012,
    /**
     * Rules（パスで読み込むルール）の補正が効く割合。関係するファイルを触ったときに初めて読むので、
     * 読む前に判断してしまう分だけ CLAUDE.md より弱い（全部の仕事に必要なものは CLAUDE.md が正解になる）
     */
    rulesRecall: 0.75,
    /** AI へのお願い（指示文に書いたルール）が1回の作業で守られる確率（企画書14章） */
    requestCompliance: 0.5,
    /** Eval の自動検証1回にかかる AI の時間（effort に対する割合） */
    evalShare: 0.1,
    /** Eval → Repair → Eval を繰り返す上限。超えたら残った失敗のまま次の工程へ進む */
    maxRepairLoops: 3,
    /** 事故（権限・Tool の誤用）1件の損害（円）。作業は失敗扱いになる。人件費と同じく作業時間の縮尺を掛けた額 */
    accidentCost: 300_000,
    /**
     * Harness なしの素の AI の弱さ。部品の guard（型にはめる度合い）が届かない分 bareness = 1 − guard に比例して効く。
     * ルールも手順も検査もない AI は、それらしく見えるが要件を外した成果物を出す（successLoss：成功確率を失う割合）。
     * それらしく見えるので、人間がレビューしても AI が自分でテストしても失敗を見逃しやすい（reviewBlind：確認の工程の検出率を下げる割合）。
     * 「ただ AI を使うだけ」では人間だけより割に合わず、Skill・ルール・Eval を組んで初めて AI が儲かる
     */
    bare: { successLoss: 0.8, reviewBlind: 0.75 },
  },
  /** Autonomy（企画書23章）。人間が介入せずに AI が処理を続けた時間 */
  autonomy: {
    /** Streak がこの時間（分）を越えるたびに AutonomyMilestone を出す（AUTONOMY STREAK の演出）。昇順 */
    milestones: [30, 60, 120, 240],
  },
  /**
   * Seat（企画書6章）。会社が種類ごとに枚数で買う。価格（content/seats.ts の米ドル）をゲーム内の円に換算して日割りで計上する。
   * 人件費や売上と同じ桁で効くよう、為替レートではなくゲームの経済に合わせた係数にしている
   */
  seat: {
    /** 1米ドルあたりのゲーム内の円 */
    yenPerUsd: 2000,
    /** 月額を日割りにするときの1か月の営業日数 */
    businessDaysPerMonth: 20,
    /** 会社を始めたときに持っている Seat の枚数（種類ごと） */
    initial: { standard: 2, premium: 0 },
  },
  /** 社員（content/staff.ts） */
  staff: {
    /** 得意分野の Task の人間の工程の速度の倍率 */
    strengthSpeed: 1.25,
    /** 原価率。請求の1人日あたりの原価（給与）＝売値（dailyRate）× この値 */
    costRatio: 0.5,
    /**
     * 作業時間の縮尺。ゲーム内の1人日（minutesPerPersonDay 分）の仕事は、請求の何人日分にあたるか。
     * 案件の作業量は、見積の請求人日（core/bidding.ts の estimatePersonDays）よりこの割合で短く縮めてあるので、
     * 給与も同じ割合で上げ、人間だけで進めたときの人件費を見積の「人間だけの人件費」と揃える
     */
    timeScale: 6,
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
    /**
     * 規模ごとの補正。大きい案件ほど失敗しやすく（failRisk。Eval・Hook・Skill で防ぐ価値が上がる）、
     * 資料が大きく散らかる（docScale は資料の大きさの倍率。Context の絞り込みと Handoff の価値が上がる）。
     * 並行する複製（copies）は同じ種類の Task を増やすので、Workflow Library の使い回しが効く
     */
    sizes: {
      S: {
        effort: 0.6,
        price: 0.6,
        deadline: 0.7,
        copies: 0,
        dropOptional: true,
        qualityReq: -0.05,
        failRisk: 0,
        docScale: 1,
      },
      M: { effort: 1, price: 1, deadline: 1, copies: 0, dropOptional: false, qualityReq: 0, failRisk: 0, docScale: 1 },
      L: {
        effort: 1.5,
        price: 1.5,
        deadline: 1.3,
        copies: 1,
        dropOptional: false,
        qualityReq: 0.05,
        failRisk: 0.03,
        docScale: 1.2,
      },
      XL: {
        effort: 2.2,
        price: 2.2,
        deadline: 1.6,
        copies: 2,
        dropOptional: false,
        qualityReq: 0.1,
        failRisk: 0.15,
        docScale: 2.4,
      },
    },
    /** Task ごとの作業量のばらつき（倍率の範囲）と、丸める刻み（分） */
    effortJitter: { min: 0.85, max: 1.15 },
    effortStep: 10,
    /**
     * 納期の倍率（型の標準の納期 × 規模の倍率に掛ける）。時間は1日ずつ進めるので、人手の割り当てを考えないと間に合わない程度に締める
     * （人間1人に全部を掛け持ちさせると外し、分担すれば間に合う。tests/balance/contract.test.ts）
     */
    deadlineScale: 0.35,
    /** 案件ごとの標準価格のばらつき（倍率の範囲）と、丸める刻み（円） */
    priceJitter: { min: 0.9, max: 1.1 },
    priceStep: 10_000,
    /** 生成した案件の定義と資料のキャッシュの上限（超えたら捨てて作り直す。同じ id なら同じ結果になる） */
    cacheLimit: 2000,
  },
  /**
   * 案件ボード（core/board.ts）。営業日ごとに引き合いが届き、応募の締切に結果が出る。
   * 数と規模の分布は会社の規模（balance.company.tiers）で決まる
   */
  board: {
    /**
     * 応募の締切の時刻（0:00 からの分）。引き合いは、届いた営業日から数えて closeDays 営業日目のこの時刻に締め切り、結果が出る。
     * 届いた営業日の締切まで minOpenMinutes 未満で届いたとき（チュートリアルを夕方に終えたときなど）は、1営業日遅らせる
     */
    closeAt: 1020,
    /**
     * 規模ごとの受付の期間（届いた営業日を1日目とする営業日数）。毎朝ボードを見なくても、翌日に受注できる。
     * 大きい案件ほど長く、手が空くのを待てる
     */
    closeDays: { S: 2, M: 2, L: 3, XL: 3 },
    /** 届いてから締切までに少なくとも残す時間（ゲーム内の分） */
    minOpenMinutes: 120,
  },
  /**
   * 受注（core/orders.ts）。売上は評判で上下する（評判の幅いっぱいで ±reputationWeight / 2）。金額は amountStep（円）に丸める。
   * 評判は期限切れのたびにも下がる（balance.contract）ので、売上への効きを大きくしすぎると、期限を外しがちな会社が
   * 値下がりと打ち切りの二重で一気に倒産する（下手な戦略でも1年は持つ。tests/balance/long-run.test.ts）
   */
  orders: {
    reputationWeight: 0.2,
    amountStep: 10_000,
  },
  /**
   * 案件の契約（core/contract.ts）。生成した案件の strictShare が期限厳守で、売上が strictPremium 倍になる。
   * 期限厳守の案件は期限が切れるとその場で打ち切り（入金なし）、それ以外は炎上して作業を続ける（納品すれば元の売上が入る）。
   * 期限切れ・打ち切りのたびに評判が下がり（reputation）、企業価値も売上 × valuation の分だけ下がる（valuationHit。営業日ごとに recovery の割合ずつ戻る）。
   * 会社側から打ち切ると、期限切れより大きく下がる
   */
  contract: {
    strictShare: 0.4,
    strictPremium: 1.3,
    reputation: { burning: 12, expired: 15, cancelled: 22 },
    valuation: { burning: 1.5, expired: 2, cancelled: 3 },
    recovery: 0.05,
  },
  /**
   * 評判（0〜100）。納品のたびに変わる：期限内なら onTime を足す（炎上した案件は足さない。期限切れの下げは balance.contract）。
   * さらに品質（作業量で重み付けした平均）が qualityPivot より高いほど足し、低いほど引く（× perQuality）
   */
  reputation: {
    initial: 50,
    min: 0,
    max: 100,
    onTime: 4,
    qualityPivot: 0.9,
    perQuality: 40,
  },
  /**
   * 会社の規模（content/companyTiers.ts。並び順が昇格の順）。昇格の条件（requires）は、累計の会社の利益（円）・評判・納品数のすべてを満たすこと。
   * 段階ごとに、人員の上限（maxStaff）・AI Worker の上限（maxAiWorkers）・チーム数の上限（直轄を含む、maxTeams）・管理者を置けるか（managers）・
   * 同時に進められる案件の数（maxProjects）・営業日ごとの引き合いの数（inquiries）と規模の重み（sizes）・採用候補の数（candidates）・オフィスの固定費（円/営業日、officeDaily）が変わる
   */
  company: {
    tiers: {
      solo: {
        requires: { profit: 0, reputation: 0, delivered: 0 },
        maxStaff: 3,
        maxAiWorkers: 1,
        maxTeams: 1,
        managers: false,
        maxProjects: 1,
        inquiries: 3,
        sizes: { S: 1, M: 1, L: 0, XL: 0 },
        candidates: 3,
        officeDaily: 0,
      },
      startup: {
        requires: { profit: 15_000_000, reputation: 55, delivered: 15 },
        maxStaff: 5,
        maxAiWorkers: 2,
        maxTeams: 1,
        managers: false,
        maxProjects: 3,
        inquiries: 3,
        sizes: { S: 1, M: 2, L: 0, XL: 0 },
        candidates: 3,
        officeDaily: 10_000,
      },
      small: {
        requires: { profit: 150_000_000, reputation: 65, delivered: 60 },
        maxStaff: 8,
        maxAiWorkers: 3,
        maxTeams: 2,
        managers: true,
        maxProjects: 4,
        inquiries: 4,
        sizes: { S: 1, M: 2, L: 1, XL: 0 },
        candidates: 4,
        officeDaily: 30_000,
      },
      mid: {
        requires: { profit: 300_000_000, reputation: 75, delivered: 200 },
        maxStaff: 12,
        maxAiWorkers: 4,
        maxTeams: 3,
        managers: true,
        maxProjects: 6,
        inquiries: 4,
        sizes: { S: 1, M: 2, L: 2, XL: 1 },
        candidates: 4,
        officeDaily: 60_000,
      },
      large: {
        requires: { profit: 1_000_000_000, reputation: 85, delivered: 1_500 },
        maxStaff: 18,
        maxAiWorkers: 6,
        maxTeams: 4,
        managers: true,
        maxProjects: 8,
        inquiries: 5,
        sizes: { S: 0, M: 2, L: 2, XL: 2 },
        candidates: 5,
        officeDaily: 120_000,
      },
    },
  },
  /**
   * 大手の後の格付け（★2, ★3, …。core/company.ts）。格付け n の条件は、大手の条件に n × perRank を足したもの（評判は reputation 以上）。
   * 人員などの上限は大手のまま増やさず、格付けごとにオフィスの固定費と、規模 XL の引き合いの重みだけを上げる
   */
  ranks: {
    perRank: { profit: 500_000_000, delivered: 250 },
    reputation: 85,
    officePerRank: 30_000,
    xlPerRank: 0.5,
  },
  /**
   * 決算（core/fiscal.ts）。会社の期は days 営業日ごとに締め、前期と比べる。state に残す決算は keep 期まで（古いものから捨てる）
   */
  fiscal: {
    days: 60,
    keep: 40,
  },
  /**
   * 納品した案件を累計の記録（core/archive.ts）に移すまでの営業日。直近の案件は画面で見せるため state に残し、
   * それより前の案件は数だけを残す（長く遊んでも state の大きさと1ステップの処理時間が増え続けない）
   */
  archive: {
    keepDays: 2,
  },
  /**
   * 資金と倒産（core/funds.ts）。資金 = 開業資金 + 会社の累計の利益。営業日の終わりに資金がマイナスなら資金繰りの警告を出し、
   * graceDays 営業日続けてマイナスなら倒産する（ゲームオーバー）
   */
  funds: {
    initial: 12_000_000,
    graceDays: 20,
  },
  /**
   * 時価総額（core/funds.ts）= 資金 + 直近の利益のペース（windowDays 営業日の利益を1年に換算。マイナスなら 0）× multiple ×
   * 評判の補正（1 +（評判 − 初期値）/ 評判の幅 × reputationWeight）。0 を下回らない。
   * 推移は sampleDays 営業日ごとに記録し、maxSamples を超えたら1つおきに間引いて間隔を倍にする
   */
  valuation: {
    windowDays: 60,
    businessDaysPerYear: 240,
    multiple: 6,
    reputationWeight: 0.6,
    sampleDays: 5,
    maxSamples: 96,
    /** 間引くときに残す間隔（この数ごとに1つ残し、記録の間隔をこの倍にする） */
    thinning: 2,
  },
  /**
   * 後半の事件（content/companyEvents.ts・core/companyEvents.ts）。どれも会社がある規模（minTier）以上になってから起きる。
   * - outage（大規模障害）：規模 L・XL の案件の納品時に、見逃した失敗の Task の数 × perEscaped（max まで）の確率で起きる。
   *   売上の costShare の損害と、評判 reputation の低下
   * - poach（人材の引き抜き）：営業日ごとに perDay の確率で、売値の最も高い社員に打診が来る。noticeDays 営業日のうちに
   *   引き留め（売値の retainDays 人日分の賞与）か見送りを選ぶ。何もしなければ退職する（仕事を抱えていれば終わってから）
   * - priceWar（競合の値下げ）：営業日ごとに perDay の確率で始まり、days 営業日のあいだ競合の価格の比が priceCut だけ下がる
   */
  companyEvents: {
    /**
     * 序盤（個人事業）には起こさず、この規模になってから始まる仕組み（Phase 38。序盤は任せ方と受注に集中させる）。
     * incidents: Harness 由来の事件（content/incidents.ts）/ achievements: 実績の判定と表示
     */
    later: { incidents: 'startup', achievements: 'startup' },
    outage: { minTier: 'small', perEscaped: 0.2, max: 0.7, costShare: 0.3, reputation: 10 },
    poach: { minTier: 'small', perDay: 0.03, noticeDays: 3, retainDays: 10, minStaff: 2 },
    priceWar: { minTier: 'startup', perDay: 0.02, days: 10, priceCut: 0.15 },
  },
  /**
   * 管理者（core/manager.ts）。直轄以外のチームの担当モードと担当者を、期待値（core/expectation.ts）で決める。
   * 各モードの評価 = −（人間の時間の人件費 + AI 費用 + 事故の損害 + 見逃しの損害 × qualityWeight）− 人間の時間（人日）× personDayValue。
   * 見逃しの損害は、納品後の損害と修正の人件費（balance.score）
   */
  manager: {
    /** 評価で人間の時間に掛ける原価（円/ゲーム内の人日）。社員の平均的な原価（平均売値 × 原価率 × 作業時間の縮尺） */
    wage: 240_000,
    /** 利益 / 人日 を上げるため、人間の時間（人日）を費用とは別に重く見る量（円/人日） */
    personDayValue: 40_000,
    human: {
      /** 人間 PM は見逃しの損害を正しく見積もる */
      qualityWeight: 1,
      /** 評価のばらつき（各モードの評価に、−noise〜noise の一様乱数 × Task の作業量の人件費 を足す） */
      noise: 0,
      /**
       * 人間 PM の稼働（人日に数える割合）。チームの作業をする社員1人あたり perMember（1人分が上限）。
       * 給与は運営している間ずっと案件の運営の費用にかかる
       */
      perMember: 0.15,
    },
    ai: {
      /** AI PM は見逃しの損害を軽く見る（品質要求の高い案件で見逃しが増える） */
      qualityWeight: 0.15,
      noise: 0.6,
      /**
       * AI PM の見落とし。AI PM が運営する案件の AI の作業は、Task の品質要求が qualityPivot を超えた分 × missPerQualityReq だけ成功確率が下がり、
       * × accidentPerQualityReq の確率で事故（権限・Tool の誤用）が起きやすくなる。品質要求の低い案件には影響しない
       */
      qualityPivot: 0.7,
      missPerQualityReq: 0.5,
      accidentPerQualityReq: 0.2,
      /** AI PM が案件を運営している間の AI 費用（円/分）と、会社の Seat の使用量（/分） */
      costPerMinute: 20,
      usagePerMinute: 0.05,
    },
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
    /**
     * この大きさ（円換算）に満たない寄与は、振り返りのカードに出さない。平均的な社員の人間の時間でおよそ12分
     * （人件費は作業時間の縮尺 balance.staff.timeScale を掛けた原価で換算する）
     */
    minCardValue: 6_000,
  },
  /** Workflow Library（core/library.ts） */
  library: {
    /** Workflow の名前の長さの上限（文字）。共有コードの文字列の上限（lib/codec.ts）にも収まる */
    maxNameLength: 20,
  },
  /**
   * 持ち込み（core/bring.ts）。読み込んだ Claude Code の設定を評価して、Harness の部品（持ち込みカード）にする。
   * 補正は同じカテゴリの雛形の部品（content/bring.ts の bringTemplates）を 点 / 100 × maxStrength の強さで効かせたもの。
   * 雛形はカテゴリで最も良い同梱の部品なので、満点のカードをそろえると同梱の部品の組より少し強い。
   * maxStrength を 1 にして、満点でも同梱の最も良い部品を超えないようにする（tests/balance/bring.test.ts）
   */
  bring: {
    /** 読み込みの上限。ファイルの数・1ファイルの大きさ（バイト）・合計の大きさ（バイト）・zip そのものの大きさ（バイト）・作るカードの数 */
    limits: { files: 200, fileBytes: 100_000, totalBytes: 2_000_000, zipBytes: 4_000_000, cards: 40 },
    /** カードの名前の長さの上限（文字。部品の id に入れる） */
    maxNameLength: 24,
    /** 1枚のカードが効く仕事の種類の上限（CLAUDE.md と権限を除く。毎回読むものと、すべての操作にかかるもの） */
    maxKinds: 3,
    /** 満点（100点）のときの、雛形の部品に対する補正の強さ */
    maxStrength: 1,
    /** 導入コストの、雛形の部品に対する倍率（自分の設定をゲームの会社に入れる手間） */
    costRatio: 1,
    /** CLAUDE.md・Rules の行数を、ゲームの書いた量（size）に直す：切り上げ（行数 / linesPerSize）。上限 maxSize */
    linesPerSize: 15,
    maxSize: 40,
    /** 観点の目安 */
    skillMaxLines: 300,
    minSteps: 3,
    agentMaxTools: 6,
    claudeMdLines: { min: 10, max: 200 },
    rulesMaxLines: 120,
    mcpMaxServers: 3,
    /** 持ち寄りバトル（core/battle.ts）の案件の規模と、合言葉の長さの上限（文字） */
    battleSize: 'M',
    battleWordLength: 16,
  },
  /**
   * プラグインの書き出し（core/pluginExport.ts）。会社の規模ごとに、プラグインに入れられる Workflow の数の上限。
   * 会社が大きくなるほど、持ち帰れる Workflow が増える
   */
  pluginExport: {
    workflowsByTier: { solo: 1, startup: 2, small: 4, mid: 6, large: 10 },
  },
} as const;
