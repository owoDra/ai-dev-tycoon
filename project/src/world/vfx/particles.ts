import { type BufferGeometry, Color, Euler, InstancedMesh, type Material, Matrix4, Quaternion, Vector3 } from 'three';

/**
 * 共通のパーティクルシステム。1種類につき InstancedMesh を1つ（draw call 1回）だけ使い、
 * 寿命・速度・重力・空気抵抗・回転を CPU で進める。プールの上限を超える生成は捨てる（古いものは消さない）。
 */

export type ParticleKind = 'coin' | 'confetti' | 'sparkle' | 'packet';

/**
 * 種類ごとのプールの上限。合計 640 個・draw call 4 回で、ソフトウェア描画でも 60fps を保てる量にしている
 * （1個は数十頂点の小さなメッシュ。上限いっぱいでも行列の書き込みは 1 フレーム 640 回）。
 * feel.ts の particles をどれだけ大きくしても、ここで切り詰める。
 */
export const PARTICLE_LIMITS: Readonly<Record<ParticleKind, number>> = {
  coin: 96,
  confetti: 320,
  sparkle: 160,
  packet: 64,
};

/** すべての種類を合わせた上限 */
export const PARTICLE_TOTAL = Object.values(PARTICLE_LIMITS).reduce((sum, n) => sum + n, 0);

export interface ParticleInit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** 寿命（秒） */
  life: number;
  /** 出現を遅らせる時間（秒）。待っている間は見えない */
  delay?: number;
  /** 下向きの加速度（m/s²） */
  gravity?: number;
  /** 空気抵抗（1秒あたりに速度が残る割合の対数。大きいほど早く止まる） */
  drag?: number;
  /** 回転の速さ（rad/s） */
  spin?: number;
  size: number;
  color: number;
}

/** 1個あたりの値の数 */
const STRIDE = 14;
/** 1個分の値の並び（STRIDE 個ずつ） */
const F = {
  X: 0,
  Y: 1,
  Z: 2,
  VX: 3,
  VY: 4,
  VZ: 5,
  AGE: 6,
  LIFE: 7,
  GRAVITY: 8,
  DRAG: 9,
  SPIN: 10,
  SIZE: 11,
  COLOR: 12,
  AXIS: 13,
} as const;

/** パーティクルの値を詰めた配列（構造体の配列ではなく、1本の Float32Array） */
export class ParticlePool {
  readonly capacity: number;
  private data: Float32Array;
  private alive = 0;
  /** 上限を超えて捨てた数（計測用） */
  dropped = 0;

  constructor(capacity: number) {
    this.capacity = Math.max(0, Math.floor(capacity));
    this.data = new Float32Array(this.capacity * STRIDE);
  }

  get count(): number {
    return this.alive;
  }

  /** 1個生成する。プールがいっぱいなら何もせず false を返す */
  spawn(p: ParticleInit): boolean {
    if (this.alive >= this.capacity) {
      this.dropped++;
      return false;
    }
    const o = this.alive * STRIDE;
    const d = this.data;
    d[o + F.X] = p.x;
    d[o + F.Y] = p.y;
    d[o + F.Z] = p.z;
    d[o + F.VX] = p.vx;
    d[o + F.VY] = p.vy;
    d[o + F.VZ] = p.vz;
    d[o + F.AGE] = -(p.delay ?? 0);
    d[o + F.LIFE] = p.life;
    d[o + F.GRAVITY] = p.gravity ?? 0;
    d[o + F.DRAG] = p.drag ?? 0;
    d[o + F.SPIN] = p.spin ?? 0;
    d[o + F.SIZE] = p.size;
    d[o + F.COLOR] = p.color;
    // 回転軸は位置と速度から決める（乱数を持たずに、粒ごとにばらばらに回す）
    d[o + F.AXIS] = (p.x * 12.9898 + p.z * 78.233 + p.vy) % (Math.PI * 2);
    this.alive++;
    return true;
  }

