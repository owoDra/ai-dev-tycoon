import { type BufferGeometry, Group, Mesh, type Object3D, PlaneGeometry, type Vector3 } from 'three';
import type { ModelId } from '../assets/catalog';
import type { WorldLook } from '../content/look/world';
import type { IncidentBugView } from '../view/world';
import { outlined } from './islands';
import type { WorldMaterials } from './materials';

/** 島の中心からのバグ生物の位置（島の角）。同じ島に複数いれば順にずらす */
const SPOTS = [
  { x: -0.95, z: 0.95 },
  { x: 0.95, z: -0.95 },
  { x: -0.95, z: -0.6 },
  { x: 0.6, z: 0.95 },
];

interface Bug {
  readonly view: IncidentBugView;
  readonly group: Group;
  readonly body: Group;
  /** 出てきた時刻（秒） */
  readonly born: number;
  /** 弾けて消え始めた時刻（秒）。消えていなければ null */
  gone: number | null;
}

export interface IncidentBugs {
  readonly root: Group;
  /** ViewModel の事件に合わせて出し入れする。消えた事件は弾けて消える */
  sync(views: readonly IncidentBugView[], islandGround: (islandId: string) => Vector3 | null): void;
  /** 選択できるメッシュ（押すと事件の起きた島を選ぶ） */
  pickables(): Object3D[];
  /** 動いているか（描き続ける必要があるか）を返す */
  frame(time: number, motion: boolean): boolean;
  rebuild(materials: WorldMaterials, look: WorldLook): void;
  dispose(): void;
}

/**
 * 事件の「バグ生物」（企画書19章：技術的な問題を敵として登場させる）。事件の起きた島の角で跳ね回り、
 * 解決すると弾けて消える（弾ける演出のパーティクルは Tier 2 の演出が出す）。動きを減らす設定では跳ねず、すぐに消える。
 * 状態は変えない（ViewModel を読むだけ）。
 */
export function createIncidentBugs(
  models: ReadonlyMap<ModelId, BufferGeometry>,
  options: { materials: WorldMaterials; look: WorldLook },
): IncidentBugs {
  let { materials, look } = options;
  const root = new Group();
  root.name = 'incidentBugs';
  const shadowGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const bugs = new Map<string, Bug>();
  let now = 0;

  function build(view: IncidentBugView): Group {
    const group = new Group();
    const geometry = models.get(view.model);
    const body = geometry ? outlined(geometry, materials.vertex, materials, look.outline.enabled) : new Group();
    body.traverse((o) => {
      o.userData.entityId = view.islandId;
    });
    body.rotation.y = (look.camera.azimuthDeg * Math.PI) / 180;
    group.add(body);
    const shadow = new Mesh(shadowGeometry, materials.shadow);
    shadow.position.y = 0.01;
    shadow.scale.setScalar(0.7 * look.incident.scale);
    group.add(shadow);
    return group;
  }

  /** 出てくるときは膨らみ、消えるときは一度大きくなってから弾ける（0〜） */
  function scaleOf(bug: Bug, motion: boolean): number {
    const pop = look.incident.popSeconds;
    if (bug.gone !== null) {
      if (!motion) return 0;
      const t = (now - bug.gone) / pop;
      return t >= 1 ? 0 : 1 + 0.5 * Math.sin(t * Math.PI * 0.5) - (t > 0.6 ? (t - 0.6) * 3.5 : 0);
    }
    if (!motion) return 1;
    const t = Math.min(1, (now - bug.born) / pop);
    // 少し行き過ぎてから落ち着く
    return t >= 1 ? 1 : Math.sin(t * Math.PI * 0.75) / Math.sin(Math.PI * 0.75);
  }

  return {
    root,
    sync(views, islandGround) {
      const ids = new Set(views.map((v) => v.id));
      for (const bug of bugs.values()) {
        if (!ids.has(bug.view.id) && bug.gone === null) bug.gone = now;
      }
      const perIsland = new Map<string, number>();
      for (const view of views) {
        const index = perIsland.get(view.islandId) ?? 0;
        perIsland.set(view.islandId, index + 1);
        let bug = bugs.get(view.id);
        if (!bug || bug.gone !== null) {
          if (bug) root.remove(bug.group);
          const group = build(view);
          bug = { view, group, body: group.children[0] as Group, born: now, gone: null };
          bugs.set(view.id, bug);
          root.add(group);
        }
        const ground = islandGround(view.islandId);
        const spot = SPOTS[index % SPOTS.length] ?? { x: 0, z: 0 };
        if (ground) bug.group.position.set(ground.x + spot.x, ground.y, ground.z + spot.z);
      }
    },
    pickables() {
      return [...bugs.values()].filter((b) => b.gone === null).flatMap((b) => b.body.children);
    },
    frame(time, motion) {
      now = time;
      let moving = false;
      for (const [id, bug] of bugs) {
        const s = scaleOf(bug, motion) * look.incident.scale;
        if (s <= 0) {
          root.remove(bug.group);
          bugs.delete(id);
          continue;
        }
        bug.group.scale.setScalar(s);
        const phase = time * Math.PI * 2 * look.incident.hopHz + bug.born * 1.7;
        bug.body.position.y = motion && bug.gone === null ? Math.abs(Math.sin(phase)) * look.incident.hop : 0;
        bug.body.rotation.z = motion ? 0.12 * Math.sin(phase * 0.5) : 0;
        moving ||= motion || bug.gone !== null;
      }
      return moving;
    },
    rebuild(nextMaterials, nextLook) {
      materials = nextMaterials;
      look = nextLook;
      for (const [id, bug] of bugs) {
        root.remove(bug.group);
        if (bug.gone !== null) {
          bugs.delete(id);
          continue;
        }
        const group = build(bug.view);
        group.position.copy(bug.group.position);
        bugs.set(id, { ...bug, group, body: group.children[0] as Group });
        root.add(group);
      }
    },
    dispose() {
      shadowGeometry.dispose();
    },
  };
}
