import { outlineColor, type VisualPreset } from '../content/look/visual';
import { mix, rgba } from './color';
import { boxShadow } from './visualVars';

/**
 * デザイントークン。`content/look/visual.ts` のプリセットから導出し、`npm run assets` で `styles/tokens.css`
 * （Tailwind の `@theme`）に書き出す。3D の色もこの関数を使うため、CSS と 3D で値を二重に持たない。
 */

export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type ScaleStep = (typeof SCALE_STEPS)[number];
export type ColorScale = Record<ScaleStep, string>;

/**
 * 1色から 50〜900 の段階を作る。500 が元の色で、明るい側は白、暗い側はパレットの line（濃い紫）へ寄せる。
 * 黒ではなく line へ寄せるのは、暗い段階も画面の他の色となじむようにするため。
 */
export function colorScale(base: string, dark: string): ColorScale {
  const toWhite: Record<number, number> = { 50: 0.9, 100: 0.8, 200: 0.62, 300: 0.42, 400: 0.2 };
  const toDark: Record<number, number> = { 600: 0.18, 700: 0.38, 800: 0.56, 900: 0.72 };
  const scale = {} as ColorScale;
  for (const step of SCALE_STEPS) {
    const w = toWhite[step];
    const d = toDark[step];
    scale[step] = w !== undefined ? mix(base, '#ffffff', w) : d !== undefined ? mix(base, dark, d) : base;
  }
  return scale;
}

/** Neutral は背景（50）から文字色（900）までを混ぜて作る。背景は真っ白ではない薄いトーンになる */
export function neutralScale(preset: VisualPreset): ColorScale {
  const p = preset.palette;
  const t: Record<ScaleStep, number> = {
    50: 0,
    100: 0.06,
    200: 0.14,
    300: 0.26,
    400: 0.4,
    500: 0.54,
    600: 0.66,
    700: 0.78,
    800: 0.89,
    900: 1,
  };
  const scale = {} as ColorScale;
  for (const step of SCALE_STEPS) scale[step] = mix(p.bg, p.text, t[step]);
  return scale;
}

export type ScaleName = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger';

export function colorScales(preset: VisualPreset): Record<ScaleName, ColorScale> {
  const p = preset.palette;
  return {
    neutral: neutralScale(preset),
    primary: colorScale(p.primary, p.line),
    accent: colorScale(p.accent, p.line),
    success: colorScale(p.success.base, p.line),
    warning: colorScale(p.warning.base, p.line),
    danger: colorScale(p.danger.base, p.line),
  };
}

/** 文字サイズのスケール。本文（base）を基準に visual.type.scale の累乗で広げる。sm でも 14px を下回らない */
export function textScale(preset: VisualPreset): Record<string, number> {
  const { baseSize, scale } = preset.type;
  const size = (step: number) => Math.round(baseSize * scale ** step * 10) / 10;
  return {
    sm: Math.max(14, size(-0.5)),
    base: baseSize,
    lg: size(0.5),
    xl: size(1),
    '2xl': size(2),
    '3xl': size(3),
    '4xl': size(4),
    display: size(6),
  };
}

/**
 * 行き過ぎのあるイージング。cubic-bezier の2番目の制御点の y を popOvershoot から決める
 * （1.25 で y≈1.56。一般的な back-out の曲線になる）。
 */
export function popEasing(preset: VisualPreset): string {
  const [x1, y1, x2, y2] = popBezier(preset);
  return `cubic-bezier(${x1}, ${y1.toFixed(2)}, ${x2}, ${y2})`;
}

/** popEasing の制御点。motion の animate() に渡して CSS のトークンと同じ曲線で動かす */
export function popBezier(preset: VisualPreset): [number, number, number, number] {
  const y = 1 + (preset.motion.popOvershoot - 1) * 2.24;
  return [0.34, Number(y.toFixed(2)), 0.64, 1];
}

/** `--ease-out` と `--ease-in-out` の制御点（motion の animate() と CSS で共有する） */
export const EASE_OUT_BEZIER = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_OUT_BEZIER = [0.65, 0, 0.35, 1] as const;
const bezier = (b: readonly number[]) => `cubic-bezier(${b.join(', ')})`;

/** 柔らかい多層の影（浮いたパネル・ツールチップ用）。D1 の影（輪郭のはっきりした影）とは別に用意する */
function softShadow(preset: VisualPreset): string {
  const c = preset.palette.line;
  return [
    `0 1px 2px ${rgba(c, 0.08)}`,
    `0 4px 8px ${rgba(c, 0.08)}`,
    `0 12px 24px ${rgba(c, 0.1)}`,
    `0 24px 48px ${rgba(c, 0.12)}`,
  ].join(', ');
}

export const FONT_SANS =
  'system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, sans-serif';
export const FONT_MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

