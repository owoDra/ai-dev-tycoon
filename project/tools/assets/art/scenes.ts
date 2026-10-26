import type { VisualPreset } from '../../../src/content/look/visual';
import { shade } from '../../../src/styles/color';
import { colorScales } from '../../../src/styles/tokens';
import { confetti, isoBox, seeded, sparkle, sunburst, svgDoc } from './svg';

/**
 * 描画負荷の高いイラスト（グラデーション・ぼかし・多数の図形）。WebP に事前ラスタライズして使う。
 * 文字は入れない（文言は i18n から HTML で重ねる）。
 */

const COS = Math.cos(Math.PI / 6);

/** アイソメトリックの床の上の点。(x, y) は床の手前の角、u は右奥、v は左奥へ向かう長さ */
function onFloor(x: number, y: number, u: number, v: number): [number, number] {
  return [x + (u - v) * COS, y - (u + v) * 0.5];
}

function pawnHuman(x: number, y: number, color: string, line: string): string {
  return [
    `<ellipse cx="${x}" cy="${y + 2}" rx="15" ry="6" fill="${line}" opacity="0.18"/>`,
    `<path d="M${x - 13} ${y}c0-14 6-22 13-22s13 8 13 22z" fill="${color}" stroke="${line}" stroke-width="3" stroke-linejoin="round"/>`,
    `<circle cx="${x}" cy="${y - 30}" r="10" fill="${shade(color, 0.55)}" stroke="${line}" stroke-width="3"/>`,
  ].join('');
}

function pawnAi(x: number, y: number, color: string, line: string): string {
  return [
    `<ellipse cx="${x}" cy="${y + 2}" rx="16" ry="6" fill="${line}" opacity="0.18"/>`,
    `<path d="M${x} ${y - 46}v-6" stroke="${line}" stroke-width="3" stroke-linecap="round"/>`,
    `<circle cx="${x}" cy="${y - 54}" r="4" fill="${shade(color, 0.5)}" stroke="${line}" stroke-width="3"/>`,
    `<rect x="${x - 16}" y="${y - 46}" width="32" height="44" rx="11" fill="${color}" stroke="${line}" stroke-width="3"/>`,
    `<circle cx="${x - 6}" cy="${y - 30}" r="3" fill="${line}"/>`,
    `<circle cx="${x + 6}" cy="${y - 30}" r="3" fill="${line}"/>`,
  ].join('');
}

/** デスクとモニター（床の上の点 (px, py) に立つ） */
function desk(px: number, py: number, p: VisualPreset): string {
  const s = colorScales(p);
  const line = p.palette.line;
  const top = { top: s.warning[200], left: s.warning[400], right: s.warning[300], line };
  const screen = { top: s.neutral[800], left: s.neutral[900], right: s.primary[100], line };
  return [isoBox(px, py - 26, 54, 34, 26, top, 3), isoBox(px + 4, py - 62, 30, 6, 26, screen, 3)].join('');
}

