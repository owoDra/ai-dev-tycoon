import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [solid(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    modulePreload: false,
    // 画像・glb・フォントも含めて全アセットを data URI でインライン化し、dist を index.html 1ファイルにする
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
  test: {
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
});
