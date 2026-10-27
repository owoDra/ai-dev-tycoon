/*
 * 短い英数字のコードにするための、小さなバイト列の符号化（外部ライブラリの代わりの自前実装。DOM に依存しない純粋関数）。
 *
 * - 整数は LEB128 の可変長（符号付きは zigzag）、文字列は UTF-8 の長さ付きで書く
 * - 末尾に CRC-16/CCITT-FALSE を付ける。16 ビット以下の連続した誤りをすべて検出するので、Base32 の1文字（5ビット）を
 *   変えれば必ず検出できる
 * - Crockford Base32 で書き、4文字ごとに "-" で区切る。紛らわしい文字（I・L・O・U）を使わず、読み取り時は
 *   I・L を 1、O を 0 として扱い、区切り・空白・小文字は無視する
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const BITS_PER_CHAR = 5;
const BITS_PER_BYTE = 8;
const CHAR_MASK = 0x1f;
const BYTE_MASK = 0xff;
const GROUP = 4;
const CHECK_BYTES = 2;
/** 文字列の長さの上限（バイト） */
const MAX_TEXT_BYTES = 64;
/** 比率（0〜1）を書くときの目盛り。0.1% 単位 */
const RATIO_SCALE = 1000;
const VARINT_BASE = 0x80;
const VARINT_MAX_BYTES = 8;

export class ByteWriter {
  private readonly out: number[] = [];

  get bytes(): Uint8Array {
    return Uint8Array.from(this.out);
  }

  byte(v: number): this {
    this.out.push(v & BYTE_MASK);
    return this;
  }

  u16(v: number): this {
    return this.byte(v >>> BITS_PER_BYTE).byte(v);
  }

  /** 0 以上の整数（丸める。負の値は 0） */
  uint(v: number): this {
    let n = Math.max(0, Math.round(v));
    while (n >= VARINT_BASE) {
      this.out.push((n % VARINT_BASE) | VARINT_BASE);
      n = Math.floor(n / VARINT_BASE);
    }
    this.out.push(n);
    return this;
  }

  /** 符号付きの整数（丸める） */
  int(v: number): this {
    const n = Math.round(v);
    return this.uint(n >= 0 ? n * 2 : -n * 2 - 1);
  }

  /** 0〜1 の比率（0.1% 単位に丸める） */
  ratio(v: number): this {
    return this.uint(Math.min(1, Math.max(0, v)) * RATIO_SCALE);
  }

  /** UTF-8 の文字列。長すぎる分は切り捨てる */
  text(s: string): this {
    const encoder = new TextEncoder();
    let chars = [...s];
    let b = encoder.encode(s);
    while (b.length > MAX_TEXT_BYTES) {
      chars = chars.slice(0, -1);
      b = encoder.encode(chars.join(''));
    }
    this.uint(b.length);
    for (const x of b) this.out.push(x);
    return this;
  }
}

/** 読み進める位置が範囲を越えたり、中身が不正だったりしたら例外にする */
export class ByteReader {
  private pos = 0;

  constructor(private readonly bytes: Uint8Array) {}

  done(): boolean {
    return this.pos === this.bytes.length;
  }

  byte(): number {
    const v = this.bytes[this.pos++];
    if (v === undefined) throw new RangeError('コードが途中で終わっている');
    return v;
  }

  u16(): number {
    return (this.byte() << BITS_PER_BYTE) | this.byte();
  }

  uint(): number {
    let n = 0;
    let scale = 1;
    for (let i = 0; i < VARINT_MAX_BYTES; i++) {
      const b = this.byte();
      n += (b % VARINT_BASE) * scale;
      if (b < VARINT_BASE) return n;
      scale *= VARINT_BASE;
    }
    throw new RangeError('整数が長すぎる');
  }

  int(): number {
    const z = this.uint();
    return z % 2 === 0 ? z / 2 : -(z + 1) / 2;
  }

  ratio(): number {
    return this.uint() / RATIO_SCALE;
  }

  text(): string {
    const len = this.uint();
    if (len > MAX_TEXT_BYTES || this.pos + len > this.bytes.length) throw new RangeError('文字列の長さが不正');
    const s = new TextDecoder('utf-8', { fatal: true }).decode(this.bytes.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }
}

/** CRC-16/CCITT-FALSE（多項式 0x1021・初期値 0xFFFF） */
export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << BITS_PER_BYTE;
    for (let i = 0; i < BITS_PER_BYTE; i++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return crc;
}

/** バイト列にチェックサムを付けて、区切り付きの Base32 にする */
export function sealCode(bytes: Uint8Array): string {
  const sealed = new ByteWriter();
  for (const b of bytes) sealed.byte(b);
  sealed.u16(crc16(bytes));
  return groupChars(toBase32(sealed.bytes));
}

export type OpenResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly error: 'format' | 'checksum' };

/** sealCode の逆。使えない文字があれば format、チェックサムが合わなければ checksum */
export function openCode(code: string): OpenResult {
  const all = fromBase32(normalize(code));
  if (!all || all.length <= CHECK_BYTES) return { ok: false, error: 'format' };
  const bytes = all.subarray(0, all.length - CHECK_BYTES);
  const sum = new ByteReader(all.subarray(all.length - CHECK_BYTES)).u16();
  return crc16(bytes) === sum ? { ok: true, bytes } : { ok: false, error: 'checksum' };
}

function normalize(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
}

function groupChars(s: string): string {
  const parts: string[] = [];
  for (let i = 0; i < s.length; i += GROUP) parts.push(s.slice(i, i + GROUP));
  return parts.join('-');
}

function toBase32(bytes: Uint8Array): string {
  let out = '';
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << BITS_PER_BYTE) | b;
    bits += BITS_PER_BYTE;
    while (bits >= BITS_PER_CHAR) {
      bits -= BITS_PER_CHAR;
      out += ALPHABET[(acc >>> bits) & CHAR_MASK];
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(acc << (BITS_PER_CHAR - bits)) & CHAR_MASK];
  return out;
}

/** Base32 をバイト列に戻す。使えない文字があるか、末尾の余りのビットが 0 でなければ null */
function fromBase32(s: string): Uint8Array | null {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << BITS_PER_CHAR) | v;
    bits += BITS_PER_CHAR;
    if (bits >= BITS_PER_BYTE) {
      bits -= BITS_PER_BYTE;
      out.push((acc >>> bits) & BYTE_MASK);
    }
    acc &= (1 << bits) - 1;
  }
  if (bits >= BITS_PER_CHAR || acc !== 0) return null;
  return Uint8Array.from(out);
}
