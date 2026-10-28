import { describe, expect, it } from 'vitest';
import { ecRenewal } from '../../src/content/projects/ec-renewal';
import { EXIT_ID, type LayoutTask, layoutProject, pathLength, pointAlong } from '../../src/world/layout';

const params = { islandSize: 3, gap: 2 };
const ec = layoutProject(ecRenewal.tasks, params);

/** 分岐と合流の多いグラフ（菱形が2つ連なる） */
const diamond: LayoutTask[] = [
  { id: 'a', deps: [] },
  { id: 'b', deps: ['a'] },
  { id: 'c', deps: ['a'] },
  { id: 'd', deps: ['a'] },
  { id: 'e', deps: ['b', 'c'] },
  { id: 'f', deps: ['d'] },
  { id: 'g', deps: ['e', 'f'] },
];

describe('layoutProject', () => {
  it.each([
    ['ECサイト', ecRenewal.tasks],
    ['菱形', diamond],
  ] as const)('%s: 島どうしが重ならない', (_name, tasks) => {
    const { islands } = layoutProject(tasks, params);
    expect(islands).toHaveLength(tasks.length);
    for (const a of islands) {
      for (const b of islands) {
        if (a === b) continue;
        const separated =
          Math.abs(a.center.x - b.center.x) >= params.islandSize ||
          Math.abs(a.center.z - b.center.z) >= params.islandSize;
        expect(separated, `${a.id} と ${b.id}`).toBe(true);
      }
    }
  });

  it.each([
    ['ECサイト', ecRenewal.tasks],
    ['菱形', diamond],
  ] as const)('%s: 依存は左上から右下へ（+x の向きへ）流れ、コンベアは逆走しない', (_name, tasks) => {
    const layout = layoutProject(tasks, params);
    const center = new Map(layout.islands.map((i) => [i.id, i.center]));
    for (const t of tasks) {
      for (const d of t.deps) expect(center.get(t.id)?.x).toBeGreaterThan(center.get(d)?.x ?? Number.POSITIVE_INFINITY);
    }
    for (const c of layout.conveyors) {
      for (let i = 1; i < c.points.length; i++) expect(c.points[i]?.x).toBeGreaterThanOrEqual(c.points[i - 1]?.x ?? 0);
      expect(c.length).toBeGreaterThan(0);
    }
  });

  it('依存1本ごとにコンベアが1本あり、終端の Task は出口へつながる', () => {
    const deps = ecRenewal.tasks.reduce((n, t) => n + t.deps.length, 0);
    expect(ec.conveyors.filter((c) => c.to !== EXIT_ID)).toHaveLength(deps);
    expect(ec.conveyors.filter((c) => c.to === EXIT_ID).map((c) => c.from)).toEqual(['release']);
  });

  it('並行する Task（UI設計と競合調査）は同じ列に、合流先（実装）はその右に置く', () => {
    const at = (id: string) => ec.islands.find((i) => i.id === id);
    expect(at('uiDesign')?.column).toBe(at('research')?.column);
    expect(at('uiDesign')?.center.z).not.toBe(at('research')?.center.z);
    expect(at('implementation')?.column).toBe((at('uiDesign')?.column ?? 0) + 1);
  });

  it('決定論的：同じ入力からは同じ結果になり、入力を変更しない', () => {
    const input = structuredClone(diamond);
    expect(layoutProject(input, params)).toEqual(layoutProject(diamond, params));
    expect(input).toEqual(diamond);
  });

  it('休憩所は最初の島より左、出口は最後の島より右にある', () => {
    const xs = ec.islands.map((i) => i.center.x);
    expect(ec.lounge.x).toBeLessThan(Math.min(...xs));
    expect(ec.exit.x).toBeGreaterThan(Math.max(...xs));
  });

  it('依存の循環はエラーにする', () => {
    expect(() =>
      layoutProject(
        [
          { id: 'a', deps: ['b'] },
          { id: 'b', deps: ['a'] },
        ],
        params,
      ),
    ).toThrow();
  });
});

describe('折れ線の上の位置', () => {
  const path = [
    { x: 0, z: 0 },
    { x: 2, z: 0 },
    { x: 2, z: 2 },
  ];

  it('長さと、割合に応じた位置・向きを返す', () => {
    expect(pathLength(path)).toBe(4);
    expect(pointAlong(path, 0).at).toEqual({ x: 0, z: 0 });
    expect(pointAlong(path, 0.25)).toEqual({ at: { x: 1, z: 0 }, dir: { x: 1, z: 0 } });
    expect(pointAlong(path, 0.75)).toEqual({ at: { x: 2, z: 1 }, dir: { x: 0, z: 1 } });
    expect(pointAlong(path, 2).at).toEqual({ x: 2, z: 2 });
  });
});

describe('会社のオフィス（ホーム）', () => {
  it('島が0個でも、休憩所と出口を含む範囲を返す（カメラが範囲に合わせられる）', () => {
    const office = layoutProject([], params);
    expect(office.islands).toEqual([]);
    expect(office.conveyors).toEqual([]);
    expect(office.bounds.maxX).toBeGreaterThan(office.bounds.minX);
    expect(office.bounds.maxZ).toBeGreaterThan(office.bounds.minZ);
    expect(office.lounge.x).toBeGreaterThanOrEqual(office.bounds.minX);
  });
});
