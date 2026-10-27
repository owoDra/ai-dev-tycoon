/*
 * QR コードの生成（JIS X 0510 / ISO/IEC 18004 のモデル2）。結果コードをスマホで読み取れるようにするための小さな自前実装で、
 * 外部のライブラリやネットワークを使わない。バージョン 1〜10・誤り訂正レベル M・英数字モードとバイトモードだけに対応する
 * （結果コードは英数字モードでおよそ 100 文字に収まる）。DOM には依存しない純粋関数。
 */

/** 誤り訂正のブロック構成（レベル M）。[ブロックごとの誤り訂正の語数, [ブロック数, データの語数][]] */
const BLOCKS_M: readonly (readonly [number, readonly (readonly [number, number])[]])[] = [
  [10, [[1, 16]]],
  [16, [[1, 28]]],
  [26, [[1, 44]]],
  [18, [[2, 32]]],
  [24, [[2, 43]]],
  [16, [[4, 27]]],
  [18, [[4, 31]]],
  [
    22,
    [
      [2, 38],
      [2, 39],
    ],
  ],
  [
    22,
    [
      [3, 36],
      [2, 37],
    ],
  ],
  [
    26,
    [
      [4, 43],
      [1, 44],
    ],
  ],
];

/** 位置合わせパターンの中心の座標（バージョン 2 から） */
const ALIGNMENT: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
export const MAX_VERSION = BLOCKS_M.length;
/** 形式情報の誤り訂正レベル M のビット */
const LEVEL_M = 0b00;

export interface QrCode {
  readonly version: number;
  readonly size: number;
  readonly mask: number;
  /** modules[y][x] が true なら暗いモジュール */
  readonly modules: readonly (readonly boolean[])[];
}

/** 文字列を QR コードにする。入りきらなければ例外にする */
export function encodeQr(text: string): QrCode {
  const alnum = [...text].every((c) => ALNUM.includes(c));
  const bytes = alnum ? [] : [...new TextEncoder().encode(text)];
  for (let version = 1; version <= MAX_VERSION; version++) {
    const data = dataCodewords(text, bytes, alnum, version);
    if (data) return build(version, addErrorCorrection(data, version));
  }
  throw new RangeError(`QR コードに入りきらない（${text.length} 文字）`);
}

/** データの語数 */
function dataCapacity(version: number): number {
  const [, groups] = BLOCKS_M[version - 1] ?? [0, []];
  return groups.reduce((sum, [n, k]) => sum + n * k, 0);
}

class Bits {
  readonly bits: number[] = [];
  push(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

/** モード・文字数・データ・終端・埋め草までの、データの語の列。入りきらなければ null */
export function dataCodewords(
  text: string,
  bytes: readonly number[],
  alnum: boolean,
  version: number,
): number[] | null {
  const capacity = dataCapacity(version) * 8;
  const b = new Bits();
  if (alnum) {
    b.push(0b0010, 4);
    b.push(text.length, version < 10 ? 9 : 11);
    for (let i = 0; i < text.length; i += 2) {
      const a = ALNUM.indexOf(text[i] ?? '');
      if (i + 1 < text.length) b.push(a * 45 + ALNUM.indexOf(text[i + 1] ?? ''), 11);
      else b.push(a, 6);
    }
  } else {
    b.push(0b0100, 4);
    b.push(bytes.length, version < 10 ? 8 : 16);
    for (const x of bytes) b.push(x, 8);
  }
  if (b.bits.length > capacity) return null;
  b.push(0, Math.min(4, capacity - b.bits.length));
  b.push(0, (8 - (b.bits.length % 8)) % 8);
  const words: number[] = [];
  for (let i = 0; i < b.bits.length; i += 8) words.push(Number.parseInt(b.bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; words.length < capacity / 8; pad ^= 0xec ^ 0x11) words.push(pad);
  return words;
}

/** データの語をブロックに分けて誤り訂正の語を付け、規格の順に交互に並べる */
export function addErrorCorrection(data: readonly number[], version: number): number[] {
  const [ecLength, groups] = BLOCKS_M[version - 1] ?? [0, []];
  const divisor = rsDivisor(ecLength);
  const blocks: { data: number[]; ec: number[] }[] = [];
  let k = 0;
  for (const [count, length] of groups) {
    for (let i = 0; i < count; i++) {
      const d = data.slice(k, k + length);
      k += length;
      blocks.push({ data: d, ec: rsRemainder(d, divisor) });
    }
  }
  const out: number[] = [];
  const longest = Math.max(...blocks.map((x) => x.data.length));
  for (let i = 0; i < longest; i++) for (const x of blocks) if (i < x.data.length) out.push(x.data[i] ?? 0);
  for (let i = 0; i < ecLength; i++) for (const x of blocks) out.push(x.ec[i] ?? 0);
  return out;
}

/** GF(2^8)（原始多項式 0x11D）の積 */
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** リード・ソロモンの生成多項式（最高次の係数 1 を除き、次数の高い順） */
function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j] ?? 0, root) ^ (result[j + 1] ?? 0);
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() ?? 0);
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] = (result[i] ?? 0) ^ gfMul(divisor[i] ?? 0, factor);
  }
  return result;
}

