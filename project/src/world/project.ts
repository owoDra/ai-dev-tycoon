import { type Camera, Vector3 } from 'three';

export interface ScreenPoint {
  /** キャンバスの左上からの CSS ピクセル */
  readonly x: number;
  readonly y: number;
  /** カメラの描画範囲の中にあるか */
  readonly visible: boolean;
}

const v = new Vector3();

/** ワールド座標をキャンバス上の座標へ変換する。DOM のラベルやポップアップを 3D オブジェクトに重ねるのに使う */
export function toScreen(
  point: { x: number; y: number; z: number },
  camera: Camera,
  width: number,
  height: number,
): ScreenPoint {
  v.set(point.x, point.y, point.z).project(camera);
  const visible = Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z >= -1 && v.z <= 1;
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, visible };
}
