import { describe, expect, it } from 'vitest';
import { deserialize, type Migration, OutdatedSaveError, SAVE_VERSION, serialize } from '../../src/core/serialize';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import type { System } from '../../src/core/system';
import { runHeadless } from '../helpers/headless';

describe('serialize', () => {
  it('保存して復元すると等価になる', () => {
    const { state } = runHeadless({
      seed: 'save',
      commands: [{ at: 3, command: { type: 'StartProject', projectId: 'ecRenewal' } }],
      until: 90,
    });
    const withPending: GameState = {
      ...state,
      carryMinutes: 0.5,
      pendingEvents: [{ at: 120, event: { type: 'FiscalClosed', no: 1 } }],
    };
    expect(deserialize(serialize(withPending))).toEqual(withPending);
  });

  it('復元した state から続きを進めると、保存しなかった場合と同じ結果になる', () => {
    const { state } = runHeadless({ seed: 'resume', until: 250 });
    const draw: System = (s, ctx) => (ctx.rng.chance(0.3) ? { ...s, entities: {} } : s);
    expect(step(deserialize(serialize(state)), 250.5, [draw])).toEqual(step(state, 250.5, [draw]));
  });

  it('1日が勤務時間だけ（480分）だった時計のセーブ（v13）は、時刻がずれるので読み込まない', () => {
    const state = createInitialState('v13');
    expect(() => deserialize(JSON.stringify({ saveVersion: 13, state }))).toThrow(OutdatedSaveError);
  });

  it('保存データに saveVersion が付く', () => {
    expect(JSON.parse(serialize(createInitialState('v')))).toMatchObject({ saveVersion: SAVE_VERSION });
  });

  it('旧バージョンのデータがマイグレーションで現在の形に変換される', () => {
    // v1: 時計を「時間」単位で持っていた / v2: carryMinutes がなかった、という架空の履歴
    const migrations: Migration[] = [
      {
        from: 1,
        migrate: (s) => {
          const { hours, ...rest } = s as { hours: number };
          return { ...rest, clock: hours * 60 };
        },
      },
      { from: 2, migrate: (s) => ({ ...(s as object), carryMinutes: 0 }) },
    ];
    const current = createInitialState('old');
    const { clock: _, carryMinutes: __, ...v1State } = current;
    const v1 = JSON.stringify({ saveVersion: 1, state: { ...v1State, hours: 2 } });
    expect(deserialize(v1, migrations, 3)).toEqual({ ...current, clock: 120, carryMinutes: 0 });
  });

  it('マイグレーションが欠けている・未来のバージョン・壊れたデータは例外にする', () => {
    const state = createInitialState('x');
    expect(() => deserialize(JSON.stringify({ saveVersion: 1, state }), [], 2)).toThrow(/マイグレーション/);
    expect(() => deserialize(JSON.stringify({ saveVersion: SAVE_VERSION + 1, state }))).toThrow(/バージョン/);
    expect(() => deserialize(JSON.stringify({ state }))).toThrow();
    expect(() => deserialize(JSON.stringify({ saveVersion: SAVE_VERSION, state: { seed: 'x' } }))).toThrow();
    expect(() => deserialize('{')).toThrow();
  });

  it('state は JSON で往復しても変わらない値だけを持つ', () => {
    const { state } = runHeadless({ seed: 'json', until: 200 });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
