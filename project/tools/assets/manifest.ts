import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { generatedFiles } from '../../src/assets/catalog';
import { GENERATED_DIR, INPUT_GLOBS, PROJECT_DIR, TOKENS_CSS } from './config';

/**
 * 生成物が最新かどうかをハッシュで判定する。
 * - inputHash: 生成に使う入力（tools/assets・visual.ts など）の中身と、生成に使うパッケージのバージョン
 * - outputs: 生成物それぞれの中身のハッシュ（手で書き換えられていないこと）
 * sharp や meshopt の出力は環境によってバイト単位で揺れうるため、生成物を作り直して比べるのではなく入力で比べる。
 */

export const MANIFEST_PATH = join(GENERATED_DIR, 'manifest.json');

export interface Manifest {
  inputHash: string;
  /** プロジェクトからの相対パス → sha256 */
  outputs: Record<string, string>;
}

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

function listFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? listFiles(path) : [path];
    })
    .sort();
}

/** 入力のハッシュ。改行コードの違いでは変わらないようにする */
export function computeInputHash(): string {
  const files = [
    ...INPUT_GLOBS.dirs.flatMap((d) => listFiles(join(PROJECT_DIR, d))),
    ...INPUT_GLOBS.files.map((f) => join(PROJECT_DIR, f)),
  ];
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(relative(PROJECT_DIR, file).replaceAll('\\', '/'));
    hash.update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n'));
  }
  for (const pkg of INPUT_GLOBS.packages) {
    const json = JSON.parse(readFileSync(join(PROJECT_DIR, 'node_modules', pkg, 'package.json'), 'utf8'));
    hash.update(`${pkg}@${json.version}`);
  }
  return hash.digest('hex');
}

/** manifest に載せる生成物（プロジェクトからの相対パス） */
export function outputPaths(): string[] {
  return [
    relative(PROJECT_DIR, TOKENS_CSS),
    ...generatedFiles().map((f) => relative(PROJECT_DIR, join(GENERATED_DIR, f))),
  ].map((p) => p.replaceAll('\\', '/'));
}

export function buildManifest(): Manifest {
  const outputs: Record<string, string> = {};
  for (const path of outputPaths()) outputs[path] = sha256(readFileSync(join(PROJECT_DIR, path)));
  return { inputHash: computeInputHash(), outputs };
}

export function readManifest(): Manifest | undefined {
  if (!existsSync(MANIFEST_PATH)) return undefined;
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
}

/** 生成物が最新でない理由の一覧（空なら最新） */
export function staleReasons(): string[] {
  const manifest = readManifest();
  if (!manifest) return ['manifest.json がない'];
  const reasons: string[] = [];
  if (manifest.inputHash !== computeInputHash())
    reasons.push('生成の入力（tools/assets・visual.ts など）が変わっている');
  const expected = outputPaths();
  for (const path of expected) {
    const full = join(PROJECT_DIR, path);
    if (!existsSync(full)) reasons.push(`${path} がない`);
    else if (manifest.outputs[path] !== sha256(readFileSync(full))) reasons.push(`${path} が生成時と違う`);
  }
  for (const path of Object.keys(manifest.outputs)) {
    if (!expected.includes(path)) reasons.push(`${path} はカタログにない`);
  }
  return reasons;
}
