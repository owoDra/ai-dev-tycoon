import { describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import type { GameEvent } from '../../src/core/events';
import { createInitialState } from '../../src/core/state';

describe('createGameStore', () => {
  it('dispatch で Command を適用し、events を購読者に渡す', () => {
    const store = createGameStore(createInitialState('store'));
    const received: GameEvent[] = [];
    store.onEvents((events) => received.push(...events));
    store.dispatch({ type: 'SetSpeed', speed: 3 });
    store.dispatch({ type: 'TogglePause' });
    expect(store.state()).toMatchObject({ speed: 3, paused: true });
    expect(received).toEqual([
      { type: 'SpeedChanged', speed: 3 },
      { type: 'PauseToggled', paused: true },
    ]);
  });

  it('advance で時計が進み、一時停止中は進まない', () => {
    const store = createGameStore(createInitialState('store'));
    store.advance(15);
    expect(store.state().clock).toBe(15);
    store.dispatch({ type: 'TogglePause' });
    store.advance(15);
    expect(store.state().clock).toBe(15);
  });

  it('購読を解除すると events が届かなくなる', () => {
    const store = createGameStore(createInitialState('store'));
    let count = 0;
    const off = store.onEvents(() => count++);
    store.dispatch({ type: 'TogglePause' });
    off();
    store.dispatch({ type: 'TogglePause' });
    expect(count).toBe(1);
  });
});
