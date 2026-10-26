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
} as const;

export type GameSpeed = (typeof balance.time.speeds)[number];
