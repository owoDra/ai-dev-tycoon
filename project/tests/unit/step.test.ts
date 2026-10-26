import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { reduce } from '../../src/core/commands';
import { createInitialState, type GameState } from '../../src/core/state';
import { step, toGameMinutes } from '../../src/core/step';
import type { System } from '../../src/core/system';

/** 乱数を使い、ステップ回数に依存するテスト用システム */
const rollDice: System = (state, ctx) => ({
  ...state,
  pendingEvents:
    ctx.rng.chance(0.5) && state.clock % 7 === 0
      ? [...state.pendingEvents, { at: state.clock, event: { type: 'PauseToggled', paused: false } }]
      : state.pendingEvents,
});

function advance(state: GameState, dts: readonly number[], systems?: readonly System[]) {
  let s = state;
  const events = [];
  for (const dt of dts) {
    const r = step(s, dt, systems);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

describe('step', () => {
  it('ゲーム内時計が dt だけ進む', () => {
    const { state } = step(createInitialState('s'), 30);
    expect(state.clock).toBe(30);
    expect(state.carryMinutes).toBe(0);
  });

  it('dt を分割して進めても一括で進めても結果が同じ', () => {
    const initial = createInitialState('split');
    const systems = [rollDice];
    const whole = advance(initial, [120], systems);
    const split = advance(initial, [0.25, 0.5, 0.25, 7, 32.5, 0.125, 0.375, 79], systems);
    expect(split.state).toEqual(whole.state);
    expect(split.events).toEqual(whole.events);
    expect(whole.state.clock).toBe(120);
  });

  it('固定ステップに満たない端数は carryMinutes に持ち越す', () => {
    const tick = balance.time.tickMinutes;
    const { state } = step(createInitialState('carry'), tick * 2.5);
    expect(state.clock).toBe(tick * 2);
    expect(state.carryMinutes).toBeCloseTo(tick * 0.5);
  });

  it('一時停止中は進まない', () => {
    const paused = reduce(createInitialState('p'), { type: 'TogglePause' }).state;
    const r = step(paused, 60, [rollDice]);
    expect(r.state).toBe(paused);
    expect(r.events).toEqual([]);
  });

  it('再開すると再び進む', () => {
    const paused = reduce(createInitialState('p'), { type: 'TogglePause' }).state;
    const resumed = reduce(paused, { type: 'TogglePause' }).state;
    expect(step(resumed, 10).state.clock).toBe(10);
  });

  it('システムは固定ステップごとに配列の順に適用される', () => {
    const log: string[] = [];
    const a: System = (s) => {
      log.push(`a${s.clock}`);
      return s;
    };
    const b: System = (s) => {
      log.push(`b${s.clock}`);
      return s;
    };
    step(createInitialState('order'), 3, [a, b]);
    expect(log).toEqual(['a1', 'b1', 'a2', 'b2', 'a3', 'b3']);
  });

  it('システムが引いた乱数の状態が state.rng に書き戻される', () => {
    const initial = createInitialState('rng');
    const draw: System = (s, ctx) => {
      ctx.rng.next();
      return s;
    };
    expect(step(initial, 1, [draw]).state.rng).not.toBe(initial.rng);
    expect(step(initial, 1, []).state.rng).toBe(initial.rng);
  });

  it('予約済みの出来事は発火時刻に出力され、待ち行列から消える', () => {
    const initial: GameState = {
      ...createInitialState('scheduled'),
      pendingEvents: [
        { at: 5, event: { type: 'PauseToggled', paused: true } },
        { at: 20, event: { type: 'SpeedChanged', speed: 2 } },
      ],
    };
    const first = step(initial, 10);
    expect(first.events).toEqual([{ type: 'PauseToggled', paused: true }]);
    expect(first.state.pendingEvents).toEqual([{ at: 20, event: { type: 'SpeedChanged', speed: 2 } }]);
    expect(step(first.state, 10).events).toEqual([{ type: 'SpeedChanged', speed: 2 }]);
  });

  it('入力の state を書き換えない', () => {
    const initial = createInitialState('immutable');
    const snapshot = structuredClone(initial);
    step(initial, 50, [rollDice]);
    expect(initial).toEqual(snapshot);
  });

  it('実時間は minutesPerRealSecond と速度でゲーム内の分に換算される', () => {
    expect(toGameMinutes(1, 1)).toBe(balance.time.minutesPerRealSecond);
    expect(toGameMinutes(1.5, 4)).toBe(balance.time.minutesPerRealSecond * 6);
  });
});

describe('reduce', () => {
  it('SetSpeed で速度が変わり SpeedChanged を出す', () => {
    const r = reduce(createInitialState('c'), { type: 'SetSpeed', speed: 4 });
    expect(r.state.speed).toBe(4);
    expect(r.events).toEqual([{ type: 'SpeedChanged', speed: 4 }]);
  });

  it('同じ速度や選択肢にない速度は無視する', () => {
    const initial = createInitialState('c');
    expect(reduce(initial, { type: 'SetSpeed', speed: initial.speed })).toEqual({ state: initial, events: [] });
    // @ts-expect-error 型の上でも選択肢にない速度は渡せない
    expect(reduce(initial, { type: 'SetSpeed', speed: 3 })).toEqual({ state: initial, events: [] });
  });

  it('TogglePause で一時停止と再開が切り替わる', () => {
    const r1 = reduce(createInitialState('c'), { type: 'TogglePause' });
    expect(r1.state.paused).toBe(true);
    expect(r1.events).toEqual([{ type: 'PauseToggled', paused: true }]);
    expect(reduce(r1.state, { type: 'TogglePause' }).state.paused).toBe(false);
  });
});
