import type { QrCode } from '../../src/lib/qr';

/*
 * テスト用の QR コードの読み取り（誤り訂正レベル M・英数字モードとバイトモード）。エンコーダ（src/lib/qr.ts）とは別に、
 * 規格の表から機能パターンの位置・形式情報・マスク・ブロック分割を組み立てて読み、リード・ソロモンのシンドロームで
 * 誤り訂正の語が正しいことも確かめる。誤りの訂正はしない（生成したての QR コードを読むため）。
 */

/** レベル M の [誤り訂正の語数, ブロックごとのデータの語数の列] */
const BLOCKS: Readonly<Record<number, readonly [number, readonly number[]]>> = {
  1: [10, [16]],
  2: [16, [28]],
  3: [26, [44]],
  4: [18, [32, 32]],
  5: [24, [43, 43]],
  6: [16, [27, 27, 27, 27]],
  7: [18, [31, 31, 31, 31]],
  8: [22, [38, 38, 39, 39]],
  9: [22, [36, 36, 36, 37, 37]],
  10: [26, [43, 43, 43, 43, 44]],
};
const ALIGN: Readonly<Record<number, readonly number[]>> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

export interface QrReading {
  readonly text: string;
  readonly version: number;
  readonly level: 'M';
  readonly mask: number;
  /** すべてのブロックで、誤り訂正の語を含めたシンドロームが 0 だったか */
  readonly eccValid: boolean;
}

function bch(data: number, bits: number, poly: number): number {
  let v = data << bits;
  const top = Math.floor(Math.log2(poly));
  for (let i = Math.floor(Math.log2(v || 1)); i >= top; i--) if ((v >> i) & 1) v ^= poly << (i - top);
  return (data << bits) | v;
}

function gf() {
  const exp = new Array<number>(512);
  const log = new Array<number>(256).fill(0);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255] as number;
  const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : (exp[(log[a] ?? 0) + (log[b] ?? 0)] as number));
  return { exp, mul };
}

/** 符号語（次数の高い順）を α^0..α^(n-1) で評価して、すべて 0 か */
function syndromesZero(word: readonly number[], ecLength: number): boolean {
  const { exp, mul } = gf();
  for (let i = 0; i < ecLength; i++) {
    let s = 0;
    for (const c of word) s = mul(s, exp[i] as number) ^ c;
    if (s !== 0) return false;
  }
  return true;
}

