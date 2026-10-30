/** 動画に出す事実。数字は書いた時点の実測（project/ で npm run build・git log）で、ゲームを変えたら見直す */
export const facts = {
  /** dist/index.html の大きさ（MB） */
  htmlMegabytes: 2.0,
  /** 最初のコミット（2026-10-26）から Phase 43（2026-10-29）までの日数 */
  days: 3,
} as const;
