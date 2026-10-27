import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastPairs, defaultVisualPresetId, visual, visualPresets } from '../../src/content/look/visual';
import {
  AA_NON_TEXT,
  AA_TEXT,
  contrastRatio,
  mix,
  parseHex,
  relativeLuminance,
  shade,
  toHex,
} from '../../src/styles/color';
import { colorScales, renderTokensCss, SCALE_STEPS, textScale, tokenContrastPairs } from '../../src/styles/tokens';

describe('色の計算', () => {
  it('#rrggbb を読み書きできる', () => {
    expect(parseHex('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(toHex({ r: 255, g: 128, b: 0 })).toBe('#ff8000');
    expect(() => parseHex('red')).toThrow();
  });

  it('mix と shade は両端で元の色・白・黒になる', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(shade('#336699', 1)).toBe('#ffffff');
    expect(shade('#336699', -1)).toBe('#000000');
    expect(shade('#336699', 0)).toBe('#336699');
  });

  it('相対輝度は黒で 0、白で 1', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
  });

  it('コントラスト比は白黒で 21、同色で 1、引数の順序によらない', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
    expect(contrastRatio('#2a1b3d', '#ffd23f')).toBeCloseTo(contrastRatio('#ffd23f', '#2a1b3d'), 10);
  });

  it('WCAG の既知の値と一致する（#767676 は白に対して 4.54:1）', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});

describe('プリセットの配色が WCAG AA を満たす', () => {
  it('検査する組み合わせは文字 4.5:1・部品の境界 3:1', () => {
    const mins = new Set(contrastPairs(visualPresets[defaultVisualPresetId]).map((p) => p.min));
    expect(mins).toEqual(new Set([AA_TEXT, AA_NON_TEXT]));
  });

  for (const [id, preset] of Object.entries(visualPresets)) {
    it.each(contrastPairs(preset).map((p) => [p.id, p] as const))(`案${id}: %s`, (_, pair) => {
      expect(contrastRatio(pair.fg, pair.bg)).toBeGreaterThanOrEqual(pair.min);
    });
  }
});

describe('採用した配色（D1: A キャンディポップ）が WCAG AA を満たす', () => {
  it('既定値は採用した案を指している', () => {
    expect(visual).toBe(visualPresets[defaultVisualPresetId]);
    expect(defaultVisualPresetId).toBe('A');
  });

  it.each(contrastPairs(visual).map((p) => [p.id, p] as const))('%s', (_, pair) => {
    expect(contrastRatio(pair.fg, pair.bg)).toBeGreaterThanOrEqual(pair.min);
  });

  it('太いアウトラインがあるため、ボタンの境界はアウトラインの色で判定している', () => {
    const boundary = contrastPairs(visual).find((p) => p.id === 'buttonBoundary');
    expect(visual.shape.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(boundary?.fg).toBe(visual.palette.line);
  });
});

describe('デザイントークン（styles/tokens.css）', () => {
  it.each(Object.entries(tokenContrastPairs(visual)))('文字に使える組み合わせ %s が WCAG AA を満たす', (_, pair) => {
    expect(contrastRatio(pair.fg, pair.bg)).toBeGreaterThanOrEqual(pair.min);
  });

  it('tokens.css は visual.ts から生成した内容と一致する（値を二重に管理しない）', () => {
    const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
    expect(css).toBe(renderTokensCss(visual));
  });

  it('各色の 50〜900 は明るい順に並び、500 は元の色', () => {
    const scales = colorScales(visual);
    expect(scales.primary[500]).toBe(visual.palette.primary);
    expect(scales.success[500]).toBe(visual.palette.success.base);
    expect(scales.neutral[50]).toBe(visual.palette.bg);
    expect(scales.neutral[50]).not.toBe('#ffffff');
    for (const scale of Object.values(scales)) {
      const lum = SCALE_STEPS.map((s) => relativeLuminance(scale[s]));
      for (let i = 1; i < lum.length; i++) expect(lum[i]).toBeLessThan(lum[i - 1] ?? 0);
    }
  });

  it('本文の文字サイズは 16px 以上、最小の文字も 14px 以上', () => {
    const scale = textScale(visual);
    expect(scale.base).toBeGreaterThanOrEqual(16);
    expect(Math.min(...Object.values(scale))).toBeGreaterThanOrEqual(14);
  });

  it('フォントは system-ui 系のみ（外部フォントを読み込まない）', () => {
    const css = renderTokensCss(visual);
    expect(css).toMatch(/--font-sans: system-ui,/);
    expect(css).not.toMatch(/@font-face|url\(/);
  });
});

/**
 * UI のコンポーネント（src/ui・src/app）で、同じ要素に付けた文字色（text-*）と背景色（bg-*）のトークンの組み合わせを
 * すべて集めて検査する。状態の変化（hover: など）で付くクラスは、その状態の組み合わせとして別に数える
 */
describe('UI で使っている文字色と背景色の組み合わせが WCAG AA を満たす', () => {
  const srcDir = fileURLToPath(new URL('../../src/', import.meta.url));
  const colors: Record<string, string> = { white: '#ffffff', black: '#000000' };
  for (const m of renderTokensCss(visual).matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})/g)) {
    if (m[1] && m[2]) colors[m[1]] = m[2];
  }
  const files = ['ui', 'app'].flatMap((d) =>
    readdirSync(join(srcDir, d), { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => join(d, f)),
  );
  const pairs: Array<[string, { fg: string; bg: string }]> = [];
  for (const file of files) {
    const src = readFileSync(join(srcDir, file), 'utf8');
    for (const m of src.matchAll(/class(?:List)?=\{?[`'"]([^`'"]+)[`'"]/g)) {
      const byVariant = new Map<string, { fg?: string; bg?: string }>();
      for (const c of (m[1] ?? '').split(/\s+/)) {
        const [variant, token] = c.includes(':')
          ? [c.slice(0, c.lastIndexOf(':')), c.slice(c.lastIndexOf(':') + 1)]
          : ['', c];
        const entry = byVariant.get(variant) ?? {};
        const fg = token.match(/^text-([a-z0-9-]+)$/)?.[1];
        const bg = token.match(/^bg-([a-z0-9-]+)$/)?.[1];
        if (fg && colors[fg]) entry.fg = fg;
        if (bg && colors[bg]) entry.bg = bg;
        byVariant.set(variant, entry);
      }
      const base = byVariant.get('') ?? {};
      for (const [variant, e] of byVariant) {
        const fg = e.fg ?? base.fg;
        const bg = e.bg ?? base.bg;
        if (!fg || !bg) continue;
        const line = src.slice(0, m.index).split('\n').length;
        pairs.push([`${file}:${line} ${variant ? `${variant}:` : ''}text-${fg}/bg-${bg}`, { fg, bg }]);
      }
    }
  }

  it('検査する組み合わせが見つかる', () => {
    expect(pairs.length).toBeGreaterThan(0);
  });

  it.each(pairs)('%s', (_, { fg, bg }) => {
    expect(contrastRatio(colors[fg] ?? '', colors[bg] ?? '')).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