export function readQr(qr: QrCode): QrReading {
  const n = qr.modules.length;
  const version = (n - 17) / 4;
  const at = (x: number, y: number) => qr.modules[y]?.[x] === true;

  // 形式情報（2か所の写しが一致し、正しい BCH 符号であること）
  const a: boolean[] = [];
  for (let i = 0; i <= 5; i++) a.push(at(8, i));
  a.push(at(8, 7), at(8, 8), at(7, 8));
  for (let i = 9; i < 15; i++) a.push(at(14 - i, 8));
  const b: boolean[] = [];
  for (let i = 0; i < 8; i++) b.push(at(n - 1 - i, 8));
  for (let i = 8; i < 15; i++) b.push(at(8, n - 15 + i));
  const word = (bits: boolean[]) => bits.reduce((v, bit, i) => v | ((bit ? 1 : 0) << i), 0);
  if (word(a) !== word(b)) throw new Error('形式情報の2つの写しが一致しない');
  const format = word(a) ^ 0x5412;
  const data5 = format >> 10;
  if (bch(data5, 10, 0x537) !== format) throw new Error('形式情報の BCH 符号が不正');
  if (data5 >> 3 !== 0b00) throw new Error('誤り訂正レベルが M ではない');
  const mask = data5 & 7;
  if (!at(8, n - 8)) throw new Error('暗いモジュールがない');

  // 機能パターン
  const fn = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const mark = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < n && y < n) (fn[y] as boolean[])[x] = true;
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if ((x <= 8 && y <= 8) || (x >= n - 8 && y <= 8) || (x <= 8 && y >= n - 8) || x === 6 || y === 6) mark(x, y);
    }
  }
  const pos = ALIGN[version] ?? [];
  for (const ax of pos) {
    for (const ay of pos) {
      if ((ax <= 8 && ay <= 8) || (ax >= n - 9 && ay <= 8) || (ax <= 8 && ay >= n - 9)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(ax + dx, ay + dy);
    }
  }
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = n - 11; j < n - 8; j++) {
        mark(j, i);
        mark(i, j);
      }
    }
    let v = 0;
    for (let i = 0; i < 18; i++) if (at(n - 11 + (i % 3), Math.floor(i / 3))) v |= 1 << i;
    if (bch(version, 12, 0x1f25) !== v) throw new Error('バージョン情報が不正');
  }

  // 位置検出パターン（7×7 の黒枠・白枠・3×3 の黒）
  for (const [cx, cy] of [
    [3, 3],
    [n - 4, 3],
    [3, n - 4],
  ] as const) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (at(cx + dx, cy + dy) !== (d !== 2)) throw new Error('位置検出パターンが不正');
      }
    }
  }

  // データの読み取り（右下から2列ずつ、上下に折り返す）とマスクの解除
  const masks = [
    (x: number, y: number) => (x + y) % 2 === 0,
    (_x: number, y: number) => y % 2 === 0,
    (x: number) => x % 3 === 0,
    (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const m = masks[mask] ?? masks[0];
  const bits: number[] = [];
  let upward = true;
  for (let right = n - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    for (let k = 0; k < n; k++) {
      const y = upward ? n - 1 - k : k;
      for (const x of [right, right - 1]) {
        if (fn[y]?.[x]) continue;
        bits.push((at(x, y) !== (m?.(x, y) ?? false) ? 1 : 0) as number);
      }
    }
    upward = !upward;
  }
  const [ecLength, dataLengths] = BLOCKS[version] ?? [0, []];
  const total = dataLengths.reduce((s, d) => s + d + ecLength, 0);
  const codewords: number[] = [];
  for (let i = 0; i < total; i++) codewords.push(Number.parseInt(bits.slice(i * 8, i * 8 + 8).join(''), 2));

  // ブロックに分け直す（データは交互に、長いブロックの最後の語は後ろにまとめて、その後に誤り訂正の語）
  const blocks = dataLengths.map(() => ({ data: [] as number[], ec: [] as number[] }));
  let k = 0;
  const longest = Math.max(...dataLengths);
  for (let i = 0; i < longest; i++) {
    dataLengths.forEach((len, j) => {
      if (i < len) blocks[j]?.data.push(codewords[k++] ?? 0);
    });
  }
  for (let i = 0; i < ecLength; i++) for (const block of blocks) block.ec.push(codewords[k++] ?? 0);
  const eccValid = blocks.every((block) => syndromesZero([...block.data, ...block.ec], ecLength));

  // データの解読
  const dataBits = blocks
    .flatMap((block) => block.data)
    .flatMap((w) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (w >> i) & 1));
  let p = 0;
  const take = (len: number) => {
    const v = Number.parseInt(dataBits.slice(p, p + len).join(''), 2);
    p += len;
    return v;
  };
  const mode = take(4);
  let text = '';
  if (mode === 0b0010) {
    let count = take(version < 10 ? 9 : 11);
    while (count >= 2) {
      const v = take(11);
      text += (ALNUM[Math.floor(v / 45)] ?? '') + (ALNUM[v % 45] ?? '');
      count -= 2;
    }
    if (count === 1) text += ALNUM[take(6)] ?? '';
  } else if (mode === 0b0100) {
    const count = take(version < 10 ? 8 : 16);
    const bytes = Uint8Array.from({ length: count }, () => take(8));
    text = new TextDecoder().decode(bytes);
  } else {
    throw new Error(`未対応のモード ${mode}`);
  }
  return { text, version, level: 'M', mask, eccValid };
}
