import { balance } from '../content/balance';
import { untilWork } from '../core/clock';
import { awaitingAssignment, idleHours, playSpeed, toGameMinutes } from '../core/step';
import type { GameStore } from './store';

/** 1フレームで進める実時間の上限（秒）。復帰直後やカクつきで一度に大量のステップを回さないため */
const MAX_FRAME_SECONDS = 0.25;
/** 止める時刻にちょうど届かせるための上乗せ（ゲーム内の分）。浮動小数の誤差で境目の手前に残らないようにする */
const STOP_EPSILON = 1e-6;

/**
 * requestAnimationFrame でゲームループを回す。
 * 実時間を速度に応じたゲーム内の分に換算して store.advance に渡し（人間が帰っていて AI も働いていない間は始業まで早送りする。core/step.ts の playSpeed）、固定ステップの端数は core の
 * carryMinutes が持ち越す（アキュムレータ）。描画には次のステップまでの補間係数 alpha（0〜1）を渡す。
 * タブが非表示の間と、一時停止中は次のフレームを要求しない（ループが止まる）。再開すると回り始める。
 * stopAt を渡すと、そのゲーム内時刻（分）を越えて進めない（営業日の終わりの区切り。null なら制限しない）。
 * held が true の間（結果画面や設定を見ている間）と、担当が決まらず案件が1つも進められない間（core/step.ts の awaitingAssignment）は
 * 時間を進めない（state の一時停止は変えない）。
 * 戻り値でループを止める。
 */
export function startLoop(
  store: GameStore,
  render: (alpha: number) => void = () => {},
  stopAt: () => number | null = () => null,
  held: () => boolean = () => false,
): () => void {
  let frame = 0;
  let last: number | undefined;

  const tick = (now: number) => {
    frame = 0;
    const dtSeconds = last === undefined ? 0 : Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    const state = store.state();
    const dt = toGameMinutes(dtSeconds, playSpeed(state));
    const stop = stopAt();
    const { clock, carryMinutes } = state;
    // 早送りは始業までにとどめる（人間が働き始めたら選んだ速度に戻す）
    const wake = idleHours(state) ? clock + untilWork(clock) : null;
    const room = Math.min(stop ?? Number.POSITIVE_INFINITY, wake ?? Number.POSITIVE_INFINITY) - clock - carryMinutes;
    if (room > 0 && !held() && !awaitingAssignment(state)) store.advance(dt >= room ? room + STOP_EPSILON : dt);
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
