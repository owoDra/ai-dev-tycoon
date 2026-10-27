/**
 * dist の検証：index.html 1ファイルだけであること・外部URLを参照していないこと・サイズ予算内であること。
 * 判定関数は export してテストし、CLI 部分（ファイル読み込みと終了コード）はファイル末尾に分ける。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

/**
 * 非圧縮サイズの予算（バイト）。Phase 17 で実測（約 1.75 MiB）に 1 割ほどの余裕を足した値に締めた。
 * モジュールごとの大きさは `npm run build:analyze`（dist-analyze/stats.html）で確かめる
 */
export const RAW_BUDGET_BYTES = 2000 * 1024;
/** gzip 後サイズの予算（バイト）。Phase 17 で実測（約 655 KiB）に 1 割ほどの余裕を足した値に締めた */
export const GZIP_BUDGET_BYTES = 720 * 1024;

export const EXPECTED_FILES = ['index.html'] as const;

export type ExternalRefKind = 'src' | 'href' | 'url()' | 'import';

export interface ExternalRef {
  kind: ExternalRefKind;
  url: string;
  /** HTML 内の出現位置（文字オフセット） */
  index: number;
}

/**
 * 外部URLへの参照を検出するパターン。
 * 読み込みを起こす文脈（src / href 属性・代入、CSS の url() と @import、ES の import）だけを対象にする。
 * そのため SVG の `xmlns="http://www.w3.org/2000/svg"` や JS 内の単なる文字列は検出しない。
 */
const PATTERNS: ReadonlyArray<{ kind: ExternalRefKind; re: RegExp }> = [
  { kind: 'src', re: /\bsrc(?:set)?\s*=\s*\\?['"]?\s*(https?:\/\/[^\s'"\\>)]+)/gi },
  { kind: 'href', re: /\bhref\s*=\s*\\?['"]?\s*(https?:\/\/[^\s'"\\>)]+)/gi },
  { kind: 'url()', re: /\burl\(\s*\\?['"]?\s*(https?:\/\/[^\s'"\\)]+)/gi },
  { kind: 'import', re: /@import\s+\\?['"]\s*(https?:\/\/[^\s'"\\]+)/gi },
  { kind: 'import', re: /(?<!@)\b(?:import|from)\s*\(?\s*\\?['"`]\s*(https?:\/\/[^\s'"`\\]+)/g },
];

/** HTML（インライン化された JS・CSS を含む）から外部URLへの参照を出現順に返す */
export function findExternalRefs(html: string): ExternalRef[] {
  const refs: ExternalRef[] = [];
  for (const { kind, re } of PATTERNS) {
    for (const m of html.matchAll(re)) {
      refs.push({ kind, url: m[1] ?? '', index: m.index });
    }
  }
  return refs.sort((a, b) => a.index - b.index);
}

/** 期待するファイル以外が dist にあれば、その名前を返す。期待するファイルが無い場合は missing に入る */
export function checkFiles(files: readonly string[]): { unexpected: string[]; missing: string[] } {
  const expected: readonly string[] = EXPECTED_FILES;
  return {
    unexpected: files.filter((f) => !expected.includes(f)),
    missing: expected.filter((f) => !files.includes(f)),
  };
}

export interface SizeReport {
  rawBytes: number;
  gzipBytes: number;
  rawOk: boolean;
  gzipOk: boolean;
}

/** サイズを予算と比較する。予算ちょうどは許容する */
export function checkSize(rawBytes: number, gzipBytes: number): SizeReport {
  return {
    rawBytes,
    gzipBytes,
    rawOk: rawBytes <= RAW_BUDGET_BYTES,
    gzipOk: gzipBytes <= GZIP_BUDGET_BYTES,
  };
}

export function measure(content: Buffer): { rawBytes: number; gzipBytes: number } {
  return { rawBytes: content.byteLength, gzipBytes: gzipSync(content, { level: 9 }).byteLength };
}

const formatKiB = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;

function main(distDir: string): number {
  const errors: string[] = [];

  const { unexpected, missing } = checkFiles(readdirSync(distDir));
  if (unexpected.length > 0) errors.push(`index.html 以外のファイルがある: ${unexpected.join(', ')}`);
  if (missing.length > 0) {
    console.error(`✗ ${missing.join(', ')} が ${distDir} にない`);
    return 1;
  }

  const content = readFileSync(resolve(distDir, 'index.html'));
  for (const ref of findExternalRefs(content.toString('utf8'))) {
    errors.push(`外部URLを参照している (${ref.kind}) @${ref.index}: ${ref.url}`);
  }

  const { rawBytes, gzipBytes } = measure(content);
  const size = checkSize(rawBytes, gzipBytes);
  console.log(
    `${basename(distDir)}/index.html  raw ${formatKiB(size.rawBytes)} / ${formatKiB(RAW_BUDGET_BYTES)}` +
      `  gzip ${formatKiB(size.gzipBytes)} / ${formatKiB(GZIP_BUDGET_BYTES)}`,
  );
  if (!size.rawOk) errors.push('raw サイズが予算を超えている');
  if (!size.gzipOk) errors.push('gzip サイズが予算を超えている');

  for (const e of errors) console.error(`✗ ${e}`);
  if (errors.length > 0) return 1;
  console.log('✓ verify:dist OK（単一ファイル・外部参照なし・サイズ予算内）');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const defaultDist = fileURLToPath(new URL('../dist', import.meta.url));
  process.exit(main(resolve(process.argv[2] ?? defaultDist)));
}
