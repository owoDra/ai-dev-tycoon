import { animate, type MotionValue, motionValue } from 'motion';
import { OrthographicCamera, Vector3 } from 'three';
import type { WorldCameraLook } from '../content/look/world';
import type { WorldLayout } from './layout';

/** カメラから注視点までの距離（m）。直交カメラなので見え方には影響せず、手前の物を切らないための値 */
const DISTANCE = 60;
/** 案件全体を収めるときの余白の割合 */
const FIT_PADDING = 1.15;
/** 島の上に立つものの高さの目安（m）。全体を収めるときに含める */
const CONTENT_HEIGHT = 1.6;
/** ホイール1ノッチあたりのズームの効き */
const WHEEL_ZOOM = 0.0015;

export interface CameraRig {
  readonly camera: OrthographicCamera;
  /** 島の配置が変わったときに、全体が収まる範囲とパンの制限を更新する */
  setLayout(layout: WorldLayout): void;
  setLook(look: WorldCameraLook): void;
  resize(width: number, height: number): void;
  /** ホイール・ピンチによるズーム（factor > 1 で寄る） */
  zoomBy(factor: number): void;
  wheel(deltaY: number): void;
  /** ドラッグによるパン（CSS ピクセル） */
  panBy(dx: number, dy: number): void;
  /**
   * 床の上の点が画面の中心から offset（CSS ピクセル）ずれた位置に来るように、ばねで寄せる。
   * パネルなどで隠れていない範囲の中心に見せたいときに offset を使う。zoom を渡すと、それより引いていれば寄る
   */
  focusOn(point: { x: number; z: number }, offset: { x: number; y: number }, zoom?: number): void;
  /** ばねが動いているか */
  readonly moving: () => boolean;
  dispose(): void;
}

/**
 * 直交カメラによるアイソメトリック表示。俯角と回転は look から読み、ズームとパンは motion の spring でなめらかに動かす。
 * ズームは「案件全体が収まる倍率」を 1 とした相対値で、look の範囲に制限する。パンは島の範囲＋余白に制限する。
 */
export function createCameraRig(initial: WorldCameraLook, reducedMotion: boolean, onChange: () => void): CameraRig {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, DISTANCE * 3);
  let look = initial;
  let aspect = 1;
  let viewHeight = 10;
  let bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  let height = 1;
  const zoom = motionValue(look.zoomInitial);
  const panX = motionValue(0);
  const panZ = motionValue(0);
  const targets = { zoom: look.zoomInitial, x: 0, z: 0 };
  const running = new Set<MotionValue<number>>();

  const center = () => ({ x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 });
  const direction = () => {
    const el = (look.elevationDeg * Math.PI) / 180;
    const az = (look.azimuthDeg * Math.PI) / 180;
    return new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  };

  const apply = () => {
    const c = center();
    const target = new Vector3(c.x + panX.get(), 0, c.z + panZ.get());
    camera.position.copy(target).addScaledVector(direction(), DISTANCE);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.left = (-viewHeight * aspect) / 2;
    camera.right = (viewHeight * aspect) / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.zoom = zoom.get();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };

  /** 島の範囲の角をカメラの画面の軸へ投影し、全体が収まる高さを求める */
  const fitToLayout = () => {
    apply();
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const x of [bounds.minX, bounds.maxX]) {
      for (const z of [bounds.minZ, bounds.maxZ]) {
        for (const y of [0, CONTENT_HEIGHT]) {
          const p = new Vector3(x, y, z);
          xs.push(p.dot(right));
          ys.push(p.dot(up));
        }
      }
    }
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    viewHeight = Math.max(h, w / aspect) * FIT_PADDING;
    apply();
  };

  const springTo = (value: MotionValue<number>, to: number) => {
    if (reducedMotion) {
      value.jump(to);
      onChange();
      return;
    }
    running.add(value);
    animate(value, to, { type: 'spring', stiffness: look.stiffness, damping: look.damping }).then(() => {
      running.delete(value);
      onChange();
    });
  };

  for (const v of [zoom, panX, panZ]) {
    v.on('change', () => {
      apply();
      onChange();
    });
  }

  const clampPan = () => {
    const c = center();
    const m = look.panMargin;
    targets.x = Math.min(bounds.maxX + m - c.x, Math.max(bounds.minX - m - c.x, targets.x));
    targets.z = Math.min(bounds.maxZ + m - c.z, Math.max(bounds.minZ - m - c.z, targets.z));
  };

  /** 画面上のずれ（CSS ピクセル）を、床の上のずれ（m）に換算する。中身が (dx, dy) だけ動いて見えるカメラの移動量 */
  const screenToGround = (dx: number, dy: number) => {
    // 画面上の1ピクセルが床の上で何 m か。縦方向は俯角のぶん床が縮んで見える
    const perPixel = viewHeight / targets.zoom / height;
    const az = (look.azimuthDeg * Math.PI) / 180;
    const el = (look.elevationDeg * Math.PI) / 180;
    const rx = Math.cos(az);
    const rz = -Math.sin(az);
    const fx = -Math.sin(az) / Math.sin(el);
    const fz = -Math.cos(az) / Math.sin(el);
    return { x: (-dx * rx + dy * fx) * perPixel, z: (-dx * rz + dy * fz) * perPixel };
  };

  const zoomTo = (to: number) => {
    targets.zoom = Math.min(look.zoomMax, Math.max(look.zoomMin, to));
    springTo(zoom, targets.zoom);
  };

  return {
    camera,
    setLayout(layout) {
      bounds = layout.bounds;
      clampPan();
      fitToLayout();
    },
    setLook(next) {
      look = next;
      targets.zoom = Math.min(look.zoomMax, Math.max(look.zoomMin, targets.zoom));
      zoom.jump(targets.zoom);
      fitToLayout();
    },
    resize(width, h) {
      height = h;
      aspect = width / Math.max(1, h);
      fitToLayout();
    },
    zoomBy(factor) {
      zoomTo(targets.zoom * factor);
    },
    wheel(deltaY) {
      zoomTo(targets.zoom * Math.exp(-deltaY * WHEEL_ZOOM));
    },
    panBy(dx, dy) {
      const d = screenToGround(dx, dy);
      targets.x += d.x;
      targets.z += d.z;
      clampPan();
      // ドラッグ中は指に吸い付くように即座に動かす
      panX.jump(targets.x);
      panZ.jump(targets.z);
    },
    focusOn(point, offset, zoom) {
      if (zoom !== undefined && targets.zoom < zoom) zoomTo(zoom);
      const c = center();
      const d = screenToGround(offset.x, offset.y);
      targets.x = point.x - c.x + d.x;
      targets.z = point.z - c.z + d.z;
      clampPan();
      springTo(panX, targets.x);
      springTo(panZ, targets.z);
    },
    moving: () => running.size > 0,
    dispose() {
      for (const v of [zoom, panX, panZ]) v.destroy();
    },
  };
}
