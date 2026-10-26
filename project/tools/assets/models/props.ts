import type { VisualPreset } from '../../../src/content/look/visual';
import { colorScales } from '../../../src/styles/tokens';
import { bakeModel, type Part } from './build';
import { box, cone, cylinder, groundAo, sphere } from './shapes';

/** 小物（モニター・コンベアの部品・パケット・観葉植物・サーバーラック）。単位と向きは catalog.ts の説明のとおり */

export function buildMonitor(preset: VisualPreset) {
  const s = colorScales(preset);
  const parts: Part[] = [
    { geometry: cylinder(0.28, 0.32, 0.06, 0, 0.03, 0), color: s.neutral[800] },
    { geometry: box(0.08, 0.7, 0.08, 0.03, 0, 0.4, 0), color: s.neutral[800] },
    { geometry: box(1.3, 0.8, 0.1, 0.05, 0, 1.1, 0), color: s.neutral[800] },
    { geometry: box(1.18, 0.68, 0.02, 0.02, 0, 1.1, 0.055), color: s.accent[50] },
  ];
  // 画面の棒グラフ（案件の状況の見本）
  const bars = [s.success[400], s.accent[400], s.primary[400], s.success[400]];
  bars.forEach((color, i) => {
    const h = 0.18 + 0.1 * ((i * 7) % 4);
    parts.push({ geometry: box(0.16, h, 0.02, 0.01, -0.39 + i * 0.26, 0.83 + h / 2, 0.07), color });
  });
  return bakeModel('monitor', parts, groundAo);
}

/** コンベアの1区間（+Z 方向に 0.5m、中心が原点の真上）。上面の高さは 0.24m */
export function buildConveyor(preset: VisualPreset) {
  const s = colorScales(preset);
  const parts: Part[] = [
    { geometry: box(0.56, 0.14, 0.5, 0.03, 0, 0.13, 0), color: s.primary[300] },
    { geometry: box(0.46, 0.03, 0.5, 0.01, 0, 0.215, 0), color: s.neutral[700] },
    // 進む向きの目印
    { geometry: box(0.18, 0.012, 0.05, 0.005, -0.06, 0.233, 0.05), color: s.neutral[500] },
  ];
  for (const x of [-1, 1]) {
    parts.push({ geometry: box(0.05, 0.06, 0.5, 0.02, x * 0.255, 0.23, 0), color: s.primary[500] });
    parts.push({ geometry: box(0.06, 0.08, 0.06, 0.02, x * 0.2, 0.04, 0), color: s.neutral[800] });
  }
  return bakeModel('conveyor', parts, groundAo);
}

/** 仕事の小包。一辺 1m、中心が原点。リボンをかけた箱 */
export function buildPacket(preset: VisualPreset) {
  const s = colorScales(preset);
  const ribbon = s.primary[500];
  const parts: Part[] = [
    { geometry: box(1, 0.86, 1, 0.16, 0, 0, 0), color: s.accent[300] },
    { geometry: box(1.04, 0.9, 0.18, 0.05, 0, 0, 0), color: ribbon },
    { geometry: box(0.18, 0.9, 1.04, 0.05, 0, 0, 0), color: ribbon },
    { geometry: sphere(0.16, -0.14, 0.5, 0, 0.7), color: ribbon },
    { geometry: sphere(0.16, 0.14, 0.5, 0, 0.7), color: ribbon },
  ];
  return bakeModel('packet', parts, () => 1);
}

export function buildPlant(preset: VisualPreset) {
  const s = colorScales(preset);
  const leaf = s.success[500];
  const parts: Part[] = [
    { geometry: cylinder(0.2, 0.15, 0.32, 0, 0.16, 0), color: s.primary[300] },
    { geometry: cylinder(0.215, 0.215, 0.05, 0, 0.32, 0), color: s.primary[400] },
    { geometry: cylinder(0.18, 0.18, 0.02, 0, 0.33, 0), color: s.warning[800] },
    { geometry: sphere(0.2, 0, 0.62, 0, 1.2), color: leaf },
    { geometry: sphere(0.15, -0.14, 0.52, 0.06), color: s.success[400] },
    { geometry: sphere(0.15, 0.14, 0.5, -0.05), color: s.success[400] },
    { geometry: sphere(0.12, 0.03, 0.84, 0.03), color: s.success[300] },
  ];
  return bakeModel('plant', parts, groundAo);
}

export function buildServerRack(preset: VisualPreset) {
  const s = colorScales(preset);
  const parts: Part[] = [{ geometry: box(0.7, 1.6, 0.6, 0.06, 0, 0.82, 0), color: s.neutral[800] }];
  for (let i = 0; i < 5; i++) {
    const y = 0.25 + i * 0.28;
    parts.push({ geometry: box(0.6, 0.2, 0.02, 0.02, 0, y, 0.3), color: s.neutral[700] });
    parts.push({ geometry: box(0.05, 0.05, 0.02, 0.01, 0.2, y, 0.315), color: i % 2 ? s.success[300] : s.accent[300] });
    parts.push({ geometry: box(0.05, 0.05, 0.02, 0.01, 0.12, y, 0.315), color: s.success[300] });
  }
  parts.push({ geometry: cone(0.04, 0.08, 0, 1.68, 0, 8), color: s.danger[400] });
  return bakeModel('serverRack', parts, groundAo);
}
