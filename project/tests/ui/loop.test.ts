import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startLoop } from '../../src/app/loop';
import { createGameStore } from '../../src/app/store';
import { balance } from '../../src/content/balance';
import { uiLayout } from '../../src/content/look/layout';
import { campaignInProgress } from '../helpers/session';

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

  it('進めている日がなければ、フレームは回り続けても時間は進まない', () => {
    const store = createGameStore(campaignInProgress());
    const stop = startLoop(store);
    frames.step();
    frames.step();
    expect(frames.pending()).toBe(1);
    expect(store.state().clock).toBe(0);
    stop();
    expect(frames.pending()).toBe(0);
  });

  it('次の日へ を押すと、1日を uiLayout.flow.dayMs の実時間で進め、次の始業ちょうどで止まる', () => {
    const store = createGameStore(campaignInProgress());
    const stop = startLoop(store);
    frames.step();
    store.play(false);
    const frameMs = 100;
    frames.step(frameMs);
    expect(store.state().clock + store.state().carryMinutes).toBeCloseTo(
      (balance.time.minutesPerDay * frameMs) / uiLayout.flow.dayMs,
    );
    for (let i = 0; i < uiLayout.flow.dayMs / frameMs + 5; i++) frames.step(frameMs);
    expect(store.run()).toBeNull();
    expect(store.state().clock).toBe(balance.time.minutesPerDay);
    // 止まった後もフレームは回り続ける（次に押したらすぐ動く）
    expect(frames.pending()).toBe(1);
    stop();
  });

  it('まとめ送りでは、1日を uiLayout.flow.skipDayMs の実時間で進める', () => {
    const store = createGameStore(campaignInProgress());
    const stop = startLoop(store);
    frames.step();
    store.play(true);
    frames.step(100);
    expect(store.state().clock + store.state().carryMinutes).toBeCloseTo(
      (balance.time.minutesPerDay * 100) / uiLayout.flow.skipDayMs,
    );
    stop();
  });

  it('held の間（結果画面・決算・納品を見ている間）は、進めている日があっても時間を進めない', () => {
    const store = createGameStore(campaignInProgress());
    let held = true;
    const stop = startLoop(store, undefined, () => held);
    frames.step();
    store.play(false);
    frames.step();
    frames.step();
    const elapsed = () => store.state().clock + store.state().carryMinutes;
    expect(elapsed()).toBe(0);
    expect(store.run()).not.toBeNull();
    held = false;
    frames.step();
    expect(elapsed()).toBeGreaterThan(0);
    stop();
  });

  it('描画や進行で例外が出ても、次のフレームを予約し続ける（ループが止まって画面が固まらない）', () => {
    const store = createGameStore(campaignInProgress());
    let fail = true;
    const stop = startLoop(store, () => {
      if (fail) throw new Error('描画の失敗');
    });
    expect(() => frames.step()).toThrow('描画の失敗');
    expect(frames.pending()).toBe(1);
    fail = false;
    frames.step();
    expect(frames.pending()).toBe(1);
    stop();
  });
});
