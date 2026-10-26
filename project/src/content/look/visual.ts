/**
 * ビジュアルの方向性のプリセット（配色・質感・アイコンの画風・文字の階層）。
 * トークン（CSS 変数）・アイコン・3D の色はここを正本にして導出する。
 */

/** 状態色1つ分。base はアイコンや塗り、text は soft の上や白いカードの上に置く文字色 */
export interface StatusColor {
  base: string;
  text: string;
  soft: string;
}

export interface VisualPalette {
  /** 画面の背景（真っ白ではない薄いトーン） */
  bg: string;
  /** カードの面 */
  surface: string;
  /** 一段沈んだ面（入力欄・バーの溝・床） */
  sunken: string;
  /** カードの境界線とアイコンの輪郭 */
  line: string;
  text: string;
  textMuted: string;
  /** 操作できるもの */
  primary: string;
  onPrimary: string;
  /** 強調・ハイライト（大きな数字・選択中） */
  accent: string;
  onAccent: string;
  success: StatusColor;
  warning: StatusColor;
  danger: StatusColor;
}

/** 太い線のフラット（ステッカー） / ぷっくりしたクレイ調 / 2トーン＋グラデーション */
export type IconStyle = 'sticker' | 'clay' | 'duotone';

export interface VisualShape {
  /** 角丸（px）。小さい部品・カード・大きなパネル */
  radiusSm: number;
  radiusMd: number;
  radiusLg: number;
  /** アウトラインの太さ（px）。0 で線なし */
  outlineWidth: number;
  /** アウトラインの色。'line' はパレットの line を使う */
  outlineColor: string;
  /** 余白の単位（px）。余白のスケールはこの倍数にする */
  spaceUnit: number;
}

export interface VisualShadow {
  /** 影の落ちる距離（px） */
  offsetY: number;
  /** ぼかし（px）。0 にすると輪郭のはっきりした影になる */
  blur: number;
  /** 不透明度（0〜1） */
  opacity: number;
  /** 重ねる層の数。多いほど柔らかく広がる */
  layers: number;
  color: string;
  /** 面の内側のハイライトと陰（0〜1）。ぷっくりした立体感を出す */
  innerLight: number;
  /** ボタンを押したときに沈む量（px） */
  pressDepth: number;
}

export interface VisualSurface {
  /** 面とボタンのグラデーションの強さ（0〜1） */
  gradient: number;
  /** イラストの側面を暗くする量（0〜1） */
  sideShade: number;
}

export interface VisualIcon {
  style: IconStyle;
  /** 線の太さ（viewBox 48 に対する値） */
  strokeWidth: number;
}

export interface VisualType {
  /** 本文の文字サイズ（px） */
  baseSize: number;
  /** 見出しの拡大率。h2 = base × scale²、h1 = base × scale³ */
  scale: number;
  headingWeight: number;
  bodyWeight: number;
  numberWeight: number;
  /** 見出しの字間（em） */
  headingTracking: number;
}

export interface VisualMotion {
  /** 大きな数字が出るときの行き過ぎ（1 で行き過ぎなし） */
  popOvershoot: number;
  /** 演出の長さ（ms） */
  popDuration: number;
  /** UI の切り替えの長さ（ms）。ホバーなどの小さな反応 / パネルの開閉 / 画面の切り替え */
  fastDuration: number;
  baseDuration: number;
  slowDuration: number;
}

export interface VisualPreset {
  palette: VisualPalette;
  shape: VisualShape;
  shadow: VisualShadow;
  surface: VisualSurface;
  icon: VisualIcon;
  type: VisualType;
  motion: VisualMotion;
}

