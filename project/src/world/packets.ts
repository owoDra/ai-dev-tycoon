import { type BufferGeometry, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { WorldLook } from '../content/look/world';
import type { PacketView } from '../view/world';
import type { WorldMaterials } from './materials';

/**
 * パケット（光る小包）の描画。すべてのパケットを1つの InstancedMesh（＋アウトライン）で描く。
 * 目標の位置へ指数的に近づけてなめらかに動かし、新しいパケットは目標の位置に現れる。
 */

/** 同時に描けるパケットの上限 */
export const MAX_PACKETS = 96;
/** 目標へ近づく速さ（1/秒） */
const FOLLOW = 14;
/** 目標に着いたとみなす距離（m） */
const SETTLED = 0.002;

export interface PacketTarget {
  readonly position: Vector3;
  /** 進む向き（ラジアン） */
  readonly yaw: number;
}

interface PacketState {
  readonly pos: Vector3;
  readonly target: Vector3;
  yaw: number;
}

export interface Packets {
  readonly root: Group;
  readonly mesh: InstancedMesh;
  sync(views: readonly PacketView[], targetOf: (view: PacketView) => PacketTarget): void;
  frame(dt: number, time: number, live: boolean, reducedMotion: boolean): boolean;
  /** Raycaster の instanceId から ID を引く */
  idAt(instanceId: number): string | undefined;
  positionOf(id: string): Vector3 | null;
  dispose(): void;
}

export function createPackets(geometry: BufferGeometry, materials: WorldMaterials, look: WorldLook): Packets {
  const root = new Group();
  root.name = 'packets';
  const mesh = new InstancedMesh(geometry, materials.packet, MAX_PACKETS);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  root.add(mesh);
  let outline: InstancedMesh | null = null;
  if (look.outline.enabled) {
    outline = new InstancedMesh(geometry, materials.outline, MAX_PACKETS);
    outline.instanceMatrix = mesh.instanceMatrix;
    outline.count = 0;
    outline.frustumCulled = false;
    root.add(outline);
  }

  let order: string[] = [];
  const states = new Map<string, PacketState>();
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const scale = new Vector3();
  const p = new Vector3();

  return {
    root,
    mesh,
    sync(views, targetOf) {
      const next = new Map<string, PacketState>();
      for (const view of views.slice(0, MAX_PACKETS)) {
        const t = targetOf(view);
        const prev = states.get(view.id);
        const state = prev ?? { pos: t.position.clone(), target: t.position.clone(), yaw: t.yaw };
        state.target.copy(t.position);
        state.yaw = t.yaw;
        next.set(view.id, state);
      }
      states.clear();
      for (const [id, s] of next) states.set(id, s);
      order = [...states.keys()];
    },
    frame(dt, time, live, reducedMotion) {
      const k = reducedMotion ? 1 : 1 - Math.exp(-FOLLOW * dt);
      const size = look.flow.packetSize;
      let moving = false;
      order.forEach((id, i) => {
        const s = states.get(id);
        if (!s) return;
        s.pos.lerp(s.target, k);
        if (s.pos.distanceTo(s.target) > SETTLED) moving = true;
        const bob = live && !reducedMotion ? 0.03 * Math.sin(time * 4 + i) : 0;
        p.copy(s.pos).setY(s.pos.y + bob);
        q.setFromAxisAngle(up, s.yaw);
        m.compose(p, q, scale.setScalar(size));
        mesh.setMatrixAt(i, m);
      });
      mesh.count = order.length;
      if (outline) outline.count = order.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      return moving;
    },
    idAt: (instanceId) => order[instanceId],
    positionOf: (id) => states.get(id)?.pos ?? null,
    dispose() {
      mesh.dispose();
      outline?.dispose();
    },
  };
}
