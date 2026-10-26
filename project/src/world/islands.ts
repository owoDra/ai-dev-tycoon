import {
  BoxGeometry,
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
    lanes?: readonly string[],
  ): void;
  /** 整理度（0〜1）に合わせて、島の下の模様の濃さと観葉植物の数を変える（Visual Reward、企画書61章） */
  setTidiness(tidiness: number): void;
  dispose(): void;
}

/** 自動化レーンの帯の幅・厚み（m）。コンベアの上面に重ねる */
const LANE_WIDTH = 0.5;
const LANE_HEIGHT = 0.03;

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

  // 自動化レーン：Workflow で AI どうしがつながった区間のコンベアに、明るい帯を重ねる（ViewModel の lanes で出し入れする）
  const laneGeometry = own(new BoxGeometry(LANE_WIDTH, LANE_HEIGHT, 1));
  const lanes = new Map<string, Group>();
  for (const c of layout.conveyors) {
    const lane = new Group();
    const n = Math.max(1, Math.round(c.length / seg));
    for (let i = 0; i < n; i++) {
      const { at, dir } = pointAlong(c.points, (i + 0.5) / n);
      const strip = new Mesh(laneGeometry, materials.lane);
      strip.position.set(at.x, BELT_TOP + LANE_HEIGHT / 2, at.z);
      strip.rotation.y = Math.atan2(dir.x, dir.z);
      strip.scale.z = (c.length / n) * 0.8;
      lane.add(strip);
    }
    lane.visible = false;
    lanes.set(c.id, lane);
    root.add(lane);
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

  // Visual Reward：島の下の模様（整理度で濃くなる）と、整理度で増える観葉植物（床の手前と奥の縁に並べる）
  const reward = look.reward;
  const rugMaterial = new MeshBasicMaterial({
    color: scaleColor(reward.rugColor, visual),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const rugGeometry = own(new RingGeometry(size * 0.62, size * 0.8, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4));
  const rugs = layout.islands.map((p) => {
    const rug = new Mesh(rugGeometry, rugMaterial);
    rug.position.set(p.center.x, 0.015, p.center.z);
    rug.visible = false;
    root.add(rug);
    return rug;
  });
  const plantRow = Math.max(1, Math.ceil(reward.plants / 2));
  const rewardPlants = Array.from({ length: reward.plants }, (_, i) => {
    const row = i % 2;
    const k = Math.floor(i / 2);
    const x = b.minX - 1 + ((b.maxX - b.minX + 2) * (k + 0.5)) / plantRow;
    const g = place('plant', x, 0, row === 0 ? b.maxZ + 2.2 : b.minZ - 2.2, 0.9);
    g.visible = false;
    return g;
  });

  return {
    root,
    islands,
    pickables,
    update(views, time, animate, fx, auto = []) {
      currentViews = new Map(views.map((v) => [v.taskId, v]));
      for (const [id, lane] of lanes) lane.visible = auto.includes(id);
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
    setTidiness(tidiness) {
      rugMaterial.opacity = reward.rugOpacity * tidiness;
      for (const rug of rugs) rug.visible = tidiness > 0.02;
      const shown = Math.round(tidiness * rewardPlants.length);
      rewardPlants.forEach((g, i) => {
        g.visible = i < shown;
      });
    },
    dispose() {
      for (const g of geometries) g.dispose();
      rugMaterial.dispose();
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
