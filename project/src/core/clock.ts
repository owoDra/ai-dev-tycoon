import { balance } from '../content/balance';

/*
 * ゲーム内の時計（24時間）。時計の値はゲーム開始からの経過分で、0 が1日目の始業（balance.time.origin）を指す。
 * 営業日は始業の時刻で切り替わり、人間は勤務時間（balance.time.workday）の間だけ働く。
 */

const DAY = balance.time.minutesPerDay;

/** ゲーム開始からの営業日の番号（0 から）。始業の時刻で切り替わる */
export const businessDay = (clock: number) => Math.floor(clock / DAY);

/** 時刻（0:00 からの分、0〜1439） */
export const minuteOfDay = (clock: number) => (((Math.floor(clock) + balance.time.origin) % DAY) + DAY) % DAY;

/** 暦の上の日の番号（0 から）。0:00 で切り替わる（表示用） */
export const calendarDay = (clock: number) => Math.floor((Math.floor(clock) + balance.time.origin) / DAY);

/** その時刻（0:00 からの分）に人間が働いているか。始業〜終業のうち、昼休みを除く */
export function isWorkMinute(minute: number): boolean {
  const w = balance.time.workday;
  return minute >= w.start && minute < w.end && !(minute >= w.lunchStart && minute < w.lunchEnd);
}

/**
 * 直前の1ステップ（clock − tickMinutes から clock まで）が人間の勤務時間か。
 * システムは時計を進めてから適用されるので、そのステップで処理する分は直前の1ステップになる
 */
export const humansAtWork = (clock: number) => isWorkMinute(minuteOfDay(clock - balance.time.tickMinutes));

/** 人間が働いている時間帯の区分（表示用）。勤務中・昼休み・退勤後（夜） */
export type DayPhase = 'work' | 'lunch' | 'night';

export function dayPhase(clock: number): DayPhase {
  const m = minuteOfDay(clock);
  const w = balance.time.workday;
  if (isWorkMinute(m)) return 'work';
  return m >= w.lunchStart && m < w.lunchEnd ? 'lunch' : 'night';
}

/** 次に人間が働き始めるまでの分（いま勤務時間なら 0） */
export function untilWork(clock: number): number {
  const m = minuteOfDay(clock);
  const w = balance.time.workday;
  if (isWorkMinute(m)) return 0;
  if (m < w.start) return w.start - m;
  if (m < w.lunchEnd && m >= w.lunchStart) return w.lunchEnd - m;
  return DAY - m + w.start;
}
