import { type BufferGeometry, CylinderGeometry, Group, TorusGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { VisualPreset } from '../../../src/content/look/visual';
import { colorScales } from '../../../src/styles/tokens';
import { type AmbientOcclusion, bakeParts, type Part } from './build';

/**
 * デスク（パイプライン確認用）。単位はメートル、原点は床の中心、+Y が上、モニターは -Z 側から +Z を向く。
 * 角丸ボックスと円柱を組み合わせたローポリのポップな形にし、色はトークンの段階から選ぶ。
 */

const TOP = { w: 1.4, h: 0.08, d: 0.75, y: 0.72 };
const LEG = { size: 0.07, inset: 0.1 };

function box(w: number, h: number, d: number, radius: number, x: number, y: number, z: number): BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, 2, radius).translate(x, y, z);
}

/**
 * 簡易 AO。床の近くと天板の下を暗くし、下を向いた面を少し暗くする。
 * レイを飛ばさない近似だが、小さく表示する見下ろし2.5Dでは接地感と立体感を出すのに足りる
 */
const deskAo: AmbientOcclusion = (p, n) => {
  let k = 1;
  k -= 0.3 * Math.exp(-p.y / 0.12);
  const underTop = p.y < TOP.y - TOP.h / 2 + 0.001 && Math.abs(p.x) < TOP.w / 2 && Math.abs(p.z) < TOP.d / 2;
  if (underTop) k -= 0.18 * (1 - p.y / TOP.y) + 0.1;
  if (n.y < 0) k -= 0.15 * -n.y;
  return Math.min(1, Math.max(0.45, k));
};

export function buildDesk(preset: VisualPreset): Group {
  const s = colorScales(preset);
  const surfaceY = TOP.y + TOP.h / 2;
  const parts: Part[] = [];

  parts.push({ geometry: box(TOP.w, TOP.h, TOP.d, 0.035, 0, TOP.y, 0), color: s.warning[300] });
  const legH = TOP.y - TOP.h / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (TOP.w / 2 - LEG.inset);
      const z = sz * (TOP.d / 2 - LEG.inset);
      parts.push({ geometry: box(LEG.size, legH, LEG.size, 0.03, x, legH / 2, z), color: s.primary[500] });
    }
  }

  // モニター（台座・首・本体・画面）
  const mz = -0.15;
  parts.push({ geometry: box(0.26, 0.025, 0.16, 0.012, 0, surfaceY + 0.0125, mz), color: s.neutral[800] });
  parts.push({ geometry: box(0.06, 0.16, 0.04, 0.015, 0, surfaceY + 0.1, mz), color: s.neutral[800] });
  const screenY = surfaceY + 0.34;
  parts.push({ geometry: box(0.7, 0.42, 0.05, 0.025, 0, screenY, mz + 0.02), color: s.neutral[800] });
  parts.push({ geometry: box(0.62, 0.34, 0.012, 0.006, 0, screenY + 0.005, mz + 0.046), color: s.accent[100] });

  // キーボードとマグカップ
  parts.push({ geometry: box(0.46, 0.03, 0.15, 0.012, -0.04, surfaceY + 0.015, 0.16), color: preset.palette.surface });
  const mug = new CylinderGeometry(0.045, 0.04, 0.1, 12).translate(0.48, surfaceY + 0.05, 0.12);
  parts.push({ geometry: mug, color: s.danger[500] });
  const handle = new TorusGeometry(0.025, 0.009, 6, 10).translate(0.53, surfaceY + 0.055, 0.12);
  parts.push({ geometry: handle, color: s.danger[500] });

  const group = new Group();
  group.name = 'desk';
  group.add(bakeParts('desk', normalizeIndex(parts), deskAo));
  return group;
}

/** mergeGeometries は index の有無がそろっている必要がある。すべて index なしにそろえる */
function normalizeIndex(parts: Part[]): Part[] {
  return parts.map((part) => ({
    ...part,
    geometry: part.geometry.index ? part.geometry.toNonIndexed() : part.geometry,
  }));
}