export function titleKey(p: VisualPreset, w: number, h: number, scale: number): string {
  const s = colorScales(p);
  const line = p.palette.line;
  const rand = seeded(20261026);
  const ix = w / 2;
  const iy = h * 0.8;
  const size = 250;
  const island = isoBox(
    ix,
    iy - 48,
    size,
    size,
    48,
    { top: p.palette.sunken, left: s.primary[500], right: s.primary[300], line },
    4,
  );
  // 奥から手前へ描く（u + v が大きいほど奥）
  const props = [
    { u: 175, v: 150, draw: (x: number, y: number) => desk(x, y, p) },
    { u: 60, v: 170, draw: (x: number, y: number) => desk(x, y, p) },
    { u: 150, v: 60, draw: (x: number, y: number) => pawnAi(x, y, p.palette.accent, line) },
    { u: 110, v: 105, draw: (x: number, y: number) => pawnHuman(x, y, p.palette.primary, line) },
    { u: 40, v: 90, draw: (x: number, y: number) => pawnAi(x, y, s.success[400], line) },
  ]
    .sort((a, b) => b.u + b.v - (a.u + a.v))
    .map(({ u, v, draw }) => {
      const [x, y] = onFloor(ix, iy - 48, u, v);
      return draw(x, y);
    })
    .join('');
  const colors = [
    p.palette.primary,
    p.palette.accent,
    p.palette.success.base,
    p.palette.warning.base,
    s.primary[300],
    s.accent[300],
  ];
  const body = [
    '<defs>',
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.accent[50]}"/><stop offset="0.6" stop-color="${p.palette.bg}"/><stop offset="1" stop-color="${p.palette.sunken}"/></linearGradient>`,
    `<radialGradient id="glow" cx="0.5" cy="0.55" r="0.5"><stop offset="0" stop-color="${s.accent[200]}" stop-opacity="0.9"/><stop offset="1" stop-color="${s.accent[200]}" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="blob" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="${s.primary[100]}"/><stop offset="1" stop-color="${s.primary[300]}"/></radialGradient>`,
    '<filter id="blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>',
    '</defs>',
    `<rect width="${w}" height="${h}" fill="url(#sky)"/>`,
    sunburst(ix, iy - 170, w, 28, s.accent[100], 0.7),
    `<ellipse cx="${ix}" cy="${iy - 150}" rx="${w * 0.45}" ry="${h * 0.42}" fill="url(#glow)"/>`,
    `<circle cx="${w * 0.1}" cy="${h * 0.25}" r="70" fill="url(#blob)" opacity="0.65"/>`,
    `<circle cx="${w * 0.92}" cy="${h * 0.7}" r="90" fill="url(#blob)" opacity="0.55"/>`,
    `<circle cx="${w * 0.86}" cy="${h * 0.16}" r="34" fill="${s.success[200]}" opacity="0.8"/>`,
    `<ellipse cx="${ix}" cy="${iy + 18}" rx="${size * 1.05}" ry="34" fill="${line}" opacity="0.28" filter="url(#blur)"/>`,
    island,
    props,
    confetti(rand, 70, { x: 0, y: 0, w, h: h * 0.75 }, colors, 14),
    sparkle(w * 0.2, h * 0.55, 18, p.palette.accent),
    sparkle(w * 0.78, h * 0.3, 24, p.palette.surface),
    sparkle(w * 0.66, h * 0.12, 14, p.palette.accent),
    sparkle(w * 0.3, h * 0.14, 12, p.palette.surface),
  ].join('');
  return svgDoc(w, h, scale, body);
}

export function resultBg(p: VisualPreset, w: number, h: number, scale: number): string {
  const s = colorScales(p);
  const rand = seeded(7);
  const colors = [
    p.palette.primary,
    p.palette.accent,
    p.palette.success.base,
    p.palette.warning.base,
    s.primary[200],
    s.success[200],
  ];
  const wave = (y: number, amp: number, color: string) =>
    `<path d="M0 ${y}C${w * 0.2} ${y - amp} ${w * 0.35} ${y + amp} ${w * 0.55} ${y}S${w * 0.85} ${y - amp} ${w} ${y}V${h}H0Z" fill="${color}"/>`;
  const body = [
    '<defs>',
    `<radialGradient id="bg" cx="0.5" cy="0.2" r="0.9"><stop offset="0" stop-color="${s.accent[100]}"/><stop offset="0.55" stop-color="${p.palette.bg}"/><stop offset="1" stop-color="${s.primary[100]}"/></radialGradient>`,
    `<radialGradient id="spot" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${p.palette.surface}" stop-opacity="0.85"/><stop offset="1" stop-color="${p.palette.surface}" stop-opacity="0"/></radialGradient>`,
    '</defs>',
    `<rect width="${w}" height="${h}" fill="url(#bg)"/>`,
    sunburst(w / 2, h * 0.18, w * 1.1, 32, s.accent[200], 0.45),
    `<ellipse cx="${w / 2}" cy="${h * 0.3}" rx="${w * 0.32}" ry="${h * 0.3}" fill="url(#spot)"/>`,
    wave(h * 0.8, 28, s.primary[200]),
    wave(h * 0.88, -22, s.primary[300]),
    confetti(rand, 90, { x: 0, y: 0, w, h: h * 0.8 }, colors, 13),
    sparkle(w * 0.15, h * 0.25, 20, p.palette.accent),
    sparkle(w * 0.85, h * 0.22, 26, p.palette.accent),
    sparkle(w * 0.72, h * 0.6, 14, p.palette.surface),
    sparkle(w * 0.26, h * 0.62, 16, p.palette.surface),
  ].join('');
  return svgDoc(w, h, scale, body);
}
