import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { generatedFiles, modelAssets, type TextureId, textureAssets, textureFile } from '../../src/assets/catalog';
import { modelUrl, pickScale, textureSrcset, textureUrl } from '../../src/assets/registry';
import {
  GENERATED_DIR,
  modelBudgetBytes,
  rasterBudget,
  rasterConfig,
  TOTAL_BUDGET_BYTES,
} from '../../tools/assets/config';
import { staleReasons } from '../../tools/assets/manifest';

const textureIds = Object.keys(textureAssets) as TextureId[];
const textureCases = textureIds.flatMap((id) => textureAssets[id].scales.map((scale) => [id, scale] as const));
const size = (file: string) => statSync(join(GENERATED_DIR, file)).size;

describe('レジストリの全IDに対応する生成物が存在する', () => {
  it.each(textureCases)('テクスチャ %s @%dx', (id, scale) => {
    expect(existsSync(join(GENERATED_DIR, textureFile(id, scale)))).toBe(true);
    expect(textureUrl(id, scale)).toContain(textureFile(id, scale));
  });

  it.each(Object.keys(modelAssets))('モデル %s', (id) => {
    const file = modelAssets[id as keyof typeof modelAssets].file;
    expect(existsSync(join(GENERATED_DIR, file))).toBe(true);
    expect(modelUrl(id as keyof typeof modelAssets)).toContain(file);
  });

  it('カタログにない生成物を残していない', () => {
    const files = readdirSync(GENERATED_DIR).filter((f) => f !== 'manifest.json');
    expect(new Set(files)).toEqual(new Set(generatedFiles()));
  });

  it('生成物は最新（manifest.json のハッシュと一致する）', () => {
    expect(staleReasons()).toEqual([]);
  });
});

describe('各アセットのサイズが予算内に収まる', () => {
  it.each(textureCases)('テクスチャ %s @%dx', (id, scale) => {
    expect(size(textureFile(id, scale))).toBeLessThanOrEqual(rasterBudget(id, scale));
  });

  it.each(Object.keys(modelBudgetBytes))('モデル %s', (id) => {
    const key = id as keyof typeof modelAssets;
    expect(size(modelAssets[key].file)).toBeLessThanOrEqual(modelBudgetBytes[key]);
  });

  it('生成物の合計が予算内', () => {
    const total = generatedFiles().reduce((sum, f) => sum + size(f), 0);
    expect(total).toBeLessThanOrEqual(TOTAL_BUDGET_BYTES);
  });
});

describe('WebP', () => {
  it.each(textureCases)('%s @%dx は設定どおりの解像度の WebP', async (id, scale) => {
    const meta = await sharp(join(GENERATED_DIR, textureFile(id, scale))).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(rasterConfig[id].width * scale);
    expect(meta.height).toBe(rasterConfig[id].height * scale);
  });

  it('高解像度の画面では 2x を選び、2x がないアセットは 1x にする', () => {
    expect(pickScale('titleKey', 2)).toBe(2);
    expect(pickScale('titleKey', 1)).toBe(1);
    expect(pickScale('toonGradient', 2)).toBe(1);
    expect(textureSrcset('titleKey')).toMatch(/ 1x, .+ 2x$/);
  });
});

const modelIds = Object.keys(modelAssets) as (keyof typeof modelAssets)[];

describe.each(modelIds)('glb: %s', (id) => {
  const glb = readFileSync(join(GENERATED_DIR, modelAssets[id].file));
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));

  it('glTF 2.0 のバイナリ', () => {
    expect(glb.subarray(0, 4).toString('ascii')).toBe('glTF');
    expect(glb.readUInt32LE(4)).toBe(2);
    expect(glb.readUInt32LE(8)).toBe(glb.byteLength);
  });

  it('meshopt で圧縮し、量子化している', () => {
    expect(json.extensionsUsed).toEqual(expect.arrayContaining(['EXT_meshopt_compression', 'KHR_mesh_quantization']));
  });

  it('テクスチャを使わず、頂点カラーで色と AO を持つ', () => {
    expect(json.images ?? []).toEqual([]);
    expect(json.textures ?? []).toEqual([]);
    const attributes = json.meshes.flatMap((m: { primitives: { attributes: Record<string, number> }[] }) =>
      m.primitives.map((p) => Object.keys(p.attributes)),
    );
    for (const attrs of attributes) expect(attrs).toEqual(expect.arrayContaining(['POSITION', 'NORMAL', 'COLOR_0']));
  });

  it('1つのメッシュ・1つのマテリアルにまとめている（描画1回）', () => {
    expect(json.meshes).toHaveLength(1);
    expect(json.materials).toHaveLength(1);
  });
});
