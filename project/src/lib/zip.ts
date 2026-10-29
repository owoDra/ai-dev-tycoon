/*
 * zip の読み書き（外部依存なし）。持ち込み（読み込み）とプラグインの書き出しで使う。
 * 書くときは無圧縮（stored）で、読むときは無圧縮と deflate（ブラウザ標準の DecompressionStream('deflate-raw')）に対応する。
 * 目次（central directory）から各ファイルの位置と大きさを読み、ローカルヘッダーの後ろの中身を取り出す。
 * ZIP64・暗号化・分割された zip は扱わない（読めないものは ZipError）。
 */

export interface ZipEntry {
  /** zip の中のパス（区切りは /） */
  readonly path: string;
  readonly data: Uint8Array;
}

export class ZipError extends Error {}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;
/** 汎用ビットフラグの「ファイル名が UTF-8」 */
const UTF8_FLAG = 0x0800;
/** 書き出すファイルの日時（1980-01-01 00:00。同じ中身からは同じ zip にする） */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

let crcTable: Uint32Array | undefined;

/** CRC-32（zip の検査値） */
export function crc32(bytes: Uint8Array): number {
  crcTable ??= Uint32Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const b of bytes) crc = (crcTable[(crc ^ b) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** ファイルの並びを無圧縮の zip にする。並びの順に書く */
export function createZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = encoder.encode(e.path);
    const crc = crc32(e.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, LOCAL_SIG, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, UTF8_FLAG, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, e.data.length, true);
    local.setUint32(22, e.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, e.data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, CENTRAL_SIG, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, UTF8_FLAG, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, 0, true);
    dir.setUint16(14, DOS_DATE, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, e.data.length, true);
    dir.setUint32(24, e.data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + e.data.length;
  }
  const dirSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, END_SIG, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  return concat([...chunks, ...central, new Uint8Array(end.buffer)]);
}

/** 目次の1件 */
interface DirEntry {
  readonly path: string;
  readonly method: number;
  readonly flags: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly offset: number;
}

/** zip の目次を読む（中身は展開しない）。ディレクトリの項目は除く */
export function readZipDirectory(bytes: Uint8Array): DirEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  // 目次の終わりの記録は末尾にある（後ろにコメントが最大 65535 バイト付く）
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === END_SIG) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError('zip の目次が見つからない');
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const out: DirEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== CENTRAL_SIG) throw new ZipError('zip の目次が壊れている');
    const nameLength = view.getUint16(p + 28, true);
    const extra = view.getUint16(p + 30, true);
    const comment = view.getUint16(p + 32, true);
    const path = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    const entry: DirEntry = {
      path,
      flags: view.getUint16(p + 8, true),
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      size: view.getUint32(p + 24, true),
      offset: view.getUint32(p + 42, true),
    };
    if (!path.endsWith('/')) out.push(entry);
    p += 46 + nameLength + extra + comment;
  }
  return out;
}

/**
 * zip を展開する。accept で読むファイルを先に絞る（目次の情報で判断し、断ったファイルは展開しない）。
 * 暗号化されたファイルと、無圧縮・deflate 以外の方式のファイルは飛ばす
 */
export async function readZip(
  bytes: Uint8Array,
  accept: (path: string, size: number) => boolean = () => true,
): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: ZipEntry[] = [];
  for (const e of readZipDirectory(bytes)) {
    if (e.flags & 1 || (e.method !== 0 && e.method !== 8) || !accept(e.path, e.size)) continue;
    if (e.offset + 30 > bytes.length || view.getUint32(e.offset, true) !== LOCAL_SIG) {
      throw new ZipError('zip のファイルが壊れている');
    }
    const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
    const raw = bytes.subarray(start, start + e.compressedSize);
    const data = e.method === 0 ? raw.slice() : await inflateRaw(raw);
    out.push({ path: e.path, data });
  }
  return out;
}

/** deflate（zlib のヘッダーなし）を展開する */
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
