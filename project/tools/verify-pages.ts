/**
 * Cloudflare Pages 向けのビルド（npm run build → dist/）の検証：index.html と紹介動画があること・
 * HTML / JS / CSS が外部URLを参照していないこと（tools/verify-dist.ts と同じ判定）・どのファイルも Pages の上限内であること。
 * 判定関数は export してテストし、CLI 部分（ファイル読み込みと終了コード）はファイル末尾に分ける。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findExternalRefs } from './verify-dist';

/** Cloudflare Pages の1ファイルの上限（25 MiB） */
export const PAGES_FILE_LIMIT_BYTES = 25 * 1024 * 1024;

/** dist になければならないファイル（紹介動画とポスター・字幕は public/ から入る） */
export const REQUIRED_FILES = ['index.html', 'intro.mp4', 'intro-poster.jpg', 'intro.vtt'] as const;

/** 外部URLを調べるファイルの拡張子 */
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.css']);

export interface PagesFile {
  /** dist からの相対パス（区切りは /） */
  readonly path: string;
  readonly bytes: number;
}

/** 足りないファイルと、上限を超えるファイル */
export function checkPagesFiles(files: readonly PagesFile[]): { missing: string[]; oversized: string[] } {
  const paths = new Set(files.map((f) => f.path));
  return {
    missing: REQUIRED_FILES.filter((f) => !paths.has(f)),
    oversized: files.filter((f) => f.bytes > PAGES_FILE_LIMIT_BYTES).map((f) => f.path),
  };
}

/** 外部URLを調べるファイルか */
export const isTextAsset = (path: string) => TEXT_EXTENSIONS.has(extname(path));

function listFiles(dir: string, root = dir): PagesFile[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, root);
    return [{ path: relative(root, full).split('\\').join('/'), bytes: statSync(full).size }];
  });
}

const formatMiB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

function main(distDir: string): number {
  const files = listFiles(distDir);
  const errors: string[] = [];
  const { missing, oversized } = checkPagesFiles(files);
  for (const f of missing) errors.push(`${f} が ${distDir} にない`);
  for (const f of oversized)
    errors.push(`${f} が Cloudflare Pages の上限（${formatMiB(PAGES_FILE_LIMIT_BYTES)}）を超えている`);
  for (const file of files.filter((f) => isTextAsset(f.path))) {
    for (const ref of findExternalRefs(readFileSync(resolve(distDir, file.path), 'utf8'))) {
      errors.push(`${file.path} が外部URLを参照している (${ref.kind}) @${ref.index}: ${ref.url}`);
    }
  }
  const total = files.reduce((n, f) => n + f.bytes, 0);
  const largest = [...files].sort((a, b) => b.bytes - a.bytes)[0];
  console.log(
    `dist  ${files.length} ファイル / 合計 ${formatMiB(total)}` +
      (largest ? `（最大 ${largest.path} ${formatMiB(largest.bytes)}）` : ''),
  );
  for (const e of errors) console.error(`✗ ${e}`);
  if (errors.length > 0) return 1;
  console.log('✓ verify:pages OK（必要なファイルあり・外部参照なし・ファイルの上限内）');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const defaultDist = fileURLToPath(new URL('../dist', import.meta.url));
  process.exit(main(resolve(process.argv[2] ?? defaultDist)));
}
