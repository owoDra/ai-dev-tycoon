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
} as const;

export type GameSpeed = (typeof balance.time.speeds)[number];
