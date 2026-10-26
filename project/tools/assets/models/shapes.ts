import {
  type BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AmbientOcclusion } from './build';

/** モデルを組み立てる基本形。すべて (x, y, z) は形の中心 */

export function box(w: number, h: number, d: number, radius: number, x: number, y: number, z: number): BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, 2, radius).translate(x, y, z);
}

export function sphere(r: number, x: number, y: number, z: number, scaleY = 1, segments = 16): BufferGeometry {
  return new SphereGeometry(r, segments, Math.round(segments * 0.75)).scale(1, scaleY, 1).translate(x, y, z);
}

/** 上半分の半球（帽子のクラウンなど） */
export function dome(r: number, x: number, y: number, z: number): BufferGeometry {
  return new SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, y, z);
}

/** 縦向きのカプセル。length は円柱部分の長さ */
export function capsule(r: number, length: number, x: number, y: number, z: number): BufferGeometry {
  return new CapsuleGeometry(r, length, 6, 16).translate(x, y, z);
}

export function cylinder(rTop: number, rBottom: number, h: number, x: number, y: number, z: number, seg = 16) {
  return new CylinderGeometry(rTop, rBottom, h, seg).translate(x, y, z);
}

export function cone(r: number, h: number, x: number, y: number, z: number, seg = 16): BufferGeometry {
  return new ConeGeometry(r, h, seg).translate(x, y, z);
}

/** XY 平面の輪（+Z を向く）。arc を π にすると上半分のアーチ */
export function ring(r: number, tube: number, x: number, y: number, z: number, arc = Math.PI * 2): BufferGeometry {
  return new TorusGeometry(r, tube, 8, 20, arc).translate(x, y, z);
}

/** 床の近くと下を向いた面を暗くする簡易 AO（キャラクターと小物の共通） */
export const groundAo: AmbientOcclusion = (p, n) => {
  let k = 1 - 0.28 * Math.exp(-p.y / 0.1);
  if (n.y < 0) k -= 0.18 * -n.y;
  return Math.min(1, Math.max(0.5, k));
};
