/**
 * 案件の Task 依存グラフから、島の配置とコンベアの経路を計算する（純粋関数・Three.js に依存しない）。
 * 座標は床の上の (x, z)（単位 m）。仕事は +x の向きへ流れ、アイソメトリックのカメラ（camera.ts）では
 * 画面の左上から右下へ流れて見える。並行する Task は z の向きに並べる。
 */

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export interface LayoutTask {
  readonly id: string;
  readonly deps: readonly string[];
}

export interface LayoutParams {
  /** 島の一辺（m） */
  readonly islandSize: number;
  /** 島どうしのすき間（m） */
  readonly gap: number;
}

export interface IslandPlacement {
  readonly id: string;
  /** 依存の深さ（最初の Task が 0） */
  readonly column: number;
  /** 同じ深さの中での並び（0 から） */
  readonly row: number;
  /** 島の中心 */
  readonly center: Vec2;
}

/** 出口（納品）を表す特別な行き先の ID */
export const EXIT_ID = 'exit';

export interface ConveyorPath {
  /** `<from>-><to>`。to は Task の id か EXIT_ID */
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** 折れ線の頂点（島の縁から島の縁まで） */
  readonly points: readonly Vec2[];
  readonly length: number;
}

export interface WorldLayout {
  readonly islands: readonly IslandPlacement[];
  readonly conveyors: readonly ConveyorPath[];
  /** 待機中の人間がいる休憩所と、納品物が届く出口の中心 */
  readonly lounge: Vec2;
  readonly exit: Vec2;
  /** 島・休憩所・出口を含む範囲 */
  readonly bounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
}

export const conveyorId = (from: string, to: string) => `${from}->${to}`;

/** 各 Task の依存の深さ（最長経路）。未知の依存は無視する */
function depths(tasks: readonly LayoutTask[]): Map<string, number> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const memo = new Map<string, number>();
  const visit = (id: string, stack: Set<string>): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (stack.has(id)) throw new Error(`依存が循環している: ${id}`);
    stack.add(id);
    const deps = (byId.get(id)?.deps ?? []).filter((d) => byId.has(d));
    const d = deps.length === 0 ? 0 : Math.max(...deps.map((dep) => visit(dep, stack) + 1));
    stack.delete(id);
    memo.set(id, d);
    return d;
  };
  for (const t of tasks) visit(t.id, new Set());
  return memo;
}

/** 頂点を結ぶ折れ線の長さ */
export function pathLength(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) sum += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return sum;
}

/** 折れ線の上で、始点から t（0〜1）の割合だけ進んだ位置と、その区間の向き（単位ベクトル） */
export function pointAlong(points: readonly Vec2[], t: number): { at: Vec2; dir: Vec2 } {
  const total = pathLength(points);
  let rest = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const dir = len > 0 ? { x: (b.x - a.x) / len, z: (b.z - a.z) / len } : { x: 1, z: 0 };
    if (rest <= len || i === points.length - 1) {
      const k = len > 0 ? Math.min(1, rest / len) : 0;
      return { at: { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k }, dir };
    }
    rest -= len;
  }
  const only = points[0] ?? { x: 0, z: 0 };
  return { at: only, dir: { x: 1, z: 0 } };
}

/** 島の右の縁から次の島の左の縁へ、中間で z を合わせる直角の経路 */
function route(from: Vec2, to: Vec2, half: number): Vec2[] {
  const start = { x: from.x + half, z: from.z };
  const end = { x: to.x - half, z: to.z };
  if (start.z === end.z) return [start, end];
  const midX = (start.x + end.x) / 2;
  return [start, { x: midX, z: start.z }, { x: midX, z: end.z }, end];
}

/**
 * 島の配置とコンベアを計算する。
 * - 列（x）は依存の深さ。依存はかならず左の列から右の列へ向かう
 * - 列の中の並び（z）は、依存元の並びの平均が小さい順（同じなら定義順）にし、列ごとに 0 を中心にそろえる
 * - 終端の Task（他の Task から依存されない）は出口へつなぐ
 * 同じ入力からはかならず同じ結果を返す。
 */
export function layoutProject(tasks: readonly LayoutTask[], params: LayoutParams): WorldLayout {
  const pitch = params.islandSize + params.gap;
  const half = params.islandSize / 2;
  const depth = depths(tasks);
  const columns = new Map<number, LayoutTask[]>();
  for (const t of tasks) {
    const d = depth.get(t.id) ?? 0;
    columns.set(d, [...(columns.get(d) ?? []), t]);
  }

  const rowOf = new Map<string, number>();
  const placements: IslandPlacement[] = [];
  const columnCount = columns.size === 0 ? 0 : Math.max(...columns.keys()) + 1;
  for (let c = 0; c < columnCount; c++) {
    const col = columns.get(c) ?? [];
    const keyed = col.map((t, order) => {
      const rows = t.deps.map((d) => rowOf.get(d)).filter((r): r is number => r !== undefined);
      const key = rows.length === 0 ? 0 : rows.reduce((a, b) => a + b, 0) / rows.length;
      return { t, key, order };
    });
    keyed.sort((a, b) => a.key - b.key || a.order - b.order);
    keyed.forEach(({ t }, i) => {
      const row = i - (keyed.length - 1) / 2;
      rowOf.set(t.id, row);
      placements.push({ id: t.id, column: c, row: i, center: { x: c * pitch, z: row * pitch } });
    });
  }

  const centerOf = new Map(placements.map((p) => [p.id, p.center]));
  const lounge = { x: -pitch, z: 0 };
  const exit = { x: columnCount * pitch, z: 0 };
  const conveyors: ConveyorPath[] = [];
  for (const t of tasks) {
    const to = centerOf.get(t.id);
    if (!to) continue;
    for (const dep of t.deps) {
      const from = centerOf.get(dep);
      if (!from) continue;
      const points = route(from, to, half);
      conveyors.push({ id: conveyorId(dep, t.id), from: dep, to: t.id, points, length: pathLength(points) });
    }
  }
  const hasDependents = new Set(tasks.flatMap((t) => t.deps));
  for (const p of placements) {
    if (hasDependents.has(p.id)) continue;
    const points = route(p.center, exit, half).map((v, i, all) =>
      i === all.length - 1 ? { ...v, x: exit.x - half / 2 } : v,
    );
    conveyors.push({ id: conveyorId(p.id, EXIT_ID), from: p.id, to: EXIT_ID, points, length: pathLength(points) });
  }

  const xs = [lounge.x, exit.x, ...placements.map((p) => p.center.x)];
  const zs = [0, ...placements.map((p) => p.center.z)];
  return {
    islands: placements,
    conveyors,
    lounge,
    exit,
    bounds: {
      minX: Math.min(...xs) - half,
      maxX: Math.max(...xs) + half,
      minZ: Math.min(...zs) - half,
      maxZ: Math.max(...zs) + half,
    },
  };
}
