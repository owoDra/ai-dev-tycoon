import { balance } from '../content/balance';
import type { Transition } from './commands';
import type { GameEvent } from './events';
import { createRngCursor } from './rng';
import type { GameState } from './state';
import { defaultSystems, type System } from './system';

/** 実時間（秒）を、その速度でのゲーム内の分に換算する */
export function toGameMinutes(realSeconds: number, speed: number): number {
  return realSeconds * balance.time.minutesPerRealSecond * speed;
}

/**
 * ゲーム内時間を dtMinutes だけ進める。
 * 固定幅 `tickMinutes` ごとに時計を進めてシステムを順に適用し、端数は carryMinutes に持ち越す。
 * そのため dt をどう分割して渡しても、合計が同じなら結果は同じになる。一時停止中は何もしない。
 */
export function step(state: GameState, dtMinutes: number, systems: readonly System[] = defaultSystems): Transition {
  if (state.paused || !(dtMinutes > 0)) return { state, events: [] };
  const tick = balance.time.tickMinutes;
  const events: GameEvent[] = [];
  const rng = createRngCursor(state.rng);
  const ctx = { rng, emit: (e: GameEvent) => events.push(e) };

  let s = state;
  let carry = state.carryMinutes + dtMinutes;
  while (carry >= tick) {
    carry -= tick;
    s = { ...s, clock: s.clock + tick };
    for (const system of systems) s = system(s, ctx);
  }
  return { state: { ...s, rng: rng.state, carryMinutes: carry }, events };
}
