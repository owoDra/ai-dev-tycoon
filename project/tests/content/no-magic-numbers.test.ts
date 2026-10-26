import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * バランス用の数値を balance.ts に集約できているかの検査。
 * 計算式・システム・Command・担当モードの定義では、数学定数の 0 と 1 以外の数値リテラルを使わない。
 * 案件・Worker・Model のデータファイル（content/projects・workers.ts・models.ts）はそれ自体がデータなので対象外。
 * rng.ts（ハッシュの定数）・serialize.ts（形式のバージョン）・units.ts（単位換算）はバランス値ではないので除く。
 */
const ROOT = join(import.meta.dirname, '../../src');
const TARGETS = ['core', 'content/assignModes.ts', 'content/validate.ts', 'content/index.ts'];
const EXCLUDED = new Set(['core/rng.ts', 'core/serialize.ts', 'core/units.ts']);
const ALLOWED = new Set(['0', '1']);

function files(path: string): string[] {
  const full = join(ROOT, path);
  if (full.endsWith('.ts')) return [full];
  return readdirSync(full, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(full, f));
}

/** コメントと文字列・テンプレートリテラルを取り除いてから、数値リテラルを拾う */
function numericLiterals(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''");
  return [...code.matchAll(/(?<![\w.])\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?(?![\w])/gi)].map((m) => m[0]);
}

describe('バランス値の集約', () => {
  it('balance.ts 以外の計算式・定義に 0 と 1 以外の数値リテラルがない', () => {
    const found: string[] = [];
    for (const file of TARGETS.flatMap(files)) {
      const rel = relative(ROOT, file);
      if (EXCLUDED.has(rel)) continue;
      for (const n of numericLiterals(readFileSync(file, 'utf8'))) if (!ALLOWED.has(n)) found.push(`${rel}: ${n}`);
    }
    expect(found).toEqual([]);
  });

  it('検査自体が数値リテラルを拾える', () => {
    expect(numericLiterals("const a = 0.25 * x + 1; // 99\nconst s = '42';")).toEqual(['0.25', '1']);
  });
});