function build(version: number, codewords: readonly number[]): QrCode {
  const size = version * 4 + 17;
  const base = new Matrix(size);
  base.drawFunctionPatterns(version);
  base.drawCodewords(codewords);
  let best: { mask: number; modules: boolean[][]; penalty: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = base.clone();
    m.applyMask(mask);
    m.drawFormat(mask);
    const penalty = m.penalty();
    if (!best || penalty < best.penalty) best = { mask, modules: m.modules, penalty };
  }
  const chosen = best ?? { mask: 0, modules: base.modules };
  return { version, size, mask: chosen.mask, modules: chosen.modules };
}

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** 形式情報の 15 ビット（BCH(15,5) とマスクパターン 0x5412） */
export function formatBits(mask: number): number {
  const data = (LEVEL_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

class Matrix {
  readonly modules: boolean[][];
  readonly fixed: boolean[][];
  constructor(
    readonly size: number,
    modules?: boolean[][],
    fixed?: boolean[][],
  ) {
    this.modules = modules ?? Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.fixed = fixed ?? Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }

  clone(): Matrix {
    return new Matrix(
      this.size,
      this.modules.map((r) => [...r]),
      this.fixed,
    );
  }

  private set(x: number, y: number, dark: boolean) {
    const row = this.modules[y];
    const f = this.fixed[y];
    if (!row || !f || x < 0 || x >= this.size) return;
    row[x] = dark;
    f[x] = true;
  }

  drawFunctionPatterns(version: number) {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [
      [3, 3],
      [n - 4, 3],
      [3, n - 4],
    ] as const) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          if (cy + dy >= 0 && cy + dy < n) this.set(cx + dx, cy + dy, d !== 2 && d !== 4);
        }
      }
    }
    const pos = ALIGNMENT[version - 1] ?? [];
    const last = pos.length - 1;
    pos.forEach((ax, i) => {
      pos.forEach((ay, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) this.set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      });
    });
    // 形式情報の場所を予約する（マスクを決めた後に書く）
    this.drawFormat(0);
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) === 1;
        const a = n - 11 + (i % 3);
        const b = Math.floor(i / 3);
        this.set(a, b, dark);
        this.set(b, a, dark);
      }
    }
  }

  drawFormat(mask: number) {
    const n = this.size;
    const bits = formatBits(mask);
    const bit = (i: number) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, n - 15 + i, bit(i));
    this.set(8, n - 8, true);
  }

  /** 右下から2列ずつ、上下に折り返しながらデータを置く（端数のビットは明るいまま） */
  drawCodewords(codewords: readonly number[]) {
    const n = this.size;
    let i = 0;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < n; v++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? n - 1 - v : v;
          if (this.fixed[y]?.[x] || i >= codewords.length * 8) continue;
          const row = this.modules[y];
          if (row) row[x] = (((codewords[i >>> 3] ?? 0) >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }

  applyMask(mask: number) {
    const fn = MASKS[mask] ?? MASKS[0];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const row = this.modules[y];
        if (row && !this.fixed[y]?.[x] && fn?.(x, y)) row[x] = !row[x];
      }
    }
  }

  /** マスクを選ぶための失点（同じ色の連続・2×2 の塊・位置検出パターンに似た並び・明暗の偏り） */
  penalty(): number {
    const n = this.size;
    const at = (x: number, y: number) => this.modules[y]?.[x] === true;
    let score = 0;
    const lines = (get: (i: number, j: number) => boolean) => {
      for (let i = 0; i < n; i++) {
        let run = 1;
        let seq = '';
        for (let j = 0; j < n; j++) {
          const c = get(i, j);
          seq += c ? '1' : '0';
          if (j > 0 && c === get(i, j - 1)) {
            run++;
            if (run === 5) score += 3;
            else if (run > 5) score += 1;
          } else run = 1;
        }
        for (const pattern of ['10111010000', '00001011101']) {
          for (let k = seq.indexOf(pattern); k >= 0; k = seq.indexOf(pattern, k + 1)) score += 40;
        }
      }
    };
    lines((y, x) => at(x, y));
    lines((x, y) => at(x, y));
    let dark = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (at(x, y)) dark++;
        if (x < n - 1 && y < n - 1) {
          const c = at(x, y);
          if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3;
        }
      }
    }
    score += Math.floor(Math.abs((dark * 20) / (n * n) - 10)) * 10;
    return score;
  }
}

/** 暗いモジュールを1つの SVG のパス（1モジュール = 1単位）にする。余白（quiet zone）は quiet モジュール */
export function qrPath(qr: QrCode, quiet = 4): string {
  let d = '';
  qr.modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    });
  });
  return d;
}
