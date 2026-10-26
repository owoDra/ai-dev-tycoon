/**
 * SVG アイコンセット。`assets/icons/<name>.svg` を `?raw` で読み込む（ビルド時に svgo で最適化される。tools/assets/svgo.ts）。
 * SVG は色を持たず、面と線をクラスで示す（m: 主要な面 / s: 小さな面 / l: 線 / d: 濃い点）。
 * 配色は styles/icons.css が currentColor とトークンの CSS 変数で決める。
 */

/** アイコンの色調。mono は文字色（currentColor）の線だけで描き、色の付いたボタンの中などで使う */
export type IconTone = 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral' | 'mono';

/** アイコン名と既定の色調。アイコンを足すときは SVG を置いてここに1行足す（tests/unit/icons.test.ts が対応を検査する） */
export const iconTones = {
  human: 'primary',
  ai: 'accent',
  review: 'accent',
  workflow: 'primary',
  context: 'warning',
  skill: 'success',
  hook: 'warning',
  tool: 'neutral',
  eval: 'danger',
  subagent: 'accent',
  permission: 'warning',
  seat: 'primary',
  model: 'accent',
  money: 'success',
  clock: 'primary',
  warning: 'warning',
  success: 'success',
  failure: 'danger',
  bottleneck: 'danger',
  automation: 'success',
  session: 'primary',
  handoff: 'accent',
  project: 'warning',
  qa: 'success',
  implementation: 'primary',
  design: 'accent',
  research: 'primary',
  requirements: 'success',
  release: 'danger',
  defect: 'danger',
} as const satisfies Record<string, Exclude<IconTone, 'mono'>>;

export type IconName = keyof typeof iconTones;
export const iconNames = Object.keys(iconTones) as IconName[];

const sources = import.meta.glob<string>('./icons/*.svg', { eager: true, query: '?raw', import: 'default' });

/** アイコンの SVG 文字列（最適化済み） */
export function iconSvg(name: IconName): string {
  const svg = sources[`./icons/${name}.svg`];
  if (svg === undefined) throw new Error(`アイコンがない: ${name}`);
  return svg;
}

/** 読み込んだ SVG ファイルの名前（拡張子なし）。テストで iconTones との対応を確かめるために使う */
export function iconSourceNames(): string[] {
  return Object.keys(sources).map((path) => path.replace(/^\.\/icons\/(.+)\.svg$/, '$1'));
}
