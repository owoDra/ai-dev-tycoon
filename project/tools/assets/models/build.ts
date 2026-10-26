import { Logger, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import {
  type BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Vector3,
} from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { installNodePolyfills } from './node-polyfill';

/** 手続き生成したモデルを glb にする共通処理（頂点カラー・簡易 AO の焼き込み・最適化） */

export interface Part {
  geometry: BufferGeometry;
  /** #rrggbb（sRGB） */
  color: string;
}

/** 頂点の位置と法線から、その頂点の明るさ（0〜1）を返す関数。1 で遮られていない */
export type AmbientOcclusion = (position: Vector3, normal: Vector3) => number;

/**
 * 部品を1つのメッシュにまとめる。色は頂点カラーとして持たせ、AO を掛けて焼き込む（テクスチャは使わない）。
 * 1つのメッシュ・1つのマテリアルにまとめるため、描画は1回で済む。
 */
export function bakeParts(name: string, parts: readonly Part[], ao: AmbientOcclusion): Mesh {
  const p = new Vector3();
  const nrm = new Vector3();
  const geometries = parts.map(({ geometry, color }) => {
    const g = geometry;
    g.deleteAttribute('uv');
    // glTF の頂点カラーは線形の値。Color は sRGB の指定を作業用の線形色空間に変換する
    const base = new Color(color);
    const pos = g.getAttribute('position');
    const normal = g.getAttribute('normal');
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      nrm.fromBufferAttribute(normal, i);
      const k = ao(p, nrm);
      colors[i * 3] = base.r * k;
      colors[i * 3 + 1] = base.g * k;
      colors[i * 3 + 2] = base.b * k;
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(geometries);
  if (!merged) throw new Error(`${name}: 部品の属性がそろっていない`);
  const material = new MeshStandardMaterial({ name: `${name}-toon`, vertexColors: true, roughness: 0.85 });
  const mesh = new Mesh(merged, material);
  mesh.name = name;
  return mesh;
}

/** three のオブジェクトを glb にし、dedup・weld・meshopt（量子化を含む）で圧縮する */
export async function exportGlb(root: Object3D): Promise<Uint8Array> {
  installNodePolyfills();
  const raw = (await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer;

  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.readBinary(new Uint8Array(raw));
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  // meshopt() は内部で reorder と quantize（KHR_mesh_quantization）を行ってから EXT_meshopt_compression で圧縮する
  await doc.transform(dedup(), weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  return io.writeBinary(doc);
}
