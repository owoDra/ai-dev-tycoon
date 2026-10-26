import {
  type BufferGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ModelId } from '../assets/catalog';
import type { VisualPreset } from '../content/look/visual';
import type { WorldLook } from '../content/look/world';
import type { TaskStatusView } from '../view/project';
import type { IslandView } from '../view/world';
import { pointAlong, type Vec2, type WorldLayout } from './layout';
import { scaleColor, type WorldMaterials } from './materials';

/**
 * 床・島・コンベア・休憩所・出口・小物（動かないもの）。look か配置が変わったら作り直す。
 * 島の状態（色・進み具合・ボトルネックの脈動）は update で毎フレーム反映する。
 */

/** デスクの島の中心からのずれ（m）。島の奥に置き、手前にキャラクターが立つ */
export const DESK_OFFSET = { x: -0.45, z: -0.45 };
/** デスクの天板の高さ（desk.glb） */
export const DESK_TOP = 0.76;
/** コンベアの上面の高さ（conveyor.glb） */
export const BELT_TOP = 0.24;
/** 休憩所と出口の台の厚み */
export const PAD_HEIGHT = 0.12;

export interface IslandObject {
  readonly view: () => IslandView | undefined;
  readonly group: Group;
  readonly base: Mesh;
  readonly progress: Mesh;
  readonly center: Vec2;
}

export interface StageParts {
  models: Map<ModelId, BufferGeometry>;
  materials: WorldMaterials;
  look: WorldLook;
  visual: VisualPreset;
  layout: WorldLayout;
  floorMaterial: Material;
}

export interface Stage {
  readonly root: Group;
  readonly islands: Map<string, IslandObject>;
  /** 選択できるメッシュ（userData.entityId を持つ） */
  readonly pickables: Object3D[];
  /** fx は演出による島のスカッシュ＆ストレッチと持ち上げ（島の entityId ごと） */
  update(
    views: readonly IslandView[],
    time: number,
    animate: boolean,
    fx?: (entityId: string) => { sx: number; sy: number; lift: number },
  ): void;
  dispose(): void;
}

/** 本体とアウトライン（反転ハル）を同じジオメトリで重ねたもの */
export function outlined(geometry: BufferGeometry, body: Material, materials: WorldMaterials, outline: boolean): Group {
  const group = new Group();
  group.add(new Mesh(geometry, body));
  if (outline) group.add(new Mesh(geometry, materials.outline));
  return group;
}

const STATUS_COLOR: Record<TaskStatusView, 'islandTop' | 'islandDone' | 'queued' | 'defect' | 'idle'> = {
  unassigned: 'idle',
  waiting: 'islandTop',
  queued: 'queued',
  running: 'islandTop',
  done: 'islandDone',
  defect: 'defect',
};

