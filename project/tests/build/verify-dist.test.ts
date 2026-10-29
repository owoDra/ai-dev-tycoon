import { describe, expect, it } from 'vitest';
import {
  checkFiles,
  checkSize,
  findExternalRefs,
  GZIP_BUDGET_BYTES,
  measure,
  RAW_BUDGET_BYTES,
} from '../../tools/verify-dist';

describe('findExternalRefs: 外部URLを検出する', () => {
  it.each([
    ['script の src', '<script src="https://cdn.example.com/a.js"></script>', 'src'],
    ['img の src（引用符なし）', '<img src=http://example.com/a.png>', 'src'],
    ['img の srcset', '<img srcset="https://example.com/a.png 2x">', 'src'],
    ['link の href', '<link rel="stylesheet" href="https://fonts.example.com/a.css">', 'href'],
    ['SVG の xlink:href', '<use xlink:href="https://example.com/s.svg#i"/>', 'href'],
    ['JS での src 代入', 'el.src="https://example.com/a.mp3"', 'src'],
    ['CSS の url()', '.a{background:url(https://example.com/a.webp)}', 'url()'],
    ['CSS の url()（引用符あり）', ".a{background:url('http://example.com/a.webp')}", 'url()'],
    ['CSS の @import', '@import "https://example.com/a.css";', 'import'],
    ['ES の静的 import', 'import x from "https://esm.example.com/x.js";', 'import'],
    ['ES の動的 import', 'await import("https://esm.example.com/x.js")', 'import'],
    ['JS 文字列内のエスケープされた属性', 'x.innerHTML="<img src=\\"https://example.com/a.png\\">"', 'src'],
  ])('%s', (_, html, kind) => {
    const refs = findExternalRefs(html);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.kind).toBe(kind);
    expect(refs[0]?.url).toMatch(/^https?:\/\/[^'"]+$/);
  });

  it('複数の参照を出現順にすべて返す', () => {
    const html = '<link href="https://a.example/a.css"><script src="https://b.example/b.js"></script>';
    expect(findExternalRefs(html).map((r) => r.url)).toEqual(['https://a.example/a.css', 'https://b.example/b.js']);
  });
});

describe('findExternalRefs: 外部URLでないものは検出しない', () => {
  it.each([
    ['SVG の xmlns', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>'],
    ['JS の createElementNS', 'document.createElementNS("http://www.w3.org/2000/svg","svg")'],
    [
      'data URI の SVG 内の xmlns',
      `.a{background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E")}`,
    ],
    ['data URI の src', '<img src="data:image/webp;base64,AAAA">'],
    ['相対パスとフラグメント', '<a href="#top">top</a><img src="./a.png">'],
    ['コメントや文字列中のURL', '// see https://example.com/docs\nconst s = "https://example.com";'],
  ])('%s', (_, html) => {
    expect(findExternalRefs(html)).toEqual([]);
  });
});

describe('checkFiles', () => {
  it('index.html だけなら問題なし', () => {
    expect(checkFiles(['index.html'])).toEqual({ unexpected: [], missing: [] });
  });

  it('余分なファイルを unexpected として返す', () => {
    expect(checkFiles(['index.html', 'assets', 'favicon.svg']).unexpected).toEqual(['assets', 'favicon.svg']);
  });

  it('index.html が無ければ missing として返す', () => {
    expect(checkFiles([]).missing).toEqual(['index.html']);
  });
});

describe('checkSize: サイズ予算', () => {
  it('予算ちょうどは許容する', () => {
    expect(checkSize(RAW_BUDGET_BYTES, GZIP_BUDGET_BYTES)).toMatchObject({ rawOk: true, gzipOk: true });
  });

  it('raw が1バイトでも超えたら NG', () => {
    expect(checkSize(RAW_BUDGET_BYTES + 1, 0)).toMatchObject({ rawOk: false, gzipOk: true });
  });

  it('gzip が1バイトでも超えたら NG', () => {
    expect(checkSize(0, GZIP_BUDGET_BYTES + 1)).toMatchObject({ rawOk: true, gzipOk: false });
  });

  it('予算は raw 2200KiB・gzip 780KiB（Phase 17 で raw 3.0MB・gzip 1.2MB から締め、Phase 42 の前に持ち込みと書き出しの分を足した）', () => {
    expect(RAW_BUDGET_BYTES).toBe(2200 * 1024);
    expect(GZIP_BUDGET_BYTES).toBe(780 * 1024);
  });
});

describe('measure', () => {
  it('raw はバイト数、gzip は圧縮後のバイト数を返す', () => {
    const content = Buffer.from('あ'.repeat(10_000));
    const { rawBytes, gzipBytes } = measure(content);
    expect(rawBytes).toBe(30_000);
    expect(gzipBytes).toBeGreaterThan(0);
    expect(gzipBytes).toBeLessThan(rawBytes);
  });
});
