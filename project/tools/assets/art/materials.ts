import type { VisualPreset } from '../../../src/content/look/visual';
import { mix } from '../../../src/styles/color';
import { colorScales } from '../../../src/styles/tokens';
import { svgDoc } from './svg';

/** 3D 用のテクスチャ（床・壁・トゥーンの matcap・グラデーションマップ）。床と壁は端がつながる（敷き詰められる） */

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

export function wall(p: VisualPreset, w: number, h: number, scale: number): string {
  const s = colorScales(p);
  const stripe = w / 4;
  const parts = [`<rect width="${w}" height="${h}" fill="${s.primary[50]}"/>`];
  for (let i = 0; i < 4; i += 2)
    parts.push(`<rect x="${i * stripe}" width="${stripe}" height="${h}" fill="${s.primary[100]}"/>`);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      parts.push(
        `<circle cx="${(i + 0.5) * stripe}" cy="${(j + 0.5) * (h / 4)}" r="5" fill="${i % 2 === 0 ? p.palette.surface : s.primary[200]}"/>`,
      );
    }
  }
  // 腰板（下 1/4）
  parts.push(`<rect y="${h * 0.75}" width="${w}" height="${h * 0.25}" fill="${s.primary[200]}"/>`);
  parts.push(`<rect y="${h * 0.75}" width="${w}" height="6" fill="${s.primary[300]}"/>`);
  return svgDoc(w, h, scale, parts.join(''));
}

/**
 * トゥーン調の matcap。左上から光が当たる球を3段の陰影で描く。色は白に近いニュートラルにし、
 * 頂点カラーと掛け合わせて使う。暗い段は線の色（濃い紫）へ寄せ、影が黒く濁らないようにする
 */
export function matcapToon(p: VisualPreset, w: number, h: number, scale: number): string {
  const line = p.palette.line;
  const r = w / 2;
  const light = '#ffffff';
  const mid = mix('#ffffff', p.palette.bg, 0.9);
  const dark = mix(mid, line, 0.32);
  const body = [
    `<rect width="${w}" height="${h}" fill="${dark}"/>`,
    `<circle cx="${r}" cy="${r}" r="${r}" fill="${dark}"/>`,
    `<circle cx="${r * 0.86}" cy="${r * 0.84}" r="${r * 0.86}" fill="${mid}"/>`,
    `<circle cx="${r * 0.7}" cy="${r * 0.64}" r="${r * 0.5}" fill="${light}"/>`,
    `<ellipse cx="${r * 0.58}" cy="${r * 0.48}" rx="${r * 0.16}" ry="${r * 0.1}" fill="#ffffff" transform="rotate(-35 ${r * 0.58} ${r * 0.48})"/>`,
    // 輪郭のふち（リムライト）
    `<circle cx="${r}" cy="${r}" r="${r - r * 0.04}" fill="none" stroke="${mix(dark, '#ffffff', 0.35)}" stroke-width="${r * 0.06}"/>`,
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
