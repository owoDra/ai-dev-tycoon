import { balance } from '../content/balance';
import { toGameMinutes } from '../core/step';
import type { GameStore } from './store';

/** 1フレームで進める実時間の上限（秒）。復帰直後やカクつきで一度に大量のステップを回さないため */
const MAX_FRAME_SECONDS = 0.25;

/**
 * requestAnimationFrame でゲームループを回す。
 * 実時間を速度に応じたゲーム内の分に換算して store.advance に渡し、固定ステップの端数は core の
 * carryMinutes が持ち越す（アキュムレータ）。描画には次のステップまでの補間係数 alpha（0〜1）を渡す。
 * タブが非表示の間と、一時停止中は次のフレームを要求しない（ループが止まる）。再開すると回り始める。
 * 戻り値でループを止める。
 */
export function startLoop(store: GameStore, render: (alpha: number) => void = () => {}): () => void {
  let frame = 0;
  let last: number | undefined;

  const tick = (now: number) => {
    frame = 0;
    const dtSeconds = last === undefined ? 0 : Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    store.advance(toGameMinutes(dtSeconds, store.state().speed));
    render(store.state().carryMinutes / balance.time.tickMinutes);
    if (store.state().paused) {
      last = undefined;
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  const resume = () => {
    if (frame !== 0 || document.hidden) return;
    last = undefined;
    frame = requestAnimationFrame(tick);
  };
  const suspend = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const onVisibilityChange = () => (document.hidden ? suspend() : resume());
  const unsubscribe = store.onEvents((events) => {
    if (events.some((e) => e.type === 'PauseToggled' && !e.paused)) resume();
  });

  document.addEventListener('visibilitychange', onVisibilityChange);
  resume();

  return () => {
    suspend();
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
