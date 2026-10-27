import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startLoop } from '../../src/app/loop';
import { createGameStore } from '../../src/app/store';
import { createInitialState } from '../../src/core/state';

/** requestAnimationFrame を手で進められるようにした偽物 */
function fakeFrames() {
  let queue: { id: number; cb: FrameRequestCallback }[] = [];
  let next = 1;
  let now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.push({ id: next, cb });
    return next++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    queue = queue.filter((f) => f.id !== id);
  });
  vi.stubGlobal('document', { hidden: false, addEventListener() {}, removeEventListener() {} });
  return {
    pending: () => queue.length,
    /** 予約されたフレームを1回分実行する */
    step(ms = 100) {
      now += ms;
      const current = queue;
      queue = [];
      for (const f of current) f.cb(now);
    },
  };
}

describe('startLoop', () => {
  let frames: ReturnType<typeof fakeFrames>;
  beforeEach(() => {
    frames = fakeFrames();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('held の間（結果画面や設定を見ている間）は時間を進めず、一時停止の状態も変えない', () => {
    const store = createGameStore(createInitialState('loop-held'));
    let held = true;
    const stop = startLoop(store, undefined, undefined, () => held);
    frames.step();
    frames.step();
    const elapsed = () => store.state().clock + store.state().carryMinutes;
    expect(elapsed()).toBe(0);
    expect(store.state().paused).toBe(false);
    held = false;
    frames.step();
    expect(elapsed()).toBeGreaterThan(0);
    stop();
  });

  it('進行中はフレームを要求し続け、一時停止すると止まり、再開すると回り始める', () => {
    const store = createGameStore(createInitialState('loop'));
    const stop = startLoop(store);
    frames.step();
    frames.step();
    expect(frames.pending()).toBe(1);
    const elapsed = () => store.state().clock + store.state().carryMinutes;
    expect(elapsed()).toBeGreaterThan(0);

    store.dispatch({ type: 'TogglePause' });
    frames.step();
    expect(frames.pending()).toBe(0);
    const paused = elapsed();
    frames.step();
    expect(elapsed()).toBe(paused);

    store.dispatch({ type: 'TogglePause' });
    expect(frames.pending()).toBe(1);
    stop();
    expect(frames.pending()).toBe(0);
  });

  it('止める時刻を渡すと、その時刻を越えて進めず、ちょうどその時刻に届く', () => {
    const store = createGameStore(createInitialState('loop'));
    let limit: number | null = 3;
    const stop = startLoop(store, undefined, () => limit);
    for (let i = 0; i < 10; i++) frames.step(250);
    expect(store.state().clock).toBe(3);
    expect(store.state().carryMinutes).toBeLessThan(0.001);
    limit = null;
    for (let i = 0; i < 4; i++) frames.step(250);
    expect(store.state().clock).toBeGreaterThan(3);
    stop();
  });
});
