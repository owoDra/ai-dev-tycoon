import { BufferAttribute, BufferGeometry, Mesh, type Object3D } from 'three';
import { type ModelId, modelAssets } from '../assets/catalog';
import { getModel } from '../assets/registry';

/**
 * モデルのメッシュのジオメトリを、ノードの変形を焼き込んだ Float32 の属性にして返す。
 * meshopt の量子化（KHR_mesh_quantization）は整数の座標と、元の大きさへ戻す変形をノードに持つため、
 * ジオメトリだけを共有して使うときは変形を焼き込む必要がある
 */
export function bakedGeometry(root: Object3D): BufferGeometry | null {
  root.updateMatrixWorld(true);
  let mesh: Mesh | null = null;
  root.traverse((o) => {
    if (!mesh && o instanceof Mesh) mesh = o;
  });
  if (!mesh) return null;
  const source = (mesh as Mesh).geometry;
  const geometry = new BufferGeometry();
  for (const [name, attr] of Object.entries(source.attributes)) {
    const array = new Float32Array(attr.count * attr.itemSize);
    for (let i = 0; i < attr.count; i++) {
      for (let c = 0; c < attr.itemSize; c++) array[i * attr.itemSize + c] = attr.getComponent(i, c);
    }
    geometry.setAttribute(name, new BufferAttribute(array, attr.itemSize));
  }
  if (source.index) geometry.setIndex(source.index.clone());
  geometry.applyMatrix4((mesh as Mesh).matrixWorld);
  geometry.computeBoundingSphere();
  return geometry;
}

/** すべてのモデルを読み込み、ID → 共有するジオメトリの対応表にする */
export async function loadModelGeometries(): Promise<Map<ModelId, BufferGeometry>> {
  const ids = Object.keys(modelAssets) as ModelId[];
  const roots = await Promise.all(ids.map((id) => getModel(id)));
  const out = new Map<ModelId, BufferGeometry>();
  roots.forEach((root, i) => {
    const id = ids[i];
    const geometry = bakedGeometry(root);
    if (geometry && id) out.set(id, geometry);
  });
  return out;
}
