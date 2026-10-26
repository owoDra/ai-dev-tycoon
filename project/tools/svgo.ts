import { readFile } from 'node:fs/promises';
import { type Config, optimize } from 'svgo';
import type { Plugin } from 'vite';

/**
 * アイコン SVG の最適化の設定。
 * - 配色に使うクラス（m / s / l / d）と viewBox を残す
 * - mergePaths は無効にする。同じクラスのパスをまとめると、重なった面の線の描画順が変わって輪郭が透けるため
 */
export const svgoConfig: Config = {
  multipass: true,
  plugins: [{ name: 'preset-default', params: { overrides: { mergePaths: false } } }, 'removeDimensions'],
};

export function optimizeSvg(svg: string): string {
  return optimize(svg, svgoConfig).data;
}

/** `*.svg?raw` を svgo で最適化してから文字列として読み込む Vite プラグイン */
export function svgoRaw(): Plugin {
  return {
    name: 'svgo-raw',
    enforce: 'pre',
    async load(id) {
      const [path, query] = id.split('?');
      if (!path?.endsWith('.svg') || query !== 'raw') return null;
      this.addWatchFile(path);
      return `export default ${JSON.stringify(optimizeSvg(await readFile(path, 'utf8')))};`;
    },
  };
}
