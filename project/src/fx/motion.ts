import { animate } from 'motion';
import type { FeelPreset, FeelTransition } from '../content/look/feel';
import { visual } from '../content/look/visual';
import { EASE_IN_OUT_BEZIER, EASE_OUT_BEZIER, popBezier } from '../styles/tokens';
import { feel } from './feel';
import { reducedMotion } from './reduced';

/**
 * UI のモーション。spring・ポップの形は手触りのプリセット（content/look/feel.ts のモーションの性格）、イージングと長さはデザイントークン
 * （styles/tokens.ts・content/look/visual.ts）から読み、CSS のトランジションと同じ曲線で動かす。
 * どの関数も要素を押せないようにはしない（操作はブロックしない）。reduced-motion ではフェードか即時切り替えにする。
 */

const MS = 1000;
/** 出現するときにずらす距離（px） */
const OFFSET = 16;
/** pop の膨らみ（大きさの倍率に掛ける）。膨らみ方のイージングはモーションの性格から読む */
const POP_PEAK = 0.18;
/** shake の往復の回数 */
const SHAKE_SWINGS = 4;

export const ease = {
  pop: popBezier(visual),
  out: [...EASE_OUT_BEZIER] as [number, number, number, number],
  inOut: [...EASE_IN_OUT_BEZIER] as [number, number, number, number],
};

/** モーションの性格の動き方を、motion の animate() の options にする */
export function transitionOptions(t: FeelTransition) {
  return t.type === 'spring'
    ? { type: 'spring' as const, stiffness: t.stiffness, damping: t.damping, mass: t.mass }
    : { duration: t.durationMs / MS, ease: t.ease };
}

/** いまの手触りの動き方（spring か tween） */
export function transition(preset: FeelPreset = feel()) {
  return transitionOptions(preset.motion.transition);
}

/** 動きを減らす設定か（設定画面と OS の設定） */
export function prefersReducedMotion(): boolean {
  return reducedMotion();
}

/** Web Animations が使えるか（テストの jsdom では使えないので、即時切り替えにする） */
function canAnimate(el: Element): el is HTMLElement {
  return typeof (el as HTMLElement).animate === 'function';
}

/** 数値のアニメーションを回せるか（ブラウザの描画ループがある環境。jsdom では Web Animations がないので即時にする） */
function canTween(): boolean {
  return (
    typeof requestAnimationFrame === 'function' &&
    typeof document !== 'undefined' &&
    typeof document.documentElement?.animate === 'function'
  );
}

/**
 * 画面やパネルの出現。要素は最初から押せる。動きを減らす設定ではフェードだけにする
 */
export function enter(el: HTMLElement, from: 'below' | 'above' | 'none' = 'below'): void {
  if (!canAnimate(el)) return;
  const offset = from === 'below' ? OFFSET : -OFFSET;
  const reduced = prefersReducedMotion() || from === 'none';
  animate(el, reduced ? { opacity: [0, 1] } : { opacity: [0, 1], y: [offset, 0] }, {
    duration: visual.motion.baseDuration / MS,
    ease: ease.out,
  });
}

/**
 * 退場。終わったら解決する。退場中の要素はクリックを素通りさせ、後ろの操作を妨げない。
 * アニメーションできない環境では null を返す（呼び出し側はすぐに取り除く）
 */
export function exit(el: HTMLElement, to: 'below' | 'above' | 'none' = 'below'): Promise<void> | null {
  if (!canAnimate(el)) return null;
  el.style.pointerEvents = 'none';
  const offset = to === 'below' ? OFFSET : -OFFSET;
  const reduced = prefersReducedMotion() || to === 'none';
  const controls = animate(el, reduced ? { opacity: [1, 0] } : { opacity: [1, 0], y: [0, offset] }, {
    duration: visual.motion.fastDuration / MS,
    ease: ease.inOut,
  });
  return controls.then(() => undefined);
}

/**
 * 数字のカウントアップ。from から to まで、format した文字を el に書き込む。戻り値で止める。
 * 動きを減らす設定では、すぐに to を書く
 */
export function countUp(
  el: HTMLElement,
  from: number,
  to: number,
  format: (value: number) => string = (v) => String(Math.round(v)),
  durationMs: number = feel().countUpMs,
): () => void {
  return tween(from, to, (v) => (el.textContent = format(v)), durationMs);
}

/** 数値を from から to へ動かし、途中の値を onUpdate に渡す（countUp と morph の共通部分） */
export function tween(
  from: number,
  to: number,
  onUpdate: (value: number) => void,
  durationMs: number = feel().countUpMs,
): () => void {
  if (from === to || prefersReducedMotion() || !canTween()) {
    onUpdate(to);
    return () => {};
  }
  const controls = animate(from, to, { duration: durationMs / MS, ease: ease.out, onUpdate });
  return () => controls.stop();
}

/** ぽんと弾ませる（強調）。動きを減らす設定では、少し薄くしてから戻す */
export function pop(el: HTMLElement, strength = 1): void {
  if (!canAnimate(el)) return;
  if (prefersReducedMotion()) {
    animate(el, { opacity: [0.6, 1] }, { duration: visual.motion.fastDuration / MS });
    return;
  }
  const peak = 1 + POP_PEAK * strength;
  animate(el, { scale: [1, peak, 1] }, { duration: visual.motion.popDuration / MS, ease: feel().motion.pop.ease });
}

/** 横に揺らす（失敗・警告）。動きを減らす設定では揺らさない */
export function shake(el: HTMLElement, px = 6): void {
  if (!canAnimate(el) || prefersReducedMotion()) return;
  const xs = [0];
  for (let i = 0; i < SHAKE_SWINGS; i++) xs.push(i % 2 === 0 ? px : -px, 0);
  animate(el, { x: xs }, { duration: visual.motion.slowDuration / MS, ease: 'easeOut' });
}

/**
 * Before → After の変形。数字や棒の長さを before から after へモーションの性格の動き方で動かし、途中の値を onUpdate に渡す。
 * 長さが違う配列は短い方に合わせる。戻り値で止める
 */
export function morph(
  before: readonly number[],
  after: readonly number[],
  onUpdate: (values: number[]) => void,
): () => void {
  const n = Math.min(before.length, after.length);
  const at = (t: number) =>
    Array.from({ length: n }, (_, i) => (before[i] ?? 0) + ((after[i] ?? 0) - (before[i] ?? 0)) * t);
  if (prefersReducedMotion() || !canTween()) {
    onUpdate(at(1));
    return () => {};
  }
  const controls = animate(0, 1, { ...transition(), onUpdate: (t) => onUpdate(at(t)) });
  return () => controls.stop();
}
