import { animate } from 'motion';
import { visual } from '../content/look/visual';

/** 動きを減らす設定か（matchMedia がない環境では false） */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const MS = 1000;
/** 出現するときにずらす距離（px） */
const OFFSET = 16;

/**
 * 画面やパネルの出現。操作はブロックしない（要素は最初から押せる）。
 * 動きを減らす設定ではフェードだけにする。演出の本格的な強化は Phase 07 で行う
 */
export function enter(el: HTMLElement, from: 'below' | 'above' | 'none' = 'below'): void {
  if (typeof el.animate !== 'function') return;
  const offset = from === 'below' ? OFFSET : -OFFSET;
  const reduced = prefersReducedMotion() || from === 'none';
  animate(el, reduced ? { opacity: [0, 1] } : { opacity: [0, 1], y: [offset, 0] }, {
    duration: visual.motion.baseDuration / MS,
    ease: EASE_OUT,
  });
}
