import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  NoColorSpace,
  type Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { type ModelId, modelAssets, type TextureId, textureAssets, textureFile } from './catalog';

/**
 * ランタイムのアセットレジストリ。アセットID → URL の対応表を経由して読み込むため、
 * 生成物を人が作った画像やモデルに差し替えても呼び出し側は変わらない。
 * ビルドでは URL が data URI になり、index.html にインライン化される。
 */

const urls = import.meta.glob<string>('./generated/*.{webp,glb}', { eager: true, query: '?url', import: 'default' });

function urlOf(file: string): string {
  const url = urls[`./generated/${file}`];
  if (url === undefined) throw new Error(`生成物がない: ${file}（npm run assets を実行する）`);
  return url;
}

/** 画面の解像度に合う倍率を選ぶ。2x を用意していないアセットは 1x */
export function pickScale(id: TextureId, devicePixelRatio: number): 1 | 2 {
  const scales: readonly (1 | 2)[] = textureAssets[id].scales;
  return devicePixelRatio >= 1.5 && scales.includes(2) ? 2 : 1;
}

/** テクスチャの URL。CSS の背景や <img> に使う */
export function textureUrl(id: TextureId, scale: 1 | 2 = 1): string {
  return urlOf(textureFile(id, scale));
}

/** <img srcset> に渡す文字列（"url 1x, url 2x"） */
export function textureSrcset(id: TextureId): string {
  return textureAssets[id].scales.map((s) => `${textureUrl(id, s)} ${s}x`).join(', ');
}

export function modelUrl(id: ModelId): string {
  return urlOf(modelAssets[id].file);
}

const textures = new Map<string, Promise<Texture>>();
const models = new Map<ModelId, Promise<GLTF>>();

/** テクスチャを読み込む。同じIDと倍率なら同じ Texture を返す（キャッシュ） */
export function getTexture(
  id: TextureId,
  scale: 1 | 2 = pickScale(id, globalThis.devicePixelRatio ?? 1),
): Promise<Texture> {
  const key = `${id}@${scale}`;
  let pending = textures.get(key);
  if (!pending) {
    const asset = textureAssets[id];
    pending = new TextureLoader().loadAsync(textureUrl(id, scale)).then((texture) => {
      texture.name = key;
      texture.colorSpace = asset.srgb ? SRGBColorSpace : NoColorSpace;
      const wrap = asset.repeat ? RepeatWrapping : ClampToEdgeWrapping;
      texture.wrapS = wrap;
      texture.wrapT = wrap;
      if (asset.nearest) {
        texture.magFilter = NearestFilter;
        texture.minFilter = NearestFilter;
        texture.generateMipmaps = false;
      } else {
        texture.magFilter = LinearFilter;
        texture.minFilter = LinearMipmapLinearFilter;
      }
      return texture;
    });
    textures.set(key, pending);
  }
  return pending;
}

/**
 * モデルを読み込み、複製を返す。読み込みと解凍（meshopt）は1回だけ行い、ジオメトリとマテリアルは複製間で共有する。
 * 同じモデルを何台も置けるように、呼ぶたびに新しい Object3D を返す。
 */
export async function getModel(id: ModelId): Promise<Object3D> {
  let pending = models.get(id);
  if (!pending) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    pending = loader.loadAsync(modelUrl(id));
    models.set(id, pending);
  }
  const gltf = await pending;
  return gltf.scene.clone(true);
}
