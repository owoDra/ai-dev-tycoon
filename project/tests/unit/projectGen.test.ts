import { describe, expect, it } from 'vitest';
import { documentsOf } from '../../src/content/documents';
import { getProject } from '../../src/content/index';
import { findTemplate, projectTemplates } from '../../src/content/projectTemplates';
import type { ProjectDef, ProjectSize } from '../../src/content/types';
import { validateProject } from '../../src/content/validate';
import { generatedProjectId, generateProject, shapeTasks } from '../../src/core/projectGen';
import { layoutProject } from '../../src/world/layout';

/*
 * 案件の生成（core/projectGen.ts）。案件の型 × 業種 × 規模から、決定論的に案件を作る。
 */

const SIZES: readonly ProjectSize[] = ['S', 'M', 'L', 'XL'];
const SEEDS = Array.from({ length: 60 }, (_, i) => `gen-${i}`);
const effort = (p: ProjectDef) => p.tasks.reduce((sum, t) => sum + t.effort, 0);
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');

describe('案件の生成（core/projectGen.ts）', () => {
  it('決定論的：同じ id からは同じ定義になり、getProject は生成した id も解決する', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      for (const size of SIZES) {
        const id = generatedProjectId(seed, size);
        const a = generateProject(id);
        expect(a).toBeDefined();
        expect(getProject(id)).toEqual(a);
        // キャッシュに頼らず、id だけから同じ定義を再生成できる（JSON で往復しても等しい）
        expect(JSON.parse(JSON.stringify(getProject(id)))).toEqual(a);
        expect(a?.id).toBe(id);
      }
    }
    expect(generateProject('ecRenewal')).toBeUndefined();
    expect(generateProject('p~1~XXL')).toBeUndefined();
    expect(() => getProject('p~1~XXL')).toThrow();
  });

  it('id の seed が違えば型・業種・発注者が変わる（多彩な案件が出る）', () => {
    const briefs = SEEDS.map((s) => getProject(generatedProjectId(s, 'M')).brief);
    expect(new Set(briefs.map((b) => b?.templateId)).size).toBe(projectTemplates.length);
    expect(new Set(briefs.map((b) => b?.industry)).size).toBe(5);
    expect(new Set(briefs.map((b) => b?.client)).size).toBeGreaterThan(10);
  });

  it('どの規模でも依存関係は非巡回で、Task の値は 0〜1 に収まり、validate を通る', () => {
    for (const seed of SEEDS) {
      for (const size of SIZES) {
        const p = getProject(generatedProjectId(seed, size));
        expect(validateProject(p), p.id).toEqual([]);
      }
    }
  });

  it('規模が大きいほど Task の数・作業量・標準価格・納期が増え、品質要求が上がる', () => {
    const rows = SIZES.map((size) => {
      const ps = SEEDS.map((s) => getProject(generatedProjectId(s, size)));
      return {
        size,
        tasks: mean(ps.map((p) => p.tasks.length)),
        effort: mean(ps.map(effort)),
        revenue: mean(ps.map((p) => p.revenue)),
        deadline: mean(ps.map((p) => p.deadlineDays)),
        qualityReq: mean(ps.flatMap((p) => p.tasks.map((t) => t.qualityReq))),
      };
    });
    console.log(
      `[案件の生成] 規模ごとの平均（${SEEDS.length}件ずつ）\n` +
        rows
          .map(
            (r) =>
              `  ${r.size}：Task ${r.tasks.toFixed(1)}件・作業量 ${fmt(r.effort)}分・標準価格 ${fmt(r.revenue)}円` +
              `・納期 ${r.deadline.toFixed(1)}日・品質要求 ${r.qualityReq.toFixed(2)}`,
          )
          .join('\n'),
    );
    for (let i = 1; i < rows.length; i++) {
      const [a, b] = [rows[i - 1], rows[i]];
      if (!a || !b) continue;
      expect(b.tasks, b.size).toBeGreaterThan(a.tasks);
      expect(b.effort, b.size).toBeGreaterThan(a.effort);
      expect(b.revenue, b.size).toBeGreaterThan(a.revenue);
      expect(b.deadline, b.size).toBeGreaterThanOrEqual(a.deadline);
      expect(b.qualityReq, b.size).toBeGreaterThan(a.qualityReq);
    }
    // 同じ seed なら、規模だけを変えると作業量が増える（型と業種は同じ）
    for (const seed of SEEDS) {
      const [s, m, l, xl] = SIZES.map((size) => getProject(generatedProjectId(seed, size)));
      expect(new Set([s, m, l, xl].map((p) => p?.brief?.templateId)).size).toBe(1);
      expect(effort(s as ProjectDef)).toBeLessThan(effort(m as ProjectDef));
      expect(effort(m as ProjectDef)).toBeLessThan(effort(l as ProjectDef));
      expect(effort(l as ProjectDef)).toBeLessThan(effort(xl as ProjectDef));
    }
  });

  it('規模の例：型ごとの S / M / L / XL の Task 数・作業量・標準価格', () => {
    const lines = projectTemplates.map((t) => {
      const seed = SEEDS.find((s) => getProject(generatedProjectId(s, 'M')).brief?.templateId === t.id) ?? '';
      const cells = SIZES.map((size) => {
        const p = getProject(generatedProjectId(seed, size));
        return `${size} ${p.tasks.length}件/${fmt(effort(p))}分/${fmt(p.revenue)}円`;
      });
      return `  ${getProject(generatedProjectId(seed, 'M')).name}：${cells.join(' | ')}`;
    });
    console.log(`[案件の生成] 規模ごとの例\n${lines.join('\n')}`);
    expect(lines).toHaveLength(projectTemplates.length);
  });

  it('S では型の省く Task を省いて依存を引き継ぎ、L 以上では複製した Task をすべて待つ', () => {
    const ec = findTemplate('ecRenewal');
    if (!ec) throw new Error('型がない');
    const s = shapeTasks(ec, 'S').tasks;
    expect(s.map((t) => t.id)).not.toContain('research');
    expect(s.find((t) => t.id === 'implementation')?.deps).toEqual(['uiDesign', 'requirements']);
    const xl = shapeTasks(ec, 'XL').tasks;
    expect(xl.filter((t) => t.id.startsWith('implementation')).map((t) => t.id)).toEqual([
      'implementation',
      'implementation-2',
      'implementation-3',
    ]);
    expect(xl.find((t) => t.id === 'implementation-3')?.deps).toEqual(['uiDesign', 'research']);
    expect(xl.find((t) => t.id === 'qa')?.deps).toEqual(['implementation', 'implementation-2', 'implementation-3']);
  });

  it('資料のある型（決済画面の修正）から生成した案件は、型の資料を写して持つ（Context の仕組みがそのまま効く）', () => {
    const seed = SEEDS.find((x) => getProject(generatedProjectId(x, 'L')).brief?.templateId === 'paymentFix') ?? '';
    const id = generatedProjectId(seed, 'L');
    const docs = documentsOf(id);
    expect(docs.length).toBe(documentsOf('paymentFix').length);
    const ids = new Set(getProject(id).tasks.map((t) => t.id));
    for (const d of docs) {
      expect(d.id.startsWith(`${id}/`)).toBe(true);
      for (const t of d.relevantTo) expect(ids.has(t)).toBe(true);
      for (const c of d.conflictsWith) expect(docs.some((x) => x.id === c)).toBe(true);
    }
    // 複製した「修正」にも、元の「修正」に役立つ資料が役立つ
    expect(docs.filter((d) => d.relevantTo.includes('fix-2')).length).toBe(
      docs.filter((d) => d.relevantTo.includes('fix')).length,
    );
  });

  it('3D ワールドの配置：どの規模の案件でも島が重ならず、依存は +x の向きへ流れる', () => {
    const params = { islandSize: 4, gap: 2 };
    for (const seed of SEEDS) {
      for (const size of SIZES) {
        const p = getProject(generatedProjectId(seed, size));
        const layout = layoutProject(p.tasks, params);
        expect(layout.islands).toHaveLength(p.tasks.length);
        const center = new Map(layout.islands.map((i) => [i.id, i.center]));
        for (const a of layout.islands) {
          for (const b of layout.islands) {
            if (a === b) continue;
            const apart =
              Math.abs(a.center.x - b.center.x) >= params.islandSize ||
              Math.abs(a.center.z - b.center.z) >= params.islandSize;
            expect(apart, `${p.id}: ${a.id} と ${b.id}`).toBe(true);
          }
        }
        for (const t of p.tasks) {
          for (const d of t.deps) expect(center.get(t.id)?.x).toBeGreaterThan(center.get(d)?.x ?? Infinity);
        }
      }
    }
  });
});
