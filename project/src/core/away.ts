import { balance } from '../content/balance';
import { activeProjects, pendingBids } from './board';
import { businessDay } from './clock';
import type { Transition } from './commands';
import type { GameEvent } from './events';
import { isBankrupt } from './funds';
import type { GameState } from './state';
import { awaitingAssignment, step, toGameMinutes } from './step';

/*
 * 隙間時間に少しずつ遊ぶための区切り（営業日の終わり）と、閉じている間の進行。
 * どちらも時間を進めるだけで、プレイヤーの判断（担当・Harness・Seat）は代わりに行わない。
 */

/** 今の営業日が終わるゲーム内時刻（分）。ちょうど営業日の境目にいれば、次の営業日の終わり */
export function dayEnd(clock: number): number {
  return (businessDay(clock) + 1) * balance.time.minutesPerDay;
}

/** 区切りと閉じている間の進行の対象か。案件ボードのある会社で、チュートリアルを終えていて、進行中の案件か結果待ちの見積がある */
export function runsUnattended(state: GameState): boolean {
  return (
    state.board !== null &&
    state.tutorial === null &&
    (activeProjects(state).length > 0 || pendingBids(state).length > 0)
  );
}

/** 閉じていた実時間（秒）のうち、再開時に進めるゲーム内の分。その営業日の終わりまで */
export function awayMinutes(state: GameState, awaySeconds: number): number {
  if (!runsUnattended(state) || !(awaySeconds > 0)) return 0;
  const untilDayEnd = dayEnd(state.clock) - state.clock - state.carryMinutes;
  return Math.max(0, Math.min(toGameMinutes(awaySeconds, balance.away.speed), untilDayEnd));
}

/**
 * 閉じていた間の進行を適用する。一時停止していても進め、一時停止の状態は元に戻す。
 * 営業日の終わりまで進めるときは、端数の持ち越しを捨ててちょうど境目で止める。
 * 担当待ちの案件ができたとき（core/step.ts の awaitingAssignment）と、見積を出していない引き合いの締切が近づいたとき（awayLimit）は、
 * そこで止める（プレイヤーのいない間に、納期だけが減ったり引き合いを見送ったりしない）
 */
export function catchUp(state: GameState, awaySeconds: number): Transition {
  const minutes = awayMinutes(state, awaySeconds);
  if (minutes <= 0) return { state, events: [] };
  const end = dayEnd(state.clock);
  const toEnd = minutes >= end - state.clock - state.carryMinutes;
  const limit = awayLimit(state);
  const tick = balance.time.tickMinutes;
  let s: GameState = { ...state, paused: false, carryMinutes: toEnd ? 0 : state.carryMinutes };
  let left = toEnd ? end - state.clock : minutes;
  const events: GameEvent[] = [];
  // 1ステップずつ進め、プレイヤーの判断が要る状態になったらそこで止める（step は分割しても結果が同じ）
  while (left > 0 && s.clock < limit && !awaitingAssignment(s) && !isBankrupt(s)) {
    const dt = Math.min(left, tick);
    const r = step(s, dt);
    s = r.state;
    events.push(...r.events);
    left -= dt;
  }
  return { state: { ...s, paused: state.paused }, events };
}

/**
 * 閉じている間の進行で越えない時刻。見積を出していない引き合いは、締切まで balance.board.minOpenMinutes を残して止める
 * （戻ったプレイヤーが見積を出せるように）。なければ制限しない
 */
export function awayLimit(state: GameState): number {
  const closes = (state.board?.inquiries ?? []).filter((i) => i.bid === null).map((i) => i.closesAt);
  return Math.min(Number.POSITIVE_INFINITY, ...closes.map((c) => c - balance.board.minOpenMinutes));
}
