import { animate, type MotionValue, motionValue } from 'motion';
import { type BufferGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Texture, Vector3 } from 'three';
import { type ModelId, modelAssets } from '../assets/catalog';
import { type Expression, expressions, type WorldLook } from '../content/look/world';
import type { ActorView } from '../view/world';
import type { WorldMaterials } from './materials';
import { syncById } from './sync';

/**
 * キャラクターの表示とアニメーション。ボーンは使わず、体全体の上下動・傾き・スカッシュ＆ストレッチを手続き的に作る。
 * 待機（呼吸）・作業（小刻みな上下と前傾）・歩行（跳ねる）・喜び（ジャンプと伸び縮み）。
 * 一時停止中は待機の動きを止め、歩行だけを最後まで続ける（止まったら描画ループも止まる）。
 */

/** 歩き終えたとみなす距離（m） */
const ARRIVE = 0.02;

interface ActorObject {
  view: ActorView;
  readonly root: Group;
  readonly body: Group;
  readonly face: Mesh | null;
  readonly shadow: Mesh;
  readonly pos: Vector3;
  readonly target: Vector3;
  /** 動きの位相をずらすための値（ID から決める） */
  readonly seed: number;
  walking: boolean;
  /** 演出のジャンプの高さ（m）。motion の animate() で動かす */
  readonly hop: MotionValue<number>;
  /** 演出で一時的に変えた表情と、元に戻す時刻（performance.now の ms） */
  reaction: { expression: Expression; until: number } | null;
}

/** 演出のジャンプ1回の長さ（秒） */
const HOP_SECONDS = 0.45;

export interface ActorFrame {
  readonly dt: number;
  readonly time: number;
  /** 待機・作業・喜びの動きを再生するか（一時停止中は false） */
  readonly live: boolean;
  readonly reducedMotion: boolean;
}

export interface Actors {
  readonly root: Group;
  /** views と、各キャラクターの立つ位置を受け取って差分同期する */
  sync(views: readonly ActorView[], targetOf: (view: ActorView) => Vector3): void;
  /** まだ動いているもの（歩行中）があれば true */
  frame(f: ActorFrame): boolean;
  positionOf(id: string): Vector3 | null;
  /** 頭の上の高さ（m） */
  readonly headHeight: number;
  readonly pickables: () => Mesh[];
  /** 演出の反応。hop で跳ね、expression を durationMs の間だけ表示する（ViewModel の表情より優先） */
  react(id: string, reaction: { hop?: number; expression?: Expression; durationMs?: number }): void;
  /** look やマテリアルを変えたら作り直す（位置は引き継ぐ） */
  rebuild(materials: WorldMaterials, look: WorldLook): void;
  dispose(): void;
}

function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1000) / 1000;
}