/** A: キャンディポップ（高彩度・太めのアウトライン・遊び心が強い） */
const candyPop: VisualPreset = {
  palette: {
    bg: '#fff4e8',
    surface: '#ffffff',
    sunken: '#ffe6d1',
    line: '#2a1b3d',
    text: '#2a1b3d',
    textMuted: '#5f4d73',
    primary: '#ff4f8b',
    onPrimary: '#2a1b3d',
    accent: '#ffd23f',
    onAccent: '#2a1b3d',
    success: { base: '#22c77a', text: '#0b6b3e', soft: '#d6f8e6' },
    warning: { base: '#ffa928', text: '#874600', soft: '#fff0cc' },
    danger: { base: '#ff4d5e', text: '#b0152a', soft: '#ffe1e4' },
  },
  shape: { radiusSm: 10, radiusMd: 16, radiusLg: 24, outlineWidth: 3, outlineColor: 'line', spaceUnit: 4 },
  shadow: { offsetY: 5, blur: 0, opacity: 1, layers: 1, color: '#2a1b3d', innerLight: 0.35, pressDepth: 4 },
  surface: { gradient: 0.1, sideShade: 0.28 },
  icon: { style: 'sticker', strokeWidth: 3.2 },
  type: { baseSize: 16, scale: 1.3, headingWeight: 900, bodyWeight: 500, numberWeight: 900, headingTracking: -0.01 },
  motion: { popOvershoot: 1.25, popDuration: 650, fastDuration: 120, baseDuration: 220, slowDuration: 380 },
};

/**
 * 比較ページで切り替えられる案。ID は切り替えボタンと URL ハッシュで使う。
 * D1 で A（キャンディポップ）を採用し、不採用の案は削除した。新しい案を探索するときはここに足す。
 */
export const visualPresets = { A: candyPop } as const satisfies Record<string, VisualPreset>;

export type VisualPresetId = keyof typeof visualPresets;

/** 既定のプリセット（D1 で採用した案） */
export const defaultVisualPresetId: VisualPresetId = 'A';

/** ゲームの見た目の正本。トークン・アイコン・3D の色はこの値から導出する */
export const visual: VisualPreset = visualPresets[defaultVisualPresetId];

export interface ContrastPair {
  /** 組み合わせの ID（i18n の explore.d1.contrast のキー） */
  id: string;
  fg: string;
  bg: string;
  /** 必要なコントラスト比 */
  min: number;
}

/**
 * コントラストを満たすべき文字色と背景色の組み合わせ。
 * 文字は 4.5:1、操作できる部品の境界は 3:1 を求める。
 * 境界は、2px 以上のアウトラインがあればその線、なければボタンの面で判定する。
 */
export function contrastPairs(preset: VisualPreset): ContrastPair[] {
  const p = preset.palette;
  const text = 4.5;
  const nonText = 3;
  const boundary = preset.shape.outlineWidth >= 2 ? outlineColor(preset) : p.primary;
  return [
    { id: 'textOnBg', fg: p.text, bg: p.bg, min: text },
    { id: 'textOnSurface', fg: p.text, bg: p.surface, min: text },
    { id: 'mutedOnSurface', fg: p.textMuted, bg: p.surface, min: text },
    { id: 'mutedOnBg', fg: p.textMuted, bg: p.bg, min: text },
    { id: 'textOnSunken', fg: p.text, bg: p.sunken, min: text },
    { id: 'onPrimary', fg: p.onPrimary, bg: p.primary, min: text },
    { id: 'onAccent', fg: p.onAccent, bg: p.accent, min: text },
    { id: 'successText', fg: p.success.text, bg: p.success.soft, min: text },
    { id: 'warningText', fg: p.warning.text, bg: p.warning.soft, min: text },
    { id: 'dangerText', fg: p.danger.text, bg: p.danger.soft, min: text },
    { id: 'successOnSurface', fg: p.success.text, bg: p.surface, min: text },
    { id: 'dangerOnSurface', fg: p.danger.text, bg: p.surface, min: text },
    { id: 'buttonBoundary', fg: boundary, bg: p.bg, min: nonText },
  ];
}

/** アウトラインの実際の色 */
export function outlineColor(preset: VisualPreset): string {
  return preset.shape.outlineColor === 'line' ? preset.palette.line : preset.shape.outlineColor;
}