export function createStage(parts: StageParts): Stage {
  const { models, materials, look, visual, layout } = parts;
  const env = look.environment;
  const outline = look.outline.enabled;
  const root = new Group();
  root.name = 'stage';
  const geometries: BufferGeometry[] = [];
  const own = <G extends BufferGeometry>(g: G) => {
    geometries.push(g);
    return g;
  };
  const model = (id: ModelId) => {
    const g = models.get(id);
    if (!g) throw new Error(`モデルが読み込まれていない: ${id}`);
    return g;
  };
  const yaw = (look.camera.azimuthDeg * Math.PI) / 180;
  const shadowGeometry = own(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const place = (id: ModelId, x: number, y: number, z: number, shadow: number) => {
    const g = outlined(model(id), materials.vertex, materials, outline);
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    root.add(g);
    if (shadow > 0) {
      const s = new Mesh(shadowGeometry, materials.shadow);
      s.position.set(x, y + 0.01, z);
      s.scale.setScalar(shadow);
      root.add(s);
    }
    return g;
  };

  // 床
  const b = layout.bounds;
  const margin = env.islandSize * 2;
  const floorW = b.maxX - b.minX + margin * 2;
  const floorD = b.maxZ - b.minZ + margin * 2;
  const floor = new Mesh(own(new PlaneGeometry(floorW, floorD).rotateX(-Math.PI / 2)), parts.floorMaterial);
  floor.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  root.add(floor);

  // 島
  const size = env.islandSize;
  const h = env.islandHeight;
  const islandGeometry = own(new RoundedBoxGeometry(size, h, size, 3, Math.min(0.3, h / 2)));
  const barGeometry = own(new RoundedBoxGeometry(1, 0.08, 0.12, 1, 0.03).translate(0.5, 0, 0));
  const colors = {
    idle: scaleColor('neutral.100', visual),
    islandTop: scaleColor(env.islandTop, visual),
    islandDone: scaleColor(env.islandDone, visual),
    queued: scaleColor('warning.100', visual),
    defect: scaleColor('danger.100', visual),
  };
  const islands = new Map<string, IslandObject>();
  const pickables: Object3D[] = [];
  let currentViews = new Map<string, IslandView>();
  for (const p of layout.islands) {
    const group = new Group();
    group.position.set(p.center.x, 0, p.center.z);
    const base = new Mesh(islandGeometry, materials.solid(colors.idle));
    base.position.y = h / 2;
    base.userData.entityId = `island:${p.id}`;
    group.add(base);
    if (outline) {
      const o = new Mesh(islandGeometry, materials.outline);
      o.position.y = h / 2;
      group.add(o);
    }
    const desk = outlined(model('desk'), materials.vertex, materials, outline);
    desk.position.set(DESK_OFFSET.x, h, DESK_OFFSET.z);
    desk.rotation.y = yaw;
    desk.traverse((o) => {
      o.userData.entityId = `island:${p.id}`;
    });
    group.add(desk);
    const groove = new Mesh(barGeometry, materials.solid(scaleColor('neutral.200', visual)));
    groove.position.set(-size / 2 + 0.2, h + 0.03, size / 2 - 0.2);
    groove.scale.x = size - 0.4;
    const progress = new Mesh(barGeometry, materials.solid(scaleColor('success.400', visual)));
    progress.position.set(-size / 2 + 0.2, h + 0.05, size / 2 - 0.2);
    progress.scale.set(0.0001, 1.2, 1.2);
    group.add(groove, progress);
    pickables.push(base, ...desk.children);
    root.add(group);
    islands.set(p.id, { view: () => currentViews.get(p.id), group, base, progress, center: p.center });
  }

  // コンベア（すべての区間を1つの InstancedMesh で描く）
  const seg = look.flow.segmentLength;
  const transforms: Matrix4[] = [];
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  for (const c of layout.conveyors) {
    const n = Math.max(1, Math.round(c.length / seg));
    for (let i = 0; i < n; i++) {
      const { at, dir } = pointAlong(c.points, (i + 0.5) / n);
      q.setFromAxisAngle(up, Math.atan2(dir.x, dir.z));
      transforms.push(new Matrix4().compose(new Vector3(at.x, 0, at.z), q, new Vector3(1, 1, c.length / n / seg)));
    }
  }
  const belt = new InstancedMesh(model('conveyor'), materials.vertex, transforms.length);
  transforms.forEach((m, i) => {
    belt.setMatrixAt(i, m);
  });
  root.add(belt);
  if (outline) {
    const beltOutline = new InstancedMesh(model('conveyor'), materials.outline, transforms.length);
    beltOutline.instanceMatrix = belt.instanceMatrix;
    root.add(beltOutline);
  }

  // 休憩所（待機中の人間）と出口（納品）
  const padGeometry = own(new CylinderGeometry(1, 1, PAD_HEIGHT, 40).translate(0, PAD_HEIGHT / 2, 0));
  const lounge = new Mesh(padGeometry, materials.solid(scaleColor('accent.100', visual)));
  lounge.position.set(layout.lounge.x, 0, layout.lounge.z);
  lounge.scale.set(size * 0.6, 1, size * 0.6);
  const exit = new Mesh(padGeometry, materials.solid(scaleColor('success.200', visual)));
  exit.position.set(layout.exit.x, 0, layout.exit.z);
  exit.scale.set(size * 0.3, 1, size * 0.3);
  root.add(lounge, exit);
  place('monitor', layout.lounge.x - size * 0.3, PAD_HEIGHT, layout.lounge.z - size * 0.3, 1.2);

  // 小物：look.environment.props の密度に応じて、候補の場所から順に置く
  const spots: { id: ModelId; x: number; z: number }[] = [
    { id: 'serverRack', x: b.minX + 0.4, z: b.minZ - 1.2 },
    { id: 'plant', x: layout.lounge.x + size * 0.45, z: layout.lounge.z - size * 0.45 },
    { id: 'plant', x: layout.exit.x + 1.3, z: layout.exit.z - 1.3 },
    { id: 'serverRack', x: b.minX + 1.4, z: b.minZ - 1.2 },
    { id: 'plant', x: b.maxX - 0.6, z: b.minZ - 1 },
    { id: 'plant', x: layout.lounge.x - size * 0.4, z: layout.lounge.z + size * 0.5 },
    { id: 'plant', x: (b.minX + b.maxX) / 2, z: b.maxZ + 1 },
    { id: 'serverRack', x: b.maxX - 1.8, z: b.minZ - 1.2 },
  ];
  for (const spot of spots.slice(0, Math.round(spots.length * env.props))) {
    place(spot.id, spot.x, 0, spot.z, spot.id === 'plant' ? 0.9 : 1.3);
  }

  return {
    root,
    islands,
    pickables,
    update(views, time, animate, fx) {
      currentViews = new Map(views.map((v) => [v.taskId, v]));
      for (const v of views) {
        const island = islands.get(v.taskId);
        if (!island) continue;
        island.base.material = materials.solid(colors[STATUS_COLOR[v.status]]);
        island.progress.scale.x = Math.max(0.0001, v.progress * (size - 0.4));
        const pulse =
          animate && v.isBottleneck
            ? 1 + look.bottleneck.pulseAmplitude * v.bottleneck * Math.sin(time * Math.PI * 2 * look.bottleneck.pulseHz)
            : 1;
        const f = fx?.(v.id) ?? { sx: 1, sy: 1, lift: 0 };
        island.group.scale.set(pulse * f.sx, f.sy, pulse * f.sx);
        island.group.position.y = f.lift;
      }
    },
    dispose() {
      for (const g of geometries) g.dispose();
      belt.dispose();
    },
  };
}

/** 選択とボトルネックの位置を示す床の輪 */
export function createMarkerRing(color: string, opacity: number): Mesh {
  const material = new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const ring = new Mesh(new RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), material);
  ring.renderOrder = 1;
  ring.visible = false;
  return ring;
}
