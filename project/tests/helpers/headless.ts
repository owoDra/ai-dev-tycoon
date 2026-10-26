import { type Command, reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { defaultSystems, type System } from '../../src/core/system';

export interface TimedCommand {
  /** 適用するゲーム内時刻（分）。同時刻の Command は配列の順に適用する */
  readonly at: number;
  readonly command: Command;
}

export interface HeadlessOptions {
  readonly seed: string;
  readonly commands?: readonly TimedCommand[];
  /** このゲーム内時刻（分）まで進める */
  readonly until: number;
  /** 既定は core の defaultSystems */
  readonly systems?: readonly System[];
  /** 始める state。既定は createInitialState(seed) */
  readonly initial?: GameState;
}

export interface HeadlessResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/**
 * 画面なしでゲームを進める。Command は指定時刻に到達した時点で適用する。
 * 一時停止したままだと時計が進まないため、その時点で打ち切る。
 */
export function runHeadless({
  seed,
  commands = [],
  until,
  systems = defaultSystems,
  initial,
}: HeadlessOptions): HeadlessResult {
  const queue = commands.map((c, i) => ({ ...c, i })).sort((a, b) => a.at - b.at || a.i - b.i);
  let state = initial ?? createInitialState(seed);
  const events: GameEvent[] = [];
  let q = 0;

  while (true) {
    for (let c = queue[q]; c !== undefined && c.at <= state.clock; c = queue[++q]) {
      const r = reduce(state, c.command);
      state = r.state;
      events.push(...r.events);
    }
    if (state.clock >= until || state.paused) break;
    const nextAt = queue[q]?.at ?? until;
    const r = step(state, Math.min(nextAt, until) - state.clock, systems);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}
