import { type Camera, InstancedMesh, type Object3D, Raycaster, Vector2 } from 'three';

/** クリックとみなす移動量の上限（CSS ピクセル）。これより動いたらパン */
export const CLICK_SLOP = 5;

/** UI 側の選択操作。選択状態は UI の state として持ち、core には入れない */
export interface SelectEntity {
  readonly type: 'SelectEntity';
  /** 選択したもの。何もない場所をクリックしたら null（選択解除） */
  readonly entityId: string | null;
}

const raycaster = new Raycaster();
const ndc = new Vector2();

/**
 * キャンバス上の点（CSS ピクセル）にある島・キャラクター・パケットの ID を返す。
 * 通常のメッシュは userData.entityId を、InstancedMesh は instanceId から instanceIdOf で ID を引く。
 */
export function pickEntity(
  x: number,
  y: number,
  size: { width: number; height: number },
  camera: Camera,
  targets: readonly Object3D[],
  instanceIdOf: (mesh: InstancedMesh, instanceId: number) => string | undefined,
): string | null {
  ndc.set((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  for (const hit of raycaster.intersectObjects(targets as Object3D[], false)) {
    if (hit.object instanceof InstancedMesh && hit.instanceId !== undefined) {
      const id = instanceIdOf(hit.object, hit.instanceId);
      if (id) return id;
      continue;
    }
    const id = hit.object.userData.entityId;
    if (typeof id === 'string') return id;
  }
  return null;
}
