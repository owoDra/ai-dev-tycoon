import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
// Chromium を自分で指定したいとき（Remotion が取得する chrome-headless-shell が動かない環境など）
if (process.env.REMOTION_BROWSER_EXECUTABLE) Config.setBrowserExecutable(process.env.REMOTION_BROWSER_EXECUTABLE);

// ゲームのアイコン（SVG）を `?raw` で文字列として読み込み、ゲームと同じ配色を当てる
Config.overrideWebpackConfig((config) => {
  const rules = (config.module?.rules ?? []).map((rule) =>
    rule && typeof rule === 'object' ? { ...rule, resourceQuery: { not: [/raw/] } } : rule,
  );
  return {
    ...config,
    module: { ...config.module, rules: [{ resourceQuery: /raw/, type: 'asset/source' }, ...rules] },
  };
});
