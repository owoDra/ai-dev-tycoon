import { animate, type MotionValue, motionValue } from 'motion';
import type { FeelSpring } from '../../content/look/feel';

/**
 * 島のスカッシュ＆ストレッチと持ち上げ。値は motion の animate() で動かし（UI のモーションと同じ spring とイージング）、
 * world が毎フレーム読んで島の scale と高さに掛ける。体積が変わって見えないよう、縦に縮んだら横に広げる。
 */

/** 弾みの深さ（縦に縮む割合）の基準 */
const SQUASH = 0.2;
/** 弾み1回の長さ（秒） */
const BOUNCE_SECONDS = 0.5;

interface Entry {
  sy: MotionValue<number>;
  lift: MotionValue<number>;
}

export interface Squash {
  /** 縦に潰れてから伸びて戻る。strength は演出の強さ（1 で基準） */
  bounce(id: string, strength: number): void;
  /** 選んだ島だけを持ち上げ、ほかを下ろす（null ですべて下ろす） */
  liftOnly(id: string | null, height: number, spring: FeelSpring): void;
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
    bounce(id, strength) {
      const e = entry(id);
      const d = SQUASH * Math.min(2, strength);
      track(
        e.sy,
        animate(e.sy, [1, 1 - d, 1 + d * 0.7, 1 - d * 0.2, 1], {
          duration: BOUNCE_SECONDS * Math.sqrt(strength),
          ease: 'easeOut',
        }),
      );
    },
    liftOnly(id, height, spring) {
      const opts = { type: 'spring' as const, ...spring };
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