export function createActors(
  models: Map<ModelId, BufferGeometry>,
  faceAtlas: Texture,
  initial: { materials: WorldMaterials; look: WorldLook },
): Actors {
  const root = new Group();
  root.name = 'actors';
  let { materials, look } = initial;
  const objects = new Map<string, ActorObject>();
  const shadowGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  // 表情ごとにアトラスの1コマを切り出したマテリアル（全キャラクターで共有）
  const faceMaterials = new Map<Expression, MeshBasicMaterial>(
    expressions.map((e, i) => {
      const map = faceAtlas.clone();
      map.repeat.set(0.5, 0.5);
      map.offset.set((i % 2) * 0.5, i < 2 ? 0.5 : 0);
      return [e, new MeshBasicMaterial({ map, transparent: true, alphaTest: 0.1, depthWrite: false })];
    }),
  );
  const faceGeometries = new Map<ModelId, PlaneGeometry>();

  const build = (view: ActorView, pos: Vector3): ActorObject => {
    const geometry = models.get(view.model);
    if (!geometry) throw new Error(`モデルが読み込まれていない: ${view.model}`);
    const group = new Group();
    const body = new Group();
    const mesh = new Mesh(geometry, materials.vertex);
    mesh.userData.entityId = view.id;
    body.add(mesh);
    if (look.outline.enabled) body.add(new Mesh(geometry, materials.outline));
    let face: Mesh | null = null;
    const anchor = (modelAssets[view.model] as { face?: { y: number; z: number; size: number } }).face;
    if (anchor) {
      let g = faceGeometries.get(view.model);
      if (!g) {
        g = new PlaneGeometry(anchor.size, anchor.size).translate(0, anchor.y, anchor.z);
        faceGeometries.set(view.model, g);
      }
      face = new Mesh(g, faceMaterials.get(view.expression));
      face.renderOrder = 2;
      body.add(face);
    }
    const shadow = new Mesh(shadowGeometry, materials.shadow);
    shadow.position.y = 0.01;
    group.add(body, shadow);
    group.position.copy(pos);
    root.add(group);
    return {
      view,
      root: group,
      body,
      face,
      shadow,
      pos: pos.clone(),
      target: pos.clone(),
      seed: hashSeed(view.id),
      walking: false,
      hop: motionValue(0),
      reaction: null,
    };
  };

  const removeObject = (o: ActorObject) => root.remove(o.root);

  const pose = (o: ActorObject, f: ActorFrame) => {
    const c = look.character;
    const yaw = (look.camera.azimuthDeg * Math.PI) / 180;
    const toTarget = new Vector3().subVectors(o.target, o.pos);
    const distance = toTarget.length();
    o.walking = distance > ARRIVE;
    if (o.walking) {
      const stepLen = f.reducedMotion ? distance : Math.min(distance, c.walkSpeed * f.dt);
      o.pos.addScaledVector(toTarget, stepLen / distance);
    }
    o.root.position.copy(o.pos);
    o.root.rotation.y = o.walking && !f.reducedMotion ? Math.atan2(toTarget.x, toTarget.z) : yaw;

    const t = f.time + o.seed * 10;
    let y = 0;
    let lean = 0;
    let roll = 0;
    let sy = 1;
    if (!f.reducedMotion) {
      if (o.walking) {
        y = c.bob * 2.5 * Math.abs(Math.sin(t * 12));
        roll = 0.08 * Math.sin(t * 12);
      } else if (f.live && o.view.activity === 'work') {
        y = c.bob * Math.abs(Math.sin(t * 8));
        lean = ((c.tiltDeg * Math.PI) / 180) * (0.6 + 0.4 * Math.sin(t * 4));
      } else if (f.live && o.view.activity === 'cheer') {
        const s = Math.sin(t * 6);
        y = 0.28 * Math.max(0, s);
        sy = 1 + c.squash * s;
      } else if (f.live) {
        sy = 1 + 0.025 * Math.sin(t * 2.2);
      }
    }
    o.body.position.y = y + o.hop.get();
    o.body.rotation.set(lean, 0, roll);
    const k = c.scale;
    o.body.scale.set(k / Math.sqrt(sy), k * c.stretch * sy, k / Math.sqrt(sy));
    o.shadow.scale.setScalar(look.shadow.size * k * 0.55 * Math.max(0.5, 1 - y * 1.5));
    if (o.reaction && o.reaction.until <= performance.now()) o.reaction = null;
    const expression = o.reaction?.expression ?? o.view.expression;
    if (o.face) o.face.material = faceMaterials.get(expression) ?? o.face.material;
  };

  return {
    root,
    headHeight: 1.3,
    sync(views, targetOf) {
      syncById(objects, views, {
        create: (view) => build(view, targetOf(view)),
        update: (o, view) => {
          o.view = view;
          o.target.copy(targetOf(view));
        },
        remove: removeObject,
      });
    },
    frame(f) {
      let moving = false;
      for (const o of objects.values()) {
        pose(o, f);
        moving ||= o.walking || o.reaction !== null || o.hop.isAnimating();
      }
      return moving;
    },
    positionOf: (id) => objects.get(id)?.pos ?? null,
    react(id, r) {
      const o = objects.get(id);
      if (!o) return;
      if (r.hop) animate(o.hop, [0, r.hop, 0], { duration: HOP_SECONDS, ease: 'easeOut' });
      if (r.expression) o.reaction = { expression: r.expression, until: performance.now() + (r.durationMs ?? 0) };
    },
    pickables: () =>
      [...objects.values()].flatMap((o) =>
        o.body.children.filter((c): c is Mesh => c instanceof Mesh && c.userData.entityId !== undefined),
      ),
    rebuild(nextMaterials, nextLook) {
      materials = nextMaterials;
      look = nextLook;
      for (const [id, o] of objects) {
        root.remove(o.root);
        const fresh = build(o.view, o.pos);
        fresh.target.copy(o.target);
        fresh.reaction = o.reaction;
        objects.set(id, fresh);
      }
    },
    dispose() {
      shadowGeometry.dispose();
      for (const g of faceGeometries.values()) g.dispose();
      for (const m of faceMaterials.values()) {
        m.map?.dispose();
        m.dispose();
      }
    },
  };
}
