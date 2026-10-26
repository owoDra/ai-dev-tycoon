const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export interface ClockView {
  /** 1日目から数える */
  readonly day: number;
  /** "HH:MM" */
  readonly time: string;
}

/** ゲーム内の経過分を、日数と時刻の表示用に変換する */
export function clockView(clock: number): ClockView {
  const total = Math.floor(clock);
  const minutesOfDay = total % MINUTES_PER_DAY;
  const hh = String(Math.floor(minutesOfDay / MINUTES_PER_HOUR)).padStart(2, '0');
  const mm = String(minutesOfDay % MINUTES_PER_HOUR).padStart(2, '0');
  return { day: Math.floor(total / MINUTES_PER_DAY) + 1, time: `${hh}:${mm}` };
}
