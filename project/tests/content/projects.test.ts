import { describe, expect, it } from 'vitest';
import { content } from '../../src/content/index';
import type { ProjectDef, TaskDef } from '../../src/content/types';
import { assertValidContent, validateContent } from '../../src/content/validate';

const base: TaskDef = {
  id: 'a',
  name: 'a',
  deps: [],
  effort: 60,
  difficulty: 0.5,
  aiAptitude: 0.5,
  qualityReq: 0.5,
  failRisk: 0.5,
};
const withProject = (project: ProjectDef) => ({ ...content, projects: [project] });
const project = (tasks: TaskDef[]): ProjectDef => ({ id: 'p', name: 'p', revenue: 1, deadlineDays: 1, tasks });

describe('content', () => {
  it('全案件を含むゲームデータが validate を通る', () => {
    expect(validateContent(content)).toEqual([]);
    expect(() => assertValidContent(content)).not.toThrow();
    expect(content.projects.length).toBeGreaterThan(0);
  });

  it('全案件・全 Task・全 Worker に名前がある', () => {
    for (const p of content.projects) {
      expect(p.name).not.toBe('');
      for (const t of p.tasks) expect(t.name).not.toBe('');
    }
    for (const w of content.workers) expect(w.name).not.toBe('');
  });

  it('ECサイトリニューアルは企画書4章の工程と依存を持つ', () => {
    const ec = content.projects.find((p) => p.id === 'ecRenewal');
    const deps = Object.fromEntries(ec?.tasks.map((t) => [t.id, t.deps]) ?? []);
    expect(deps).toEqual({
      hearing: [],
      requirements: ['hearing'],
      uiDesign: ['requirements'],
      research: ['requirements'],
      implementation: ['uiDesign', 'research'],
      qa: ['implementation'],
      release: ['qa'],
    });
  });
});

describe('validateContent', () => {
  it('依存の循環を検出する', () => {
    const errors = validateContent(
      withProject(
        project([
          { ...base, id: 'a', deps: ['c'] },
          { ...base, id: 'b', deps: ['a'] },
          { ...base, id: 'c', deps: ['b'] },
        ]),
      ),
    );
    expect(errors.some((e) => e.includes('循環'))).toBe(true);
  });

  it('自己依存も循環として検出する', () => {
    expect(validateContent(withProject(project([{ ...base, deps: ['a'] }]))).join()).toMatch(/循環/);
  });

  it('未定義の依存・ID の重複・範囲外の値を検出する', () => {
    expect(validateContent(withProject(project([{ ...base, deps: ['zzz'] }]))).join()).toMatch(/未定義の依存 zzz/);
    expect(validateContent(withProject(project([base, base]))).join()).toMatch(/重複/);
    expect(validateContent(withProject(project([{ ...base, difficulty: 1.5 }]))).join()).toMatch(/difficulty/);
    expect(
      validateContent({ ...content, workers: [...content.workers, ...content.workers.slice(0, 1)] }).join(),
    ).toMatch(/重複/);
    expect(
      validateContent({ ...content, workers: [{ kind: 'ai', id: 'x', name: 'x', modelId: 'none' }] }).join(),
    ).toMatch(/未定義の Model none/);
  });

  it('問題があれば assertValidContent は例外にする', () => {
    expect(() => assertValidContent(withProject(project([{ ...base, deps: ['a'] }])))).toThrow(/ゲームデータが不正/);
  });
});

describe('資料（content/documents.ts）', () => {
  it('決済画面の修正の「修正」に役立つのは、決済仕様・関連コード・関連テスト・Coding Rules の4つ（企画書10章）', () => {
    const needed = content.documents
      .filter((d) => d.projectId === 'paymentFix' && !d.stale && d.relevantTo.includes('fix'))
      .map((d) => d.id);
    expect(needed.sort()).toEqual(['codingRules', 'paymentCode', 'paymentSpec', 'paymentTests']);
  });

  it('決済画面の修正の資料には、古い仕様・矛盾するルール・どの Task にも役立たない資料が混ざっている（企画書9章）', () => {
    const docs = content.documents.filter((d) => d.projectId === 'paymentFix');
    expect(docs.some((d) => d.stale)).toBe(true);
    expect(docs.some((d) => d.conflictsWith.length > 0)).toBe(true);
    expect(docs.filter((d) => d.relevantTo.length === 0).length).toBeGreaterThanOrEqual(3);
  });

  it('未定義の案件・Task・矛盾の相手を参照する資料を検出する', () => {
    const doc = {
      id: 'x',
      projectId: 'paymentFix',
      name: 'x',
      relevantTo: [],
      stale: false,
      conflictsWith: [],
      size: 1,
    };
    const check = (d: Partial<typeof doc>) => validateContent({ ...content, documents: [{ ...doc, ...d }] }).join();
    expect(check({ projectId: 'none' })).toMatch(/未定義の案件 none/);
    expect(check({ relevantTo: ['none'] as never[] })).toMatch(/未定義の Task none/);
    expect(check({ conflictsWith: ['none'] as never[] })).toMatch(/未定義の矛盾の相手 none/);
    expect(check({ size: 0 })).toMatch(/size/);
  });
});
