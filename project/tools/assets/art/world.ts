import type { VisualPreset } from '../../../src/content/look/visual';
import { type Expression, expressions } from '../../../src/content/look/world';
import { colorScales } from '../../../src/styles/tokens';
import { svgDoc } from './svg';

/** 2.5D ワールドのテクスチャ（表情のアトラス・接地影） */

/** 汗のしずく。パレットに青がないため固定の色にする */
const SWEAT = '#9fdcff';

/** 1コマ分の顔（128×128 の座標）。目と口と頬だけを描き、背景は透明にする */
function face(expression: Expression, p: VisualPreset): string {
  const s = colorScales(p);
  const line = p.palette.line;
  const stroke = (d: string, w = 6) =>
    `<path d="${d}" fill="none" stroke="${line}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const cheeks = [32, 96].map(
    (x) => `<ellipse cx="${x}" cy="80" rx="11" ry="7" fill="${s.danger[300]}" opacity="0.6"/>`,
  );
  const eye = (x: number) =>
    `<ellipse cx="${x}" cy="62" rx="8" ry="11" fill="${line}"/><circle cx="${x + 3}" cy="57" r="3" fill="#ffffff"/>`;
  switch (expression) {
    case 'normal':
      return [...cheeks, eye(44), eye(84), stroke('M54 84q10 9 20 0')].join('');
    case 'focus':
      return [
        ...cheeks,
        `<ellipse cx="44" cy="64" rx="9" ry="6" fill="${line}"/>`,
        `<ellipse cx="84" cy="64" rx="9" ry="6" fill="${line}"/>`,
        stroke('M33 48l20 6M95 48l-20 6', 5),
        stroke('M57 88h14'),
      ].join('');
    case 'trouble':
      return [
        ...cheeks,
        `<circle cx="44" cy="64" r="7" fill="${line}"/>`,
        `<circle cx="84" cy="64" r="7" fill="${line}"/>`,
        stroke('M33 52l18-8M95 52l-18-8', 5),
        stroke('M48 90q5-6 10 0t10 0t10 0', 5),
        `<path d="M104 30q-8 12-8 18a8 8 0 0 0 16 0q0-6-8-18z" fill="${SWEAT}" stroke="${line}" stroke-width="3"/>`,
      ].join('');
    case 'joy':
      return [
        ...cheeks,
        stroke('M35 66q9-13 18 0M75 66q9-13 18 0'),
        `<path d="M48 80q16 22 32 0z" fill="${line}" stroke="${line}" stroke-width="4" stroke-linejoin="round"/>`,
        `<ellipse cx="64" cy="90" rx="8" ry="4" fill="${s.danger[400]}"/>`,
      ].join('');
  }
}

/** 表情のアトラス。2×2 のコマに expressions の順で並べる */
export function faceAtlas(p: VisualPreset, w: number, h: number, scale: number): string {
  const cell = w / 2;
  const body = expressions
    .map((e, i) => {
      const x = (i % 2) * cell;
      const y = Math.floor(i / 2) * (h / 2);
      return `<g transform="translate(${x} ${y}) scale(${cell / 128})">${face(e, p)}</g>`;
    })
    .join('');
  return svgDoc(w, h, scale, body);
}

/** 接地影。中心が白く外へ向かって黒くなる円（alphaMap として使う） */
export function blobShadow(_p: VisualPreset, w: number, h: number, scale: number): string {
  const body = [
    '<defs><radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="0.55" stop-color="#bbb"/>',
    '<stop offset="1" stop-color="#000"/></radialGradient></defs>',
    `<rect width="${w}" height="${h}" fill="#000"/>`,
    `<circle cx="${w / 2}" cy="${h / 2}" r="${w / 2}" fill="url(#g)"/>`,
  ].join('');
  return svgDoc(w, h, scale, body);
}
