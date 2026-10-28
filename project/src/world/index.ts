import {
  AmbientLight,
  type BufferGeometry,
  Color,
  DirectionalLight,
  type InstancedMesh,
  type Mesh,
  MeshBasicMaterial,
  type Object3D,
  Scene,
  type Texture,
  Vector3,
} from 'three';
import type { ModelId } from '../assets/catalog';
import { getTexture } from '../assets/registry';
import { defaultFeel } from '../content/look/feel';
import type { VisualPreset } from '../content/look/visual';
import type { WorldLook } from '../content/look/world';
import type { FxCue } from '../fx/director';
import type { ActorView, PacketView, WorldViewModel } from '../view/world';
import { type Actors, createActors } from './actors';
import { createCameraRig, type FrameRect } from './camera';
import { loadModelGeometries } from './geometry';
import { createIncidentBugs, type IncidentBugs } from './incidents';
import { BELT_TOP, createMarkerRing, createStage, DESK_OFFSET, DESK_TOP, PAD_HEIGHT, type Stage } from './islands';
import { layoutProject, pointAlong, type WorldLayout } from './layout';
import { createMaterials, scaleColor, type WorldMaterials } from './materials';
import { createPackets, type Packets, type PacketTarget } from './packets';
import { CLICK_SLOP, pickEntity, type SelectEntity } from './picking';
import { type ScreenPoint, toScreen } from './project';
import { createWorldRenderer, type RenderStats } from './renderer';
import { createVfx } from './vfx/index';
import { playCue } from './vfx/player';
import { shakeOffset } from './vfx/shake';
import { createSquash } from './vfx/squash';

export type { SelectEntity } from './picking';
export type { RenderStats } from './renderer';
export { DRAW_CALL_BUDGET } from './renderer';

export interface WorldOptions {
  look: WorldLook;
  visual: VisualPreset;
  /** 動きを減らすか。実行中に変わってもよい（変えたら redraw を呼ぶ） */
  reducedMotion: () => boolean;
  /** 島・キャラクター・パケットをクリックしたとき（何もない場所なら entityId: null） */
  onSelect: (command: SelectEntity) => void;
}

export interface World {
  /** モデルとテクスチャの読み込みが終わったら解決する */
  readonly ready: Promise<void>;
  readonly stats: Readonly<RenderStats>;
  setViewModel(vm: WorldViewModel): void;
  /** 見た目のプリセットを差し替える（再読み込みなしで作り直す） */
  setLook(look: WorldLook): void;
  setSelected(entityId: string | null): void;
  /** 3D オブジェクトの頭上のキャンバス座標。DOM のラベルやポップアップを重ねるのに使う */
  project(entityId: string): ScreenPoint | null;
  /** 3D の世界を見せる範囲（キャンバスの CSS ピクセル。CameraRig.setFrame） */
  setFrame(frame: FrameRect | null): void;
  /** 島・キャラクター・パケットへカメラを寄せる（offset と zoom は CameraRig.focusOn と同じ） */
  focus(entityId: string, offset?: { x: number; y: number }, zoom?: number): void;
  /** 演出を再生する（fx/director が起動したもの）。ゲームの state には触れない */
  playFx(cue: FxCue): void;
  /** 入れ替えられた大きな演出を止める */
  cancelFx(tokens: readonly number[]): void;
  /** 生きているパーティクルの数（計測用） */
  particleCount(): number;
  /** 設定が変わったときに描き直す */
  redraw(): void;
  dispose(): void;
}

/** 島の上でキャラクターが立つ位置（島の中心からのずれ）。デスクの手前に並ぶ */
const ISLAND_SLOTS = [
  { x: 0.75, z: 0.15 },
  { x: 0.15, z: 0.75 },
  { x: 0.9, z: 0.9 },
];
/** 頭上の位置を求めるときの高さ（m） */
const ISLAND_LABEL_HEIGHT = 1.6;

/**
 * 2.5D ワールド。WorldViewModel を読んで Three.js のシーンへ差分同期し、描画する。
 * 状態は変えない（選択は onSelect で UI に知らせるだけ）。
 */
