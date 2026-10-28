import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/core/commands';
import { createInitialState } from '../../src/core/state';
import { defaultSystems, type System } from '../../src/core/system';
import { runHeadless, type TimedCommand } from '../helpers/headless';

/** 乱数で出来事を予約するテスト用システム（ゲーム内容の先取りではなく、乱数の再現性を見るため） */
const randomScheduler: System = (state, ctx) => {
  if (!ctx.rng.chance(0.1)) return state;
  const delay = ctx.rng.int(1, 30);
  const rank = ctx.rng.pick([1, 3, 10] as const);
  return {
    ...state,
    pendingEvents: [...state.pendingEvents, { at: state.clock + delay, event: { type: 'CompanyRanked', rank } }],
  };
};

const systems = [randomScheduler, ...defaultSystems];

const P = 'ecRenewal';
const founder = (i: number) => Object.keys(createInitialState('s').team)[i] ?? '';
const assign = (workerId: string): Command => ({
  type: 'AssignTask',
  projectId: P,
  taskId: 'hearing',
  mode: 'human',
  workerId,
});

const commands: TimedCommand[] = [
  { at: 10, command: { type: 'StartProject', projectId: P } },
  { at: 60, command: assign(founder(0)) },
  { at: 60, command: assign(founder(1)) },
  { at: 300, command: { type: 'SeeFeatures', features: [] } },
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
    expect(state.clock).toBe(1_000);
    const run = state.projects[P];
    expect(run?.startedAt).toBe(10);
    // 同時刻の担当は、後に適用した方が残る
    expect(run?.tasks.hearing?.assignment).toEqual({ mode: 'human', workerId: founder(1) });
    expect(events).toContainEqual({ type: 'TaskStarted', projectId: P, taskId: 'hearing', mode: 'human' });
  });
});
