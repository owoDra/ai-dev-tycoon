import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { type TextureId, textureAssets, textureFile } from '../../src/assets/catalog';
import type { VisualPreset } from '../../src/content/look/visual';
import { floor, toonGradient } from './art/materials';
import { resultBg, titleKey } from './art/scenes';
import { blobShadow, faceAtlas } from './art/world';
import { GENERATED_DIR, rasterConfig } from './config';

/** SVG のイラストを WebP に事前ラスタライズする（sharp）。解像度と品質は config.ts の rasterConfig */

type Artwork = (preset: VisualPreset, w: number, h: number, scale: number) => string;

export const artworks: Record<TextureId, Artwork> = {
  titleKey,
  resultBg,
  floor,
  toonGradient,
  faceAtlas,
  blobShadow,
};

export async function rasterizeTexture(preset: VisualPreset, id: TextureId, scale: 1 | 2): Promise<Buffer> {
  const c = rasterConfig[id];
  const svg = artworks[id](preset, c.width, c.height, scale);
  const webp = c.lossless ? { lossless: true, effort: 6 } : { quality: c.quality, effort: 6, smartSubsample: true };
  return sharp(Buffer.from(svg)).webp(webp).toBuffer();
}

/** すべてのテクスチャを生成して書き出し、書き出したファイル名を返す */
export async function rasterizeAll(preset: VisualPreset): Promise<string[]> {
  const written: string[] = [];
  for (const [id, asset] of Object.entries(textureAssets) as [TextureId, (typeof textureAssets)[TextureId]][]) {
    for (const scale of asset.scales) {
      const file = textureFile(id, scale);
      await writeFile(join(GENERATED_DIR, file), await rasterizeTexture(preset, id, scale));
      written.push(file);
    }
  }
  return written;
}
