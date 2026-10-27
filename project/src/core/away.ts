import { balance } from '../content/balance';
import { activeProjects } from './campaign';
import type { Transition } from './commands';
import type { GameState } from './state';
import { step, toGameMinutes } from './step';
import { businessDay } from './team';

/*
 * 隙間時間に少しずつ遊ぶための区切り（営業日の終わり）と、閉じている間の進行。
 * どちらも時間を進めるだけで、プレイヤーの判断（担当・Harness・Seat）は代わりに行わない。
 */

/** 今の営業日が終わるゲーム内時刻（分）。ちょうど営業日の境目にいれば、次の営業日の終わり */
export function dayEnd(clock: number): number {
  return (businessDay(clock) + 1) * balance.project.minutesPerBusinessDay;
}

/** 区切りと閉じている間の進行の対象か。キャンペーンで、チュートリアルを終えていて、進行中の案件がある */
export function runsUnattended(state: GameState): boolean {
  return state.campaign !== null && state.tutorial === null && activeProjects(state).length > 0;
}

/** 閉じていた実時間（秒）のうち、再開時に進めるゲーム内の分。その営業日の終わりまで */
export function awayMinutes(state: GameState, awaySeconds: number): number {
  if (!runsUnattended(state) || !(awaySeconds > 0)) return 0;
  const untilDayEnd = dayEnd(state.clock) - state.clock - state.carryMinutes;
  return Math.max(0, Math.min(toGameMinutes(awaySeconds, balance.away.speed), untilDayEnd));
}

/**
 * 閉じていた間の進行を適用する。一時停止していても進め、一時停止の状態は元に戻す。
 * 営業日の終わりまで進めるときは、端数の持ち越しを捨ててちょうど境目で止める
 */
export function catchUp(state: GameState, awaySeconds: number): Transition {
  const minutes = awayMinutes(state, awaySeconds);
  if (minutes <= 0) return { state, events: [] };
  const end = dayEnd(state.clock);
  const toEnd = minutes >= end - state.clock - state.carryMinutes;
  const from = { ...state, paused: false, carryMinutes: toEnd ? 0 : state.carryMinutes };
  const { state: next, events } = step(from, toEnd ? end - state.clock : minutes);
  return { state: { ...next, paused: state.paused }, events };
}
