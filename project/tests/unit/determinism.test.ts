import { describe, expect, it } from 'vitest';
import { defaultSystems, type System } from '../../src/core/system';
import { runHeadless, type TimedCommand } from '../helpers/headless';

/** 乱数で出来事を予約するテスト用システム（ゲーム内容の先取りではなく、乱数の再現性を見るため） */
const randomScheduler: System = (state, ctx) => {
  if (!ctx.rng.chance(0.1)) return state;
  const delay = ctx.rng.int(1, 30);
  const speed = ctx.rng.pick([1, 2, 4] as const);
  return {
    ...state,
    pendingEvents: [...state.pendingEvents, { at: state.clock + delay, event: { type: 'SpeedChanged', speed } }],
  };
};

const systems = [randomScheduler, ...defaultSystems];

const commands: TimedCommand[] = [
  { at: 10, command: { type: 'SetSpeed', speed: 2 } },
  { at: 60, command: { type: 'TogglePause' } },
  { at: 60, command: { type: 'TogglePause' } },
  { at: 300, command: { type: 'SetSpeed', speed: 4 } },
];

describe('determinism', () => {
  it('同じ入力で runHeadless を2回実行すると state と events が完全に一致する', () => {
    const a = runHeadless({ seed: 'party-2026', commands, until: 1_440, systems });
    const b = runHeadless({ seed: 'party-2026', commands, until: 1_440, systems });
    expect(b.state).toEqual(a.state);
    expect(b.events).toEqual(a.events);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.state.clock).toBe(1_440);
    expect(a.events.length).toBeGreaterThan(commands.length);
  });

  it('seed が違えば結果が変わる', () => {
    const a = runHeadless({ seed: 'party-2026', commands, until: 1_440, systems });
    const b = runHeadless({ seed: 'party-2027', commands, until: 1_440, systems });
    expect(b.events).not.toEqual(a.events);
  });

  it('Command は指定時刻に、同時刻なら配列の順に適用される', () => {
    const { state, events } = runHeadless({ seed: 's', commands, until: 1_000 });
    expect(events).toEqual([
      { type: 'SpeedChanged', speed: 2 },
      { type: 'PauseToggled', paused: true },
      { type: 'PauseToggled', paused: false },
      { type: 'SpeedChanged', speed: 4 },
    ]);
    expect(state).toMatchObject({ clock: 1_000, speed: 4, paused: false });
  });

  it('一時停止したままなら、その時点で打ち切る', () => {
    const { state } = runHeadless({
      seed: 's',
      commands: [{ at: 45, command: { type: 'TogglePause' } }],
      until: 1_000,
    });
    expect(state).toMatchObject({ clock: 45, paused: true });
  });
});
