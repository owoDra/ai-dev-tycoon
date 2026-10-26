import { fileURLToPath } from 'node:url';
import type { ModelId, TextureId } from '../../src/assets/catalog';

/** アセット生成の設定（解像度・品質・サイズ予算）。予算は tests/build/assets.test.ts が検査する */

export const PROJECT_DIR = fileURLToPath(new URL('../../', import.meta.url));
export const GENERATED_DIR = fileURLToPath(new URL('../../src/assets/generated/', import.meta.url));
export const TOKENS_CSS = fileURLToPath(new URL('../../src/styles/tokens.css', import.meta.url));

export interface RasterConfig {
  /** 1x のときの幅と高さ（px）。2x はこの2倍 */
  width: number;
  height: number;
  /** WebP の品質（0〜100）。lossless のときは使わない */
  quality: number;
  /** 段がくっきりしたデータ（グラデーションマップ）は可逆圧縮にする */
  lossless: boolean;
  /** 1ファイルあたりのサイズ予算（バイト）。2x はこの4倍まで許す */
  budgetBytes: number;
}

export const rasterConfig: Record<TextureId, RasterConfig> = {
  titleKey: { width: 960, height: 540, quality: 82, lossless: false, budgetBytes: 40 * 1024 },
  resultBg: { width: 960, height: 540, quality: 80, lossless: false, budgetBytes: 30 * 1024 },
  floor: { width: 256, height: 256, quality: 82, lossless: false, budgetBytes: 8 * 1024 },
  wall: { width: 256, height: 256, quality: 82, lossless: false, budgetBytes: 8 * 1024 },
  matcapToon: { width: 128, height: 128, quality: 90, lossless: false, budgetBytes: 4 * 1024 },
  toonGradient: { width: 4, height: 1, quality: 100, lossless: true, budgetBytes: 256 },
  faceAtlas: { width: 256, height: 256, quality: 90, lossless: false, budgetBytes: 12 * 1024 },
  blobShadow: { width: 64, height: 64, quality: 90, lossless: false, budgetBytes: 2 * 1024 },
};

export function rasterBudget(id: TextureId, scale: 1 | 2): number {
  return rasterConfig[id].budgetBytes * scale * scale;
}

export const modelBudgetBytes: Record<ModelId, number> = {
  desk: 24 * 1024,
  humanBob: 24 * 1024,
  humanCap: 24 * 1024,
  humanGlasses: 24 * 1024,
  humanBun: 24 * 1024,
  agentResearch: 24 * 1024,
  agentCode: 24 * 1024,
  agentQa: 24 * 1024,
  agentRelease: 24 * 1024,
  monitor: 16 * 1024,
  conveyor: 16 * 1024,
  packet: 12 * 1024,
  plant: 16 * 1024,
  serverRack: 28 * 1024,
};

/**
 * 生成物すべての合計の予算（バイト）。dist には base64（約 4/3 倍）で入るため、
 * verify:dist の raw 予算（3 MiB）の一部に収まるようにする
 */
export const TOTAL_BUDGET_BYTES = 640 * 1024;

/**
 * 生成物が最新かどうかを判定するための入力。これらのファイルの中身（と生成に使うパッケージのバージョン）の
 * ハッシュが manifest.json の値と一致すれば最新とみなす（assets:check）
 */
export const INPUT_GLOBS = {
  dirs: ['tools/assets'],
  files: [
    'src/content/look/visual.ts',
    'src/styles/color.ts',
    'src/styles/visualVars.ts',
    'src/styles/tokens.ts',
    'src/assets/catalog.ts',
    'src/content/look/world.ts',
  ],
  packages: ['sharp', 'three', '@gltf-transform/core', '@gltf-transform/functions', 'meshoptimizer'],
} as const;
