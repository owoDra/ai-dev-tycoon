import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { iconNames, iconSourceNames, iconSvg, iconTones } from '../../src/assets/icons';
import { ja } from '../../src/i18n/ja';
import { optimizeSvg } from '../../tools/svgo';

const ICON_DIR = new URL('../../src/assets/icons/', import.meta.url);
const files = readdirSync(ICON_DIR).filter((f) => f.endsWith('.svg'));
const sources = Object.fromEntries(
  files.map((f) => [f.replace(/\.svg$/, ''), readFileSync(new URL(f, ICON_DIR), 'utf8')]),
);

/** 配色に使うクラス（styles/icons.css）。m: 主要な面 / s: 小さな面 / l: 線 / d: 濃い点 */
const PAINT_CLASSES = new Set(['m', 's', 'l', 'd']);

describe('アイコンセット', () => {
  it('約30個あり、SVG ファイルと iconTones が1対1で対応する', () => {
    expect(iconNames.length).toBeGreaterThanOrEqual(28);
    expect(iconNames.length).toBeLessThanOrEqual(40);
    expect(new Set(Object.keys(sources))).toEqual(new Set(iconNames));
    expect(new Set(iconSourceNames())).toEqual(new Set(iconNames));
  });

  it('すべてのアイコンに日本語のラベルがある', () => {
    for (const name of iconNames) expect(ja.icons[name], name).toBeTruthy();
  });

  it.each(Object.entries(sources))('%s: 全アイコンが同じ viewBox（0 0 48 48）を持つ', (_, svg) => {
    const viewBoxes = [...svg.matchAll(/viewBox="([^"]+)"/g)].map((m) => m[1]);
    expect(viewBoxes).toEqual(['0 0 48 48']);
  });

  it.each(Object.entries(sources))('%s: 外部参照（href="http など）がない', (_, svg) => {
    expect(svg).not.toMatch(/href\s*=\s*["']https?:/i);
    expect(svg).not.toMatch(/url\(\s*["']?https?:/i);
    expect(svg).not.toMatch(/<(image|script|foreignObject|use)\b/i);
  });

  it.each(Object.entries(sources))(
    '%s: 色を直接持たず、配色のクラスだけで塗る（currentColor とトークンで色を変えられる）',
    (_, svg) => {
      expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(svg).not.toMatch(/\b(fill|stroke)\s*=/);
      expect(svg).not.toMatch(/\bstyle\s*=/);
      const shapes = [...svg.matchAll(/<(path|circle|rect|ellipse|polygon|polyline|line)\b([^>]*)>/g)];
      expect(shapes.length).toBeGreaterThan(0);
      for (const [, , attrs] of shapes) {
        const cls = /class="([^"]+)"/.exec(attrs ?? '')?.[1];
        expect(PAINT_CLASSES.has(cls ?? ''), `class="${cls}"`).toBe(true);
      }
    },
  );

  it.each(Object.entries(sources))('%s: svgo で最適化しても viewBox と配色のクラスが残り、小さくなる', (name, svg) => {
    const optimized = optimizeSvg(svg);
    expect(optimized).toContain('viewBox="0 0 48 48"');
    expect(optimized).toMatch(/class="[msld]"/);
    expect(optimized.length).toBeLessThanOrEqual(svg.length);
    // ランタイムが読み込むのは最適化後の SVG（Vite プラグインが ?raw を最適化する）
    expect(iconSvg(name as keyof typeof iconTones)).toBe(optimized);
  });
});

describe('アイコンの配色（styles/icons.css）', () => {
  const css = readFileSync(new URL('../../src/styles/icons.css', import.meta.url), 'utf8');

  it('既定の色調はすべて icons.css で定義されている', () => {
    for (const tone of new Set(Object.values(iconTones))) expect(css).toContain(`[data-tone="${tone}"]`);
    expect(css).toContain('[data-tone="mono"]');
  });

  it('色はトークンの CSS 変数と currentColor だけを使う', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).toContain('currentColor');
    expect(css).toMatch(/var\(--color-[a-z]+-\d{3}\)/);
  });
});