export function createWorld(canvas: HTMLCanvasElement, options: WorldOptions): World {
  const { visual, reducedMotion } = options;
  let look = options.look;
  const scene = new Scene();
  const ambient = new AmbientLight('#ffffff', 1);
  const sun = new DirectionalLight('#ffffff', 1);
  scene.add(ambient, sun);

  let invalidate = () => {};
  const rig = createCameraRig(look.camera, reducedMotion, () => invalidate());
  const vfx = createVfx(visual);
  const squash = createSquash(() => invalidate());
  scene.add(vfx.root);
  /** ワールドの時計（秒）。ヒットストップの間だけ遅く進む。シミュレーション（app/loop.ts）には関係しない */
  let worldTime = 0;
  const hitStop = { until: 0, scale: 1 };
  const shaking = { start: 0, durationMs: 0, amplitude: 0 };
  /** 島の持ち上げの動き方（最後に再生した演出の手触り） */
  let liftTransition = defaultFeel.motion.transition;
  const view = createWorldRenderer(
    canvas,
    scene,
    () => rig.camera,
    frame,
    (w, h) => rig.resize(w, h),
  );
  invalidate = view.invalidate;

  const models = new Map<ModelId, BufferGeometry>();
  let textures: { gradient: Texture; blob: Texture; face: Texture; floor: Texture } | null = null;
  let materials: WorldMaterials | null = null;
  let floorMaterial: MeshBasicMaterial | null = null;
  let stage: Stage | null = null;
  let actors: Actors | null = null;
  let packets: Packets | null = null;
  let bugs: IncidentBugs | null = null;
  /** 描いている整理度（ViewModel の値へゆっくり追従する） */
  let tidiness = 0;
  let layout: WorldLayout | null = null;
  let layoutKey = '';
  let vm: WorldViewModel | null = null;
  let selected: string | null = null;
  const selection = createMarkerRing(scaleColor('accent.400', visual), 0.95);
  const bottleneckRing = createMarkerRing(scaleColor(look.bottleneck.ringColor, visual), look.bottleneck.ringOpacity);
  scene.add(selection, bottleneckRing);

  const ready = (async () => {
    for (const [id, geometry] of await loadModelGeometries()) models.set(id, geometry);
    const [gradient, blob, face, floor] = await Promise.all([
      getTexture('toonGradient'),
      getTexture('blobShadow'),
      getTexture('faceAtlas'),
      getTexture('floor'),
    ]);
    textures = { gradient, blob, face, floor };
    applyLook();
  })();

  /** look・マテリアル・静的なシーンを作り直す。キャラクターとパケットの位置は引き継ぐ */
  function applyLook() {
    if (!textures) return;
    materials?.dispose();
    materials = createMaterials(look, visual, textures);
    scene.background = new Color(scaleColor(look.environment.background, visual));
    ambient.intensity = look.shading.ambient;
    sun.intensity = look.shading.sun;
    const el = (look.shading.sunElevationDeg * Math.PI) / 180;
    const az = (look.shading.sunAzimuthDeg * Math.PI) / 180;
    sun.position.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(20);
    floorMaterial?.dispose();
    textures.floor.repeat.set(1, 1);
    floorMaterial = new MeshBasicMaterial({
      map: textures.floor,
      color: scaleColor(look.environment.floorTint, visual),
    });
    (bottleneckRing.material as MeshBasicMaterial).color.set(scaleColor(look.bottleneck.ringColor, visual));
    rig.setLook(look.camera);

    if (actors) actors.rebuild(materials, look);
    else {
      actors = createActors(models, textures.face, { materials, look });
      scene.add(actors.root);
    }
    if (bugs) bugs.rebuild(materials, look);
    else {
      bugs = createIncidentBugs(models, { materials, look });
      scene.add(bugs.root);
    }
    if (packets) {
      scene.remove(packets.root);
      packets.dispose();
    }
    const packetGeometry = models.get('packet');
    if (packetGeometry) {
      packets = createPackets(packetGeometry, materials, look);
      scene.add(packets.root);
    }
    layoutKey = '';
    if (vm) sync(vm);
    invalidate();
  }

  function rebuildStage(next: WorldViewModel) {
    if (!materials || !floorMaterial || !textures) return;
    const env = look.environment;
    layout = layoutProject(
      next.islands.map((i) => ({ id: i.taskId, deps: i.deps })),
      { islandSize: env.islandSize, gap: env.islandGap },
    );
    // 床のタイルは 1 枚 2m で敷き詰める
    const b = layout.bounds;
    const margin = env.islandSize * 2;
    textures.floor.repeat.set((b.maxX - b.minX + margin * 2) / 2, (b.maxZ - b.minZ + margin * 2) / 2);
    if (stage) {
      scene.remove(stage.root);
      stage.dispose();
    }
    stage = createStage({ models, materials, look, visual, layout, floorMaterial });
    scene.add(stage.root);
    rig.setLayout(layout);
  }

  const islandCenter = (entityId: string) => {
    const taskId = entityId.replace(/^island:/, '');
    return layout?.islands.find((i) => i.id === taskId)?.center ?? null;
  };

  function actorTarget(actor: ActorView, all: readonly ActorView[]): Vector3 {
    if (!layout) return new Vector3();
    const same = all.filter((a) => a.islandId === actor.islandId);
    const index = same.indexOf(actor);
    if (actor.islandId) {
      const c = islandCenter(actor.islandId) ?? { x: 0, z: 0 };
      const slot = ISLAND_SLOTS[index % ISLAND_SLOTS.length] ?? { x: 0, z: 0 };
      return new Vector3(c.x + slot.x, look.environment.islandHeight, c.z + slot.z);
    }
    const l = layout.lounge;
    return new Vector3(l.x + 0.5, PAD_HEIGHT, l.z - 0.6 + index * 1.1);
  }

  function packetTarget(p: PacketView): PacketTarget {
    const size = look.flow.packetSize;
    const yaw = (look.camera.azimuthDeg * Math.PI) / 180;
    const h = look.environment.islandHeight;
    const half = look.environment.islandSize / 2;
    const place = p.place;
    if (place.kind === 'belt') {
      const conveyor = layout?.conveyors.find((c) => c.id === place.conveyorId);
      if (conveyor) {
        const { at, dir } = pointAlong(conveyor.points, place.progress);
        const position = new Vector3(at.x, BELT_TOP + size / 2, at.z);
        return { position, yaw: Math.atan2(dir.x, dir.z), moving: true, tilt: 0 };
      }
    }
    // 積み上がったものは、段ごとに決まった向きへ少しずつ乱す（ボトルネックの山を散らかって見せる）
    const jitter = (index: number) => look.bottleneck.pileJitter * Math.sin(index * 2.3 + 1);
    if (place.kind === 'stack' || place.kind === 'desk') {
      const c = islandCenter(place.islandId) ?? { x: 0, z: 0 };
      if (place.kind === 'desk') {
        return {
          position: new Vector3(c.x + DESK_OFFSET.x + 0.2, h + DESK_TOP + size / 2, c.z + DESK_OFFSET.z + 0.2),
          yaw,
          moving: false,
          tilt: 0,
        };
      }
      const y = h + size / 2 + place.index * look.flow.stackSpacing;
      return { position: new Vector3(c.x - half + 0.45, y, c.z + 0.55), yaw, moving: false, tilt: jitter(place.index) };
    }
    const e = layout?.exit ?? { x: 0, z: 0 };
    const index = place.kind === 'exit' ? place.index : 0;
    const position = new Vector3(e.x, PAD_HEIGHT + size / 2 + index * look.flow.stackSpacing, e.z);
    return { position, yaw, moving: false, tilt: 0 };
  }

  function sync(next: WorldViewModel) {
    const key = `${next.projectId}:${next.islands.map((i) => i.taskId).join(',')}`;
    if (key !== layoutKey) {
      layoutKey = key;
      rebuildStage(next);
    }
    actors?.sync(next.actors, (a) => actorTarget(a, next.actors));
    packets?.sync(next.packets, packetTarget);
    bugs?.sync(next.incidents, (id) => positionOf(id)?.pos ?? null);
  }

  /** 整理度を ViewModel の値へ近づけ、照明・床の色・島の下の模様・観葉植物に反映する。変化していれば true */
  function applyTidiness(dt: number, reduced: boolean): boolean {
    if (!vm || !stage || !floorMaterial) return false;
    const target = vm.tidiness;
    const step = look.reward.followRate * dt;
    const next = reduced
      ? target
      : target > tidiness
        ? Math.min(target, tidiness + step)
        : Math.max(target, tidiness - step);
    const changed = next !== tidiness;
    tidiness = next;
    const r = look.reward;
    ambient.intensity = look.shading.ambient * (1 + r.ambientBoost * tidiness);
    sun.intensity = look.shading.sun * (1 + r.sunBoost * tidiness);
    floorMaterial.color
      .set(scaleColor(look.environment.floorTint, visual))
      .lerp(new Color(scaleColor(r.floorTint, visual)), tidiness);
    stage.setTidiness(tidiness);
    return changed;
  }

  function positionOf(entityId: string): { pos: Vector3; radius: number; height: number } | null {
    if (entityId.startsWith('island:')) {
      const c = islandCenter(entityId);
      const h = look.environment.islandHeight;
      return c
        ? { pos: new Vector3(c.x, h, c.z), radius: look.environment.islandSize * 0.78, height: ISLAND_LABEL_HEIGHT }
        : null;
    }
    const actor = actors?.positionOf(entityId);
    if (actor) return { pos: actor, radius: 0.5, height: (actors?.headHeight ?? 1) * look.character.scale };
    const packet = packets?.positionOf(entityId);
    if (packet) return { pos: packet, radius: look.flow.packetSize, height: look.flow.packetSize };
    return null;
  }

  function placeRing(ring: Mesh, entityId: string | null): boolean {
    const at = entityId ? positionOf(entityId) : null;
    ring.visible = at !== null;
    if (!at) return false;
    ring.position.set(
      at.pos.x,
      Math.max(0.02, at.pos.y - (entityId?.startsWith('packet:') ? look.flow.packetSize / 2 : 0)) + 0.02,
      at.pos.z,
    );
    ring.scale.setScalar(at.radius);
    return true;
  }

  function frame(realDt: number): boolean {
    if (!stage || !actors || !packets || !vm) return false;
    const now = performance.now();
    const dt = realDt * (now < hitStop.until ? hitStop.scale : 1);
    worldTime += dt;
    const time = worldTime;
    const reduced = reducedMotion();
    const live = !vm.paused;
    const motion = live && !reduced;
    stage.update(vm.islands, time, motion, (id) => squash.get(id), vm.lanes);
    const walking = actors.frame({ dt, time, live, reducedMotion: reduced });
    const sliding = packets.frame(dt, time, live, reduced);
    const bugging = bugs?.frame(time, motion) ?? false;
    const brightening = applyTidiness(realDt, reduced);
    const shelving = stage.setBinders(vm.binders, realDt, reduced);
    const effects = vfx.frame(dt, rig.camera);
    const elapsed = now - shaking.start;
    const shakingNow = elapsed < shaking.durationMs;
    rig.nudge(shakingNow ? shakeOffset(elapsed, shaking.durationMs, shaking.amplitude) : { x: 0, y: 0 });
    placeRing(selection, selected);
    const bn = vm.bottleneck;
    if (placeRing(bottleneckRing, bn?.entityId ?? null) && bn) {
      const pulse = motion ? 0.65 + 0.35 * Math.sin(time * Math.PI * 2 * look.bottleneck.pulseHz) : 1;
      (bottleneckRing.material as MeshBasicMaterial).opacity =
        look.bottleneck.ringOpacity * pulse * (0.4 + 0.6 * bn.intensity);
    }
    // 進行中は毎フレーム描く。一時停止中（や動きを減らす設定）では、歩行・パケット・カメラが落ち着いたら止まる
    return (
      motion ||
      walking ||
      sliding ||
      bugging ||
      brightening ||
      shelving ||
      effects ||
      shakingNow ||
      squash.active() ||
      rig.moving()
    );
  }

  // 入力：ドラッグでパン、ホイールとピンチでズーム、動かさずに離したら選択
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = 0;
  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const onPointerDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) moved = 0;
  };
  const onPointerMove = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (pointers.size >= 2) {
      const before = pinchDistance();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const after = pinchDistance();
      if (before > 0 && after > 0) rig.zoomBy(after / before);
      moved = Number.POSITIVE_INFINITY;
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved += Math.hypot(dx, dy);
    if (moved > CLICK_SLOP) rig.panBy(dx, dy);
  };
  const onPointerUp = (e: PointerEvent) => {
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (!wasSingle || moved > CLICK_SLOP || !stage || !actors || !packets) return;
    const rect = canvas.getBoundingClientRect();
    const mesh = packets.mesh;
    const targets: Object3D[] = [...stage.pickables, ...actors.pickables(), ...(bugs?.pickables() ?? []), mesh];
    const entityId = pickEntity(
      e.clientX - rect.left,
      e.clientY - rect.top,
      { width: rect.width, height: rect.height },
      rig.camera,
      targets,
      (hit: InstancedMesh, i) => (hit === mesh ? packets?.idAt(i) : undefined),
    );
    options.onSelect({ type: 'SelectEntity', entityId });
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    rig.wheel(e.deltaY);
  };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return {
    ready,
    stats: view.stats,
    setViewModel(next) {
      vm = next;
      if (materials) sync(next);
      invalidate();
    },
    setLook(next) {
      look = next;
      applyLook();
    },
    setSelected(entityId) {
      selected = entityId;
      // 選択が島から外れたら持ち上げた島を下ろす（島を選んだときの持ち上げは Tier 0 の演出が行う）
      if (!entityId?.startsWith('island:')) squash.liftOnly(null, 0, liftTransition);
      invalidate();
    },
    project(entityId) {
      const at = positionOf(entityId);
      if (!at) return null;
      const p = at.pos.clone();
      p.y += at.height;
      return toScreen(p, rig.camera, canvas.clientWidth, canvas.clientHeight);
    },
    setFrame(frame) {
      rig.setFrame(frame);
      invalidate();
    },
    focus(entityId, offset = { x: 0, y: 0 }, zoom) {
      const at = positionOf(entityId);
      if (!at) return;
      rig.focusOn({ x: at.pos.x, z: at.pos.z }, offset, zoom);
      invalidate();
    },
    playFx(cue) {
      liftTransition = cue.feel.motion.transition;
      playCue(cue, {
        vfx,
        squash,
        actors,
        islandSize: look.environment.islandSize,
        groundOf: (entityId) => {
          if (entityId === null) {
            const e = layout?.exit;
            return e ? new Vector3(e.x, PAD_HEIGHT, e.z) : null;
          }
          const at = positionOf(entityId);
          return at ? at.pos.clone() : null;
        },
        actorIds: () => vm?.actors.map((a) => a.id) ?? [],
        headOf: (actorId) => {
          const at = positionOf(actorId);
          return at ? at.pos.clone().setY(at.pos.y + at.height) : null;
        },
        shake(amplitude, durationMs) {
          Object.assign(shaking, { start: performance.now(), durationMs, amplitude });
        },
        hitStop(durationMs, scale) {
          Object.assign(hitStop, { until: performance.now() + durationMs, scale });
        },
      });
      invalidate();
    },
    cancelFx(tokens) {
      if (tokens.length === 0) return;
      vfx.stopBig();
      shaking.durationMs = 0;
      invalidate();
    },
    particleCount: () => vfx.particleCount(),
    redraw: () => invalidate(),
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      stage?.dispose();
      actors?.dispose();
      bugs?.dispose();
      packets?.dispose();
      vfx.dispose();
      squash.dispose();
      materials?.dispose();
      floorMaterial?.dispose();
      rig.dispose();
      view.dispose();
    },
  };
}
