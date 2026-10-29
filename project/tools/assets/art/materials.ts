import type { VisualPreset } from '../../../src/content/look/visual';
import { colorScales } from '../../../src/styles/tokens';
import { svgDoc } from './svg';

/** 3D 用のテクスチャ（床・グラデーションマップ）。床は端がつながる（敷き詰められる） */

export function floor(p: VisualPreset, w: number, h: number, scale: number): string {
  const s = colorScales(p);
  const half = w / 2;
  const tile = (x: number, y: number, color: string) =>
    `<rect x="${x + 3}" y="${y + 3}" width="${half - 6}" height="${half - 6}" rx="14" fill="${color}"/>` +
    `<rect x="${x + 10}" y="${y + 8}" width="${half - 20}" height="10" rx="5" fill="#ffffff" opacity="0.45"/>`;
  const body = [
    `<rect width="${w}" height="${h}" fill="${s.warning[200]}"/>`,
    tile(0, 0, s.warning[50]),
    tile(half, 0, s.warning[100]),
    tile(0, half, s.warning[100]),
    tile(half, half, s.warning[50]),
  ].join('');
  return svgDoc(w, h, scale, body);
}

/** MeshToonMaterial のグラデーションマップ。横に並べた明るさの段（暗い → 明るい） */
export function toonGradient(_p: VisualPreset, w: number, h: number, scale: number): string {
  const steps = ['#737373', '#a6a6a6', '#d9d9d9', '#ffffff'];
  const cell = w / steps.length;
  const body = steps.map((c, i) => `<rect x="${i * cell}" width="${cell}" height="${h}" fill="${c}"/>`).join('');
  return svgDoc(w, h, scale, body);
}
