import { animate, type MotionValue, motionValue } from 'motion';
import type { FeelMotion, FeelTransition } from '../../content/look/feel';
import { transitionOptions } from '../../fx/motion';

/**
 * 島のスカッシュ＆ストレッチと持ち上げ。値は motion の animate() で動かし（UI と同じモーションの性格）、
 * world が毎フレーム読んで島の scale と高さに掛ける。体積が変わって見えないよう、縦に縮んだら横に広げる。
 */

/** 弾みの深さ（縦に縮む割合）の基準 */
const SQUASH = 0.2;
/** 揺り返しのたびに振れ幅が減る割合 */
const WOBBLE_DECAY = 0.45;

/**
 * 弾みのキーフレーム（縦の倍率）。depth だけ潰れた後、overshoot の割合で伸び、
 * 揺り返すたびに振れ幅を WOBBLE_DECAY 倍にして wobbles 回揺れてから 1 に戻る
 */
export function bounceKeyframes(depth: number, bounce: FeelMotion['bounce']): number[] {
  const keys = [1, 1 - depth];
  for (let i = 0; i < bounce.wobbles; i++) {
    const sign = i % 2 === 0 ? 1 : -1;
    keys.push(1 + sign * depth * bounce.overshoot * WOBBLE_DECAY ** i);
  }
  keys.push(1);
  return keys;
}

interface Entry {
  sy: MotionValue<number>;
  lift: MotionValue<number>;
}

export interface Squash {
  /** 縦に潰れてから伸びて戻る。strength は演出の強さ（1 で基準）、揺れ方はモーションの性格 */
  bounce(id: string, strength: number, motion: FeelMotion): void;
  /** 選んだ島だけを持ち上げ、ほかを下ろす（null ですべて下ろす） */
  liftOnly(id: string | null, height: number, transition: FeelTransition): void;
  /** 島の scale（横・縦）と持ち上げる高さ */
  get(id: string): { sx: number; sy: number; lift: number };
  /** 動いている値があるか */
  active(): boolean;
  dispose(): void;
}

export function createSquash(onChange: () => void): Squash {
  const entries = new Map<string, Entry>();
  const running = new Set<MotionValue<number>>();

  const entry = (id: string): Entry => {
    let e = entries.get(id);
    if (!e) {
      e = { sy: motionValue(1), lift: motionValue(0) };
      e.sy.on('change', onChange);
      e.lift.on('change', onChange);
      entries.set(id, e);
    }
    return e;
  };
  const track = (value: MotionValue<number>, controls: { then(onResolve: () => void): unknown }) => {
    running.add(value);
    onChange();
    controls.then(() => {
      running.delete(value);
      onChange();
    });
  };

  return {
    bounce(id, strength, motion) {
      const e = entry(id);
      const d = SQUASH * Math.min(2, strength);
      track(
        e.sy,
        animate(e.sy, bounceKeyframes(d, motion.bounce), {
          duration: motion.bounce.seconds * Math.sqrt(strength),
          ease: 'easeOut',
        }),
      );
    },
    liftOnly(id, height, transition) {
      const opts = transitionOptions(transition);
      for (const [key, e] of entries) {
        if (key !== id && e.lift.get() !== 0) track(e.lift, animate(e.lift, 0, opts));
      }
      if (id) {
        const e = entry(id);
        track(e.lift, animate(e.lift, height, opts));
      }
    },
    get(id) {
      const e = entries.get(id);
      if (!e) return { sx: 1, sy: 1, lift: 0 };
      const sy = e.sy.get();
      return { sx: 1 / Math.sqrt(Math.max(0.2, sy)), sy, lift: e.lift.get() };
    },
    active: () => running.size > 0,
    dispose() {
      for (const e of entries.values()) {
        e.sy.destroy();
        e.lift.destroy();
      }
      entries.clear();
    },
  };
}