/** Tailwind の `@theme` に置く変数（名前 → 値）。名前空間は Tailwind v4 のもの（--color-* --radius-* など） */
export function themeTokens(preset: VisualPreset): Record<string, string> {
  const p = preset.palette;
  const tokens: Record<string, string> = {};
  for (const [name, scale] of Object.entries(colorScales(preset))) {
    for (const step of SCALE_STEPS) tokens[`--color-${name}-${step}`] = scale[step];
  }
  Object.assign(tokens, {
    '--color-bg': p.bg,
    '--color-surface': p.surface,
    '--color-sunken': p.sunken,
    '--color-line': p.line,
    '--color-ink': p.text,
    '--color-ink-muted': p.textMuted,
    '--color-on-primary': p.onPrimary,
    '--color-on-accent': p.onAccent,
    '--color-success-ink': p.success.text,
    '--color-success-soft': p.success.soft,
    '--color-warning-ink': p.warning.text,
    '--color-warning-soft': p.warning.soft,
    '--color-danger-ink': p.danger.text,
    '--color-danger-soft': p.danger.soft,
    '--color-outline': outlineColor(preset),
    '--font-sans': FONT_SANS,
    '--font-mono': FONT_MONO,
    '--font-weight-body': String(preset.type.bodyWeight),
    '--font-weight-heading': String(preset.type.headingWeight),
    '--font-weight-number': String(preset.type.numberWeight),
    '--tracking-heading': `${preset.type.headingTracking}em`,
    '--spacing': `${preset.shape.spaceUnit}px`,
    '--radius-sm': `${preset.shape.radiusSm}px`,
    '--radius-md': `${preset.shape.radiusMd}px`,
    '--radius-lg': `${preset.shape.radiusLg}px`,
    '--radius-xl': `${Math.round(preset.shape.radiusLg * 1.5)}px`,
    '--shadow-pop': boxShadow(preset),
    '--shadow-raised': boxShadow(preset, 1.4),
    '--shadow-soft': softShadow(preset),
    '--ease-pop': popEasing(preset),
    '--ease-out': bezier(EASE_OUT_BEZIER),
    '--ease-in-out': bezier(EASE_IN_OUT_BEZIER),
  });
  for (const [name, px] of Object.entries(textScale(preset))) {
    tokens[`--text-${name}`] = `${px}px`;
    // 大きい文字ほど行間を詰める
    tokens[`--text-${name}--line-height`] = px >= 30 ? '1.15' : px >= 20 ? '1.3' : '1.6';
  }
  return tokens;
}

/** `@theme` の名前空間にない変数（:root に置く）。アイコンの線とデュレーション */
export function rootTokens(preset: VisualPreset): Record<string, string> {
  const m = preset.motion;
  return {
    '--outline-width': `${preset.shape.outlineWidth}px`,
    '--icon-stroke': String(preset.icon.strokeWidth),
    '--duration-fast': `${m.fastDuration}ms`,
    '--duration-base': `${m.baseDuration}ms`,
    '--duration-slow': `${m.slowDuration}ms`,
    '--duration-pop': `${m.popDuration}ms`,
  };
}

/** tokens.css の中身 */
export function renderTokensCss(preset: VisualPreset): string {
  const block = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join('\n');
  return [
    '/* 生成物（npm run assets）。直接編集しない。正本は src/content/look/visual.ts、導出は src/styles/tokens.ts */',
    '@theme static {',
    block(themeTokens(preset)),
    '}',
    '',
    ':root {',
    block(rootTokens(preset)),
    '}',
    '',
  ].join('\n');
}

export interface TokenPair {
  fg: string;
  bg: string;
  min: number;
}

/**
 * トークンの段階で文字に使ってよい組み合わせ（名前 → 前景・背景・必要なコントラスト比）。
 * 文字は 700 以上の段階を 50/100 の面に、白文字は使わない（キャンディポップは濃い文字を明るい面に置く）。
 */
export function tokenContrastPairs(preset: VisualPreset): Record<string, TokenPair> {
  const s = colorScales(preset);
  const text = 4.5;
  const nonText = 3;
  const pairs: Record<string, TokenPair> = {
    'neutral-900/neutral-50': { fg: s.neutral[900], bg: s.neutral[50], min: text },
    'neutral-700/neutral-50': { fg: s.neutral[700], bg: s.neutral[50], min: text },
    'neutral-900/neutral-200': { fg: s.neutral[900], bg: s.neutral[200], min: text },
    'neutral-700/surface': { fg: s.neutral[700], bg: preset.palette.surface, min: text },
    'neutral-500/neutral-50(境界)': { fg: s.neutral[500], bg: s.neutral[50], min: nonText },
  };
  for (const name of ['primary', 'accent', 'success', 'warning', 'danger'] as const) {
    pairs[`${name}-800/${name}-50`] = { fg: s[name][800], bg: s[name][50], min: text };
    pairs[`${name}-800/${name}-100`] = { fg: s[name][800], bg: s[name][100], min: text };
    pairs[`${name}-900/${name}-200`] = { fg: s[name][900], bg: s[name][200], min: text };
    pairs[`neutral-900/${name}-500`] = { fg: s.neutral[900], bg: s[name][500], min: text };
  }
  return pairs;
}