  /** dt 秒進める。寿命が尽きたものは末尾と入れ替えて取り除く */
  step(dt: number): void {
    const d = this.data;
    for (let i = 0; i < this.alive; ) {
      const o = i * STRIDE;
      const age = (d[o + F.AGE] ?? 0) + dt;
      d[o + F.AGE] = age;
      if (age >= (d[o + F.LIFE] ?? 0)) {
        this.remove(i);
        continue;
      }
      if (age > 0) {
        const keep = Math.exp(-(d[o + F.DRAG] ?? 0) * dt);
        d[o + F.VX] = (d[o + F.VX] ?? 0) * keep;
        d[o + F.VZ] = (d[o + F.VZ] ?? 0) * keep;
        d[o + F.VY] = (d[o + F.VY] ?? 0) * keep - (d[o + F.GRAVITY] ?? 0) * dt;
        d[o + F.X] = (d[o + F.X] ?? 0) + (d[o + F.VX] ?? 0) * dt;
        d[o + F.Y] = (d[o + F.Y] ?? 0) + (d[o + F.VY] ?? 0) * dt;
        d[o + F.Z] = (d[o + F.Z] ?? 0) + (d[o + F.VZ] ?? 0) * dt;
      }
      i++;
    }
  }

  clear(): void {
    this.alive = 0;
  }

  /** 生きている（出現済みの）パーティクルを順に渡す。t は寿命に対する経過の割合（0〜1） */
  forEach(
    fn: (p: {
      x: number;
      y: number;
      z: number;
      t: number;
      age: number;
      size: number;
      spin: number;
      axis: number;
      color: number;
    }) => void,
  ): void {
    const d = this.data;
    for (let i = 0; i < this.alive; i++) {
      const o = i * STRIDE;
      const age = d[o + F.AGE] ?? 0;
      if (age < 0) continue;
      fn({
        x: d[o + F.X] ?? 0,
        y: d[o + F.Y] ?? 0,
        z: d[o + F.Z] ?? 0,
        t: age / (d[o + F.LIFE] ?? 1),
        age,
        size: d[o + F.SIZE] ?? 0,
        spin: d[o + F.SPIN] ?? 0,
        axis: d[o + F.AXIS] ?? 0,
        color: d[o + F.COLOR] ?? 0,
      });
    }
  }

  private remove(i: number): void {
    const last = this.alive - 1;
    if (i !== last) this.data.copyWithin(i * STRIDE, last * STRIDE, last * STRIDE + STRIDE);
    this.alive--;
  }
}

/** 寿命の終わりのこの割合で縮んで消える */
const FADE_TAIL = 0.25;

export interface ParticleLayer {
  readonly mesh: InstancedMesh;
  readonly pool: ParticlePool;
  /** dt 秒進めて InstancedMesh に書き込む。まだ残っていれば true */
  frame(dt: number): boolean;
  dispose(): void;
}

/** 1種類のパーティクルを InstancedMesh で描く層 */
export function createParticleLayer(kind: ParticleKind, geometry: BufferGeometry, material: Material): ParticleLayer {
  const capacity = PARTICLE_LIMITS[kind];
  const pool = new ParticlePool(capacity);
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = `vfx:${kind}`;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  mesh.renderOrder = 3;
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const pos = new Vector3();
  const scale = new Vector3();
  const color = new Color();

  return {
    mesh,
    pool,
    frame(dt) {
      pool.step(dt);
      let n = 0;
      pool.forEach((p) => {
        const fade = p.t > 1 - FADE_TAIL ? (1 - p.t) / FADE_TAIL : 1;
        const spin = p.spin * p.age;
        e.set(spin * Math.cos(p.axis), spin, spin * Math.sin(p.axis));
        q.setFromEuler(e);
        scale.setScalar(Math.max(0.0001, p.size * fade));
        m.compose(pos.set(p.x, p.y, p.z), q, scale);
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, color.setHex(p.color));
        n++;
      });
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return pool.count > 0;
    },
    dispose() {
      mesh.dispose();
    },
  };
}
