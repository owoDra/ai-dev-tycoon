import { balance } from '../content/balance';
import { uiLayout } from '../content/look/layout';
import type { GameStore } from './store';

/** 1フレームで進める実時間の上限（秒）。復帰直後やカクつきで一度に大量のステップを回さないため */
const MAX_FRAME_SECONDS = 0.25;
const MS = 1000;

/**
 * requestAnimationFrame でゲームループを回す。時間はプレイヤーが「次の日へ」を押したときだけ進む（store.run）。
 * 進めている日は、1日を uiLayout.flow.dayMs（まとめ送りでは skipDayMs）の実時間で見せながら store.advance で進める。
 * 描画には次のステップまでの補間係数 alpha（0〜1）を渡す。
 * タブが非表示の間は次のフレームを要求しない。held が true の間（結果画面・決算・案件ボードなどを見ている間）は進めない。
 * 戻り値でループを止める。
 */
export function startLoop(
  store: GameStore,
  render: (alpha: number) => void = () => {},
  held: () => boolean = () => false,
): () => void {
  let frame = 0;
  let last: number | undefined;

  const tick = (now: number) => {
    frame = 0;
    // 進める途中で例外が出ても、次のフレームは必ず予約する（ループが止まると画面全体が固まって見える）
    try {
      const dtSeconds = last === undefined ? 0 : Math.min((now - last) / MS, MAX_FRAME_SECONDS);
      last = now;
      const run = store.run();
      if (run && !held()) {
        const dayMs = run.untilDecision ? uiLayout.flow.skipDayMs : uiLayout.flow.dayMs;
        store.advance((dtSeconds * MS * balance.time.minutesPerDay) / dayMs);
      }
      render(store.state().carryMinutes / balance.time.tickMinutes);
    } finally {
      frame = requestAnimationFrame(tick);
    }
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

  document.addEventListener('visibilitychange', onVisibilityChange);
  resume();

  return () => {
    suspend();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
