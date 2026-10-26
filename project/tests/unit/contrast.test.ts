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
