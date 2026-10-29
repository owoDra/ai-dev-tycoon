import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { viteSingleFile } from 'vite-plugin-singlefile';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';
import { svgoRaw } from './tools/svgo.ts';

/**
 * 単一HTML（index.html 1ファイル）にするビルドのモード。`--mode standalone` は配布用の単一HTML版（npm run build:standalone）で、
 * explore・playtest・analyze も単一HTMLで出す。既定の production（npm run build）は Cloudflare Pages で公開する版で、
 * 画像・glb・JS を別ファイルに分けてキャッシュを効かせ、public/ の紹介動画（project/video で作る）も入れる
 */
const SINGLE_FILE_MODES = ['standalone', 'explore', 'playtest', 'analyze'];

export default defineConfig(({ mode }) => ({
  define: {
    // 紹介動画があるか（ui/IntroVideo.tsx）。単一HTML版には動画を入れない
    __INTRO_VIDEO__: JSON.stringify(!SINGLE_FILE_MODES.includes(mode)),
  },
  plugins: [
    // アイコン SVG（?raw）をビルド時に最適化する
    svgoRaw(),
    solid(),
    tailwindcss(),
    SINGLE_FILE_MODES.includes(mode) && viteSingleFile(),
    // `--mode analyze` はバンドル分析用のビルド（npm run build:analyze）。モジュールごとの大きさを dist-analyze/stats.html に出す
    mode === 'analyze' &&
      visualizer({ filename: 'dist-analyze/stats.html', template: 'treemap', gzipSize: true, emitFile: false }),
    {
      // 比較ページは本番と見分けられるタイトルにする（Artifact の名前にもなる）。いま比べているデザイン決定の名前を付ける
      name: 'explore-title',
      // `--mode playtest` は D5 の通しプレイ用（プレイログを常に有効にした本番と同じゲーム）
      transformIndexHtml: (html) =>
        mode === 'explore'
          ? html.replace(/<title>.*<\/title>/, '<title>タイクーン 画面構成の確認</title>')
          : mode === 'playtest'
            ? html.replace(/<title>.*<\/title>/, '<title>タイクーン D5 通しプレイ</title>')
            : html,
    },
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // `--mode explore` はデザイン比較用のビルド（src/dev/explore）。本番の dist とは別の場所に出す
    outDir:
      mode === 'explore'
        ? 'dist-explore'
        : mode === 'playtest'
          ? 'dist-playtest'
          : mode === 'analyze'
            ? 'dist-analyze'
            : mode === 'standalone'
              ? 'dist-standalone'
              : 'dist',
    target: 'es2022',
    modulePreload: false,
    // 単一HTMLのビルドは、画像・glb・フォントも含めて全アセットを data URI でインライン化し、index.html 1ファイルにする。
    // public/（紹介動画）も入れない
    assetsInlineLimit: SINGLE_FILE_MODES.includes(mode) ? Number.MAX_SAFE_INTEGER : undefined,
    copyPublicDir: !SINGLE_FILE_MODES.includes(mode),
  },
  test: {
    // ファイルシステムのモジュールキャッシュは、中身が変わらないファイル（assets/registry.ts）の import.meta.glob の
    // 結果を使い回すため、生成物を足しても古い一覧のままになる。テストは十分速いので使わない
    fsModuleCache: false,
    // バランステスト（tests/balance）は多くの seed でゲームを最後まで進めるので、既定の 5 秒では足りないことがある。
    // balance:full（--mode balance-full）は seed を増やし、1日 = 24時間の時計で日数ぶんのステップも多いので、さらに長くとる
    testTimeout: mode === 'balance-full' ? 180_000 : 30_000,
    // 既定は node 環境。UI ロジックのテスト（*.dom.test.tsx）だけ jsdom で動かす
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['tests/**/*.test.ts?(x)'],
          exclude: ['tests/**/*.dom.test.tsx'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          include: ['tests/**/*.dom.test.tsx'],
          environment: 'jsdom',
        },
      },
    ],
  },
}));
