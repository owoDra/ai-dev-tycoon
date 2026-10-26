/** UI の文言。ゲーム内のテキストはすべてここに集約する */
export const ja = {
  title: 'AI業務改善タイクーン',
  clock: {
    day: (day: number) => `${day}日目`,
  },
  controls: {
    pause: '一時停止',
    resume: '再開',
    paused: '一時停止中',
    running: '進行中',
    speed: (speed: number) => `${speed}倍速`,
    speedGroup: 'ゲーム速度',
  },
} as const;
