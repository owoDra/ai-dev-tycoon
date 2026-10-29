import { describe, expect, it } from 'vitest';
import { checkPagesFiles, isTextAsset, PAGES_FILE_LIMIT_BYTES, REQUIRED_FILES } from '../../tools/verify-pages';

const required = REQUIRED_FILES.map((path) => ({ path, bytes: 1024 }));

describe('checkPagesFiles', () => {
  it('必要なファイルがそろい、上限内なら問題なし', () => {
    expect(checkPagesFiles([...required, { path: 'assets/index-abc.js', bytes: 500_000 }])).toEqual({
      missing: [],
      oversized: [],
    });
  });

  it('紹介動画がなければ missing に入る', () => {
    expect(checkPagesFiles(required.filter((f) => f.path !== 'intro.mp4')).missing).toEqual(['intro.mp4']);
  });

  it('Cloudflare Pages の上限を超えるファイルを oversized に入れる（上限ちょうどは通す）', () => {
    const files = [
      ...required.filter((f) => f.path !== 'intro.mp4'),
      { path: 'intro.mp4', bytes: PAGES_FILE_LIMIT_BYTES + 1 },
      { path: 'assets/a.glb', bytes: PAGES_FILE_LIMIT_BYTES },
    ];
    expect(checkPagesFiles(files).oversized).toEqual(['intro.mp4']);
  });
});

describe('isTextAsset', () => {
  it.each([
    ['index.html', true],
    ['assets/index-abc.js', true],
    ['assets/index-abc.css', true],
    ['intro.mp4', false],
    ['assets/floor@2x-abc.webp', false],
  ])('%s → %s', (path, expected) => {
    expect(isTextAsset(path)).toBe(expected);
  });
});
