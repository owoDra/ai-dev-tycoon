import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { BringFile } from '../../src/core/bring';

/** 持ち込みの例（実在する形の .claude/ を含むプロジェクト）のフォルダ */
export const BRING_FIXTURE = join(import.meta.dirname, '../fixtures/bring/project');

/** フォルダの中のファイルをすべて読む（フォルダの選択で読み込んだのと同じく、選んだフォルダからの相対パスにする） */
export function readFixture(dir: string = BRING_FIXTURE): BringFile[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const full = join(e.parentPath, e.name);
      return { path: relative(dir, full).split('\\').join('/'), text: readFileSync(full, 'utf8') };
    });
}
