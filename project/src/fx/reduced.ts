import { createSignal } from 'solid-js';
import { settings } from '../app/settings';

const QUERY = '(prefers-reduced-motion: reduce)';

function systemPrefersReduced(): boolean {
  return typeof matchMedia === 'function' && matchMedia(QUERY).matches;
}

const [system, setSystem] = createSignal(systemPrefersReduced());
if (typeof matchMedia === 'function') {
  // OS の設定をプレイ中に変えても追従する
  matchMedia(QUERY).addEventListener?.('change', (e) => setSystem(e.matches));
}

/**
 * 動きを減らすか。設定画面の「動きを減らす」（OS に合わせる / 減らす / 減らさない）と
 * OS の prefers-reduced-motion から決める。Solid の中で読めば、切り替えたときに追従する
 */
export function reducedMotion(): boolean {
  const pref = settings().motion;
  return pref === 'reduce' || (pref === 'system' && system());
}
