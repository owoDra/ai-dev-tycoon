import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { reduce } from '../../src/core/commands';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import type { System } from '../../src/core/system';

/** 乱数を使い、ステップ回数に依存するテスト用システム */
const rollDice: System = (state, ctx) => ({
  ...state,
  pendingEvents:
    ctx.rng.chance(0.5) && state.clock % 7 === 0
      ? [...state.pendingEvents, { at: state.clock, event: { type: 'CompanyRanked', rank: 1 } }]
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

  it('進める時間が 0 以下なら進めない（同じ state を返す）', () => {
    const initial = createInitialState('p');
    for (const dt of [0, -5, Number.NaN]) {
      const r = step(initial, dt, [rollDice]);
      expect(r.state).toBe(initial);
      expect(r.events).toEqual([]);
    }
    expect(step(initial, 10).state.clock).toBe(10);
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
        { at: 5, event: { type: 'CompanyRanked', rank: 1 } },
        { at: 20, event: { type: 'CompanyRanked', rank: 3 } },
      ],
    };
    const first = step(initial, 10);
    expect(first.events).toEqual([{ type: 'CompanyRanked', rank: 1 }]);
    expect(first.state.pendingEvents).toEqual([{ at: 20, event: { type: 'CompanyRanked', rank: 3 } }]);
    expect(step(first.state, 10).events).toEqual([{ type: 'CompanyRanked', rank: 3 }]);
  });

  it('入力の state を書き換えない', () => {
    const initial = createInitialState('immutable');
    const snapshot = structuredClone(initial);
    step(initial, 50, [rollDice]);
    expect(initial).toEqual(snapshot);
  });
});

describe('reduce', () => {
  it('状態を変えない Command は、同じ state を返して events も出さない（適用後の判定も走らない）', () => {
    const initial = createInitialState('c', { board: true, tutorial: false });
    expect(reduce(initial, { type: 'SeeFeatures', features: [] })).toEqual({ state: initial, events: [] });
    expect(initial.board?.inquiries).toEqual([]);
  });
});
