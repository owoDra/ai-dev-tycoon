import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  BufferGeometry as Geometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  type OrthographicCamera,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  type Vector3,
} from 'three';
import type { VisualPreset } from '../../content/look/visual';
import type { ScaleRef } from '../../content/look/world';
import { scaleColor } from '../materials';
import { createParticleLayer, type ParticleKind, type ParticleLayer } from './particles';

/**
 * ワールドの VFX（コインのバースト・紙吹雪・キラキラ・光る輪・パケットの軌跡・放射状の光・盾・床の光）。
 * パーティクルは種類ごとに InstancedMesh 1つ、輪・光・盾は少数のメッシュを使い回す（再生していないものは描かない）。
 * 時間は world の frame から受け取る（ヒットストップでワールドの時間を遅くすると、VFX も一緒に遅くなる）。
 */

/** 同時に出せる輪の数 */
const RING_POOL = 4;
/** 放射状の光の筋の数 */
const RAY_COUNT = 12;

/** 擬似乱数（VFX の見た目のばらつき用。ゲームの結果には関わらない） */
function createRand(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Timed {
  mesh: Mesh;
  start: number;
  duration: number;
  update: (t: number) => void;
}

export interface Vfx {
  readonly root: Group;
  coinBurst(at: Vector3, count: number, strength: number): void;
  confetti(at: Vector3, count: number, strength: number): void;
  sparkle(at: Vector3, count: number, radius: number): void;
  /** from から to へパケットが一斉に流れ、通り道にキラキラが残る */
  packetRush(from: Vector3, to: Vector3, count: number): void;
  /** 床に広がる光る輪 */
  ring(at: Vector3, radius: number, durationMs: number): void;
  /** 床にふっと出て消える光（拡大しない。reduced-motion の代替） */
  glow(at: Vector3, radius: number, durationMs: number): void;
  /** 放射状の光（カメラの方を向く） */
  rays(at: Vector3, size: number, durationMs: number): void;
  /** 盾のドーム */
  shield(at: Vector3, radius: number, durationMs: number): void;
  /** 再生中の輪・光・盾を止める（大きな演出の入れ替え） */
  stopBig(): void;
  /** dt 秒進める。まだ動いているものがあれば true */
  frame(dt: number, camera: OrthographicCamera): boolean;
  /** 生きているパーティクルの数（計測用） */
  particleCount(): number;
  dispose(): void;
}

export function createVfx(visual: VisualPreset): Vfx {
  const root = new Group();
  root.name = 'vfx';
  const color = (ref: ScaleRef) => new Color(scaleColor(ref, visual)).getHex();
  const palette = {
    coin: [color('accent.400'), color('accent.300'), color('warning.400')],
    confetti: [
      color('primary.400'),
      color('accent.400'),
      color('success.400'),
      color('primary.200'),
      color('warning.300'),
      color('danger.300'),
    ],
    sparkle: [0xffffff, color('accent.200'), color('accent.100')],
    packet: [color('primary.400'), color('primary.300')],
  };
  const rand = createRand(7);
  const pick = (list: readonly number[]) => list[Math.floor(rand() * list.length)] ?? 0xffffff;

  const geometries: BufferGeometry[] = [];
  const own = <G extends BufferGeometry>(g: G) => {
    geometries.push(g);
    return g;
  };
  const basic = (opts: ConstructorParameters<typeof MeshBasicMaterial>[0]) => new MeshBasicMaterial(opts);
  const materials: MeshBasicMaterial[] = [];
  const mat = (opts: ConstructorParameters<typeof MeshBasicMaterial>[0]) => {
    const m = basic(opts);
    materials.push(m);
    return m;
  };

  const layers: Record<ParticleKind, ParticleLayer> = {
    coin: createParticleLayer('coin', own(new CylinderGeometry(0.13, 0.13, 0.035, 14).rotateX(Math.PI / 2)), mat({})),
    confetti: createParticleLayer('confetti', own(new PlaneGeometry(0.09, 0.15)), mat({ side: DoubleSide })),
    sparkle: createParticleLayer(
      'sparkle',
      own(new OctahedronGeometry(0.07)),
      mat({ transparent: true, blending: AdditiveBlending, depthWrite: false }),
    ),
    packet: createParticleLayer('packet', own(new BoxGeometry(0.18, 0.18, 0.18)), mat({})),
  };
  for (const l of Object.values(layers)) root.add(l.mesh);

  let time = 0;
  const timed: Timed[] = [];
  const play = (mesh: Mesh, duration: number, update: (t: number) => void) => {
    const existing = timed.findIndex((x) => x.mesh === mesh);
    if (existing >= 0) timed.splice(existing, 1);
    mesh.visible = true;
    timed.push({ mesh, start: time, duration, update });
    update(0);
  };

  const ringGeometry = own(new RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2));
  const rings = Array.from({ length: RING_POOL }, () => {
    const m = new Mesh(
      ringGeometry,
      mat({ color: color('accent.300'), transparent: true, depthWrite: false, blending: AdditiveBlending }),
    );
    m.visible = false;
    m.renderOrder = 2;
    root.add(m);
    return m;
  });
  let ringNext = 0;

  const glowMesh = new Mesh(
    own(new RingGeometry(0, 1, 40).rotateX(-Math.PI / 2)),
    mat({ color: color('accent.200'), transparent: true, depthWrite: false }),
  );
  glowMesh.visible = false;
  glowMesh.renderOrder = 1;
  root.add(glowMesh);

  // 放射状の光：中心から細い三角形を等間隔に並べた扇
  const rayPositions: number[] = [];
  for (let i = 0; i < RAY_COUNT; i++) {
    const a = (i / RAY_COUNT) * Math.PI * 2;
    const w = (Math.PI / RAY_COUNT) * 0.45;
    rayPositions.push(0, 0, 0, Math.cos(a - w), Math.sin(a - w), 0, Math.cos(a + w), Math.sin(a + w), 0);
  }
  const rayGeometry = own(new Geometry());
  rayGeometry.setAttribute('position', new Float32BufferAttribute(rayPositions, 3));
  const raysMesh = new Mesh(
    rayGeometry,
    // 明るい床の上でも見えるよう、加算ではなく色の付いた半透明で描く
    mat({ color: color('accent.300'), transparent: true, depthWrite: false, depthTest: false, side: DoubleSide }),
  );
  raysMesh.visible = false;
  raysMesh.renderOrder = 4;
  root.add(raysMesh);

  const shieldMesh = new Mesh(
    own(new SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
    mat({ color: color('primary.200'), transparent: true, depthWrite: false, side: DoubleSide }),
  );
  shieldMesh.visible = false;
  shieldMesh.renderOrder = 2;
  root.add(shieldMesh);
  const shieldRim = new Mesh(ringGeometry, mat({ color: color('primary.400'), transparent: true, depthWrite: false }));
  shieldRim.visible = false;
  root.add(shieldRim);

  const opacityOf = (m: Mesh) => m.material as MeshBasicMaterial;
  let camera: OrthographicCamera | null = null;

  return {
    root,
    coinBurst(at, count, strength) {
      for (let i = 0; i < count; i++) {
        const a = rand() * Math.PI * 2;
        const r = (0.8 + rand() * 1.4) * strength;
        layers.coin.pool.spawn({
          x: at.x,
          y: at.y + 0.3,
          z: at.z,
          vx: Math.cos(a) * r,
          vy: (3.2 + rand() * 2) * strength,
          vz: Math.sin(a) * r,
          life: 0.9 + rand() * 0.4,
          delay: rand() * 0.08,
          gravity: 11,
          spin: 8 + rand() * 6,
          size: 1,
          color: pick(palette.coin),
        });
      }
    },
    confetti(at, count, strength) {
      for (let i = 0; i < count; i++) {
        const a = rand() * Math.PI * 2;
        const r = (1 + rand() * 3) * strength;
        layers.confetti.pool.spawn({
          x: at.x + (rand() - 0.5) * 0.6,
          y: at.y + 0.4,
          z: at.z + (rand() - 0.5) * 0.6,
          vx: Math.cos(a) * r,
          vy: (4 + rand() * 3) * strength,
          vz: Math.sin(a) * r,
          life: 1.6 + rand() * 0.9,
          delay: rand() * 0.15,
          gravity: 5,
          drag: 1.6,
          spin: 5 + rand() * 9,
          size: 1,
          color: pick(palette.confetti),
        });
      }
    },
    sparkle(at, count, radius) {
      for (let i = 0; i < count; i++) {
        const a = rand() * Math.PI * 2;
        const r = radius * (0.3 + rand() * 0.7);
        layers.sparkle.pool.spawn({
          x: at.x + Math.cos(a) * r,
          y: at.y + 0.2 + rand() * 1.2,
          z: at.z + Math.sin(a) * r,
          vx: 0,
          vy: 0.5 + rand() * 0.6,
          vz: 0,
          life: 0.5 + rand() * 0.5,
          delay: rand() * 0.4,
          spin: 6,
          size: 0.6 + rand() * 0.8,
          color: pick(palette.sparkle),
        });
      }
    },
    packetRush(from, to, count) {
      const life = 0.9;
      for (let i = 0; i < count; i++) {
        const delay = i * 0.07;
        const jitter = (rand() - 0.5) * 0.4;
        layers.packet.pool.spawn({
          x: from.x + jitter,
          y: from.y + 0.4,
          z: from.z - jitter,
          vx: (to.x - from.x) / life,
          vy: (to.y - from.y) / life + 3,
          vz: (to.z - from.z) / life,
          life,
          delay,
          gravity: 6.6,
          spin: 4,
          size: 1,
          color: pick(palette.packet),
        });
        // 通り道に残る軌跡
        const k = rand();
        layers.sparkle.pool.spawn({
          x: from.x + (to.x - from.x) * k,
          y: from.y + 0.6 + Math.sin(k * Math.PI) * 0.6,
          z: from.z + (to.z - from.z) * k,
          vx: 0,
          vy: 0.2,
          vz: 0,
          life: 0.5,
          delay: delay + life * k,
          size: 0.7,
          color: pick(palette.sparkle),
        });
      }
    },
    ring(at, radius, durationMs) {
      const m = rings[ringNext++ % RING_POOL];
      if (!m) return;
      m.position.set(at.x, at.y + 0.03, at.z);
      play(m, durationMs / 1000, (t) => {
        m.scale.setScalar(radius * (0.3 + 0.7 * (1 - (1 - t) ** 3)));
        opacityOf(m).opacity = 0.9 * (1 - t);
      });
    },
    glow(at, radius, durationMs) {
      glowMesh.position.set(at.x, at.y + 0.025, at.z);
      glowMesh.scale.setScalar(radius);
      play(glowMesh, durationMs / 1000, (t) => {
        opacityOf(glowMesh).opacity = 0.55 * Math.sin(Math.PI * t);
      });
    },
    rays(at, size, durationMs) {
      raysMesh.position.copy(at);
      play(raysMesh, durationMs / 1000, (t) => {
        const grow = 1 - (1 - Math.min(1, t * 3)) ** 3;
        raysMesh.scale.setScalar(size * grow);
        if (camera) raysMesh.quaternion.copy(camera.quaternion);
        raysMesh.rotateZ(t * 1.2);
        opacityOf(raysMesh).opacity = 0.6 * (t < 0.7 ? 1 : (1 - t) / 0.3);
      });
    },
    shield(at, radius, durationMs) {
      shieldMesh.position.set(at.x, at.y, at.z);
      shieldRim.position.set(at.x, at.y + 0.03, at.z);
      play(shieldMesh, durationMs / 1000, (t) => {
        const grow = t < 0.25 ? 1 - (1 - t / 0.25) ** 3 : 1;
        shieldMesh.scale.set(radius * grow, radius * grow * 0.9, radius * grow);
        opacityOf(shieldMesh).opacity = 0.35 * (t < 0.75 ? 1 : (1 - t) / 0.25);
      });
      play(shieldRim, durationMs / 1000, (t) => {
        shieldRim.scale.setScalar(radius * (t < 0.25 ? t / 0.25 : 1));
        opacityOf(shieldRim).opacity = 0.9 * (1 - t);
      });
    },
    stopBig() {
      for (const x of timed.splice(0)) x.mesh.visible = false;
      layers.confetti.pool.clear();
      layers.packet.pool.clear();
    },
    frame(dt, cam) {
      camera = cam;
      time += dt;
      let active = false;
      for (const l of Object.values(layers)) active = l.frame(dt) || active;
      for (let i = timed.length - 1; i >= 0; i--) {
        const x = timed[i];
        if (!x) continue;
        const t = (time - x.start) / x.duration;
        if (t >= 1) {
          x.mesh.visible = false;
          timed.splice(i, 1);
          continue;
        }
        x.update(t);
      }
      return active || timed.length > 0;
    },
    particleCount: () => Object.values(layers).reduce((sum, l) => sum + l.pool.count, 0),
    dispose() {
      for (const l of Object.values(layers)) l.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
