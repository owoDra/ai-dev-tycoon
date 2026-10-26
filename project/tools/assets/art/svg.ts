/** イラスト（SVG 文字列）を組み立てるための小さな道具。生成のたびに同じ絵になるよう、乱数は種付きにする */

/** 種付きの乱数（mulberry32）。0 以上 1 未満を返す */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (v: number) => Number(v.toFixed(2));

/** viewBox は (w, h) のまま、出力のピクセル数だけ scale 倍にした SVG 文書 */
export function svgDoc(w: number, h: number, scale: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

export interface CubeColors {
  top: string;
  left: string;
  right: string;
  line: string;
}

/**
 * 見下ろしのアイソメトリックな箱。(x, y) は上面の手前の角、w と d は奥行き方向の2辺、h は高さ（すべて画面上の長さ）
 */
export function isoBox(
  x: number,
  y: number,
  w: number,
  d: number,
  h: number,
  c: CubeColors,
  lineWidth: number,
): string {
  const cos = Math.cos(Math.PI / 6);
  const sin = 0.5;
  const right = [x + w * cos, y - w * sin];
  const left = [x - d * cos, y - d * sin];
  const back = [x + w * cos - d * cos, y - w * sin - d * sin];
  const pt = (p: number[]) => `${n(p[0] ?? 0)} ${n(p[1] ?? 0)}`;
  const stroke = `stroke="${c.line}" stroke-width="${lineWidth}" stroke-linejoin="round"`;
  return [
    `<path d="M${pt([x, y])}L${pt(left)}L${pt([left[0] ?? 0, (left[1] ?? 0) + h])}L${pt([x, y + h])}Z" fill="${c.left}" ${stroke}/>`,
    `<path d="M${pt([x, y])}L${pt(right)}L${pt([right[0] ?? 0, (right[1] ?? 0) + h])}L${pt([x, y + h])}Z" fill="${c.right}" ${stroke}/>`,
    `<path d="M${pt([x, y])}L${pt(right)}L${pt(back)}L${pt(left)}Z" fill="${c.top}" ${stroke}/>`,
  ].join('');
}

/** 紙吹雪。角丸の短冊と丸をばらまく */
export function confetti(
  rand: () => number,
  count: number,
  area: { x: number; y: number; w: number; h: number },
  colors: readonly string[],
  size: number,
): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = n(area.x + rand() * area.w);
    const y = n(area.y + rand() * area.h);
    const color = colors[Math.floor(rand() * colors.length)] ?? colors[0];
    const s = size * (0.6 + rand() * 0.8);
    if (rand() < 0.35) {
      parts.push(`<circle cx="${x}" cy="${y}" r="${n(s * 0.45)}" fill="${color}"/>`);
    } else {
      const angle = Math.round(rand() * 180);
      parts.push(
        `<rect x="${n(x - s * 0.3)}" y="${n(y - s * 0.8)}" width="${n(s * 0.6)}" height="${n(s * 1.6)}" rx="${n(s * 0.3)}" fill="${color}" transform="rotate(${angle} ${x} ${y})"/>`,
      );
    }
  }
  return parts.join('');
}

/** 中心から放射状に広がる帯（サンバースト） */
export function sunburst(cx: number, cy: number, radius: number, rays: number, color: string, opacity: number): string {
  const parts: string[] = [];
  const step = (Math.PI * 2) / rays;
  for (let i = 0; i < rays; i++) {
    const a0 = i * step;
    const a1 = a0 + step / 2;
    const p0 = `${n(cx + Math.cos(a0) * radius)} ${n(cy + Math.sin(a0) * radius)}`;
    const p1 = `${n(cx + Math.cos(a1) * radius)} ${n(cy + Math.sin(a1) * radius)}`;
    parts.push(`<path d="M${cx} ${cy}L${p0}L${p1}Z"/>`);
  }
  return `<g fill="${color}" opacity="${opacity}">${parts.join('')}</g>`;
}

/** 4本の光の筋を持つきらめき */
export function sparkle(cx: number, cy: number, r: number, color: string): string {
  const k = r * 0.22;
  return `<path d="M${cx} ${n(cy - r)}Q${n(cx + k)} ${n(cy - k)} ${n(cx + r)} ${cy}Q${n(cx + k)} ${n(cy + k)} ${cx} ${n(cy + r)}Q${n(cx - k)} ${n(cy + k)} ${n(cx - r)} ${cy}Q${n(cx - k)} ${n(cy - k)} ${cx} ${n(cy - r)}Z" fill="${color}"/>`;
}
