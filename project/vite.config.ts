import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';
import { svgoRaw } from './tools/svgo.ts';

export default defineConfig(({ mode }) => ({
  plugins: [
    // アイコン SVG（?raw）をビルド時に最適化する
    svgoRaw(),
    solid(),
    tailwindcss(),
    viteSingleFile(),
    {
      // 比較ページは本番と見分けられるタイトルにする（Artifact の名前にもなる）。いま比べているデザイン決定の名前を付ける
      name: 'explore-title',
      // `--mode playtest` は D5 の通しプレイ用（プレイログを常に有効にした本番と同じゲーム）
      transformIndexHtml: (html) =>
        mode === 'explore'
          ? html.replace(/<title>.*<\/title>/, '<title>タイクーン D4 比較</title>')
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
    outDir: mode === 'explore' ? 'dist-explore' : mode === 'playtest' ? 'dist-playtest' : 'dist',
    target: 'es2022',
    modulePreload: false,
    // 画像・glb・フォントも含めて全アセットを data URI でインライン化し、dist を index.html 1ファイルにする
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
  test: {
    // ファイルシステムのモジュールキャッシュは、中身が変わらないファイル（assets/registry.ts）の import.meta.glob の
    // 結果を使い回すため、生成物を足しても古い一覧のままになる。テストは十分速いので使わない
    fsModuleCache: false,
    // バランステスト（tests/balance）は多くの seed でゲームを最後まで進めるので、既定の 5 秒では足りないことがある
    testTimeout: 30_000,
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
