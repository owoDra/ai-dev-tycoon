import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { harnessCategories, harnessParts } from '../../src/content/harness/index';
import { content } from '../../src/content/index';
import type { HarnessModifierKey, TaskKind } from '../../src/content/types';
import { allFeatures } from '../../src/content/unlocks';
import { validateContent } from '../../src/content/validate';
import { ja } from '../../src/i18n/ja';

const KINDS: readonly TaskKind[] = ['planning', 'research', 'design', 'content', 'code', 'test', 'release'];

/** 1つの部品の補正として許す範囲（合算の上限・下限とは別に、1つでゲームを壊さない大きさ） */
const RANGE: Readonly<Record<HarnessModifierKey, readonly [number, number]>> = {
  success: [-0.2, 0.2],
  speed: [0.5, 2],
  noise: [0, 0.2],
  humanTime: [0.4, 1.5],
  aiCost: [0.8, 1.5],
  risk: [-0.2, 0.2],
  evalCatch: [0, 0.8],
  guard: [0, 0.8],
};

describe('Harness 部品（content/harness）', () => {
  it('ゲームデータとして整合している（ID の重複・group のカテゴリ・Task の種類）', () => {
    expect(validateContent(content)).toEqual([]);
    expect(content.harnessParts).toBe(harnessParts);
  });

  it('全部品の modifier と burden が範囲内で、コストが 0 以上', () => {
    const errors: string[] = [];
    for (const p of harnessParts) {
      for (const [where, mods] of [
        ['modifiers', p.modifiers],
        ['burden', p.burden],
      ] as const) {
        for (const [key, v] of Object.entries(mods) as [HarnessModifierKey, number][]) {
          const [min, max] = RANGE[key];
          if (!(v >= min && v <= max)) errors.push(`${p.id}.${where}.${key} = ${v}`);
        }
      }
      if (!(p.installCost >= 0 && p.runningCost >= 0)) errors.push(`${p.id}: コストが負`);
      for (const k of p.appliesTo) if (!KINDS.includes(k)) errors.push(`${p.id}: 未定義の Task の種類 ${k}`);
      if (Object.keys(p.modifiers).length > 0 && p.appliesTo.length === 0) errors.push(`${p.id}: 効く仕事がない`);
    }
    expect(errors).toEqual([]);
  });

  it('解放条件の参照先（機能）が存在し、名前の文言がある', () => {
    for (const p of harnessParts) {
      expect(allFeatures, p.id).toContain(p.unlock);
      expect(p.name, p.id).toBe(ja.harness.parts[p.id as keyof typeof ja.harness.parts]);
    }
  });

  it('全カテゴリに部品があり、Subagent は Subagent 数の比較のため5つ以上ある', () => {
    for (const c of harnessCategories)
      expect(
        harnessParts.some((p) => p.category === c),
        c,
      ).toBe(true);
    expect(harnessParts.filter((p) => p.category === 'subagent').length).toBeGreaterThanOrEqual(5);
  });

  it('Hook のルールはどれも「お願い」と「Hook（強制）」の両方を同じ効き目で用意している（企画書14章）', () => {
    const groups = new Set(harnessParts.filter((p) => p.category === 'hook').map((p) => p.group));
    expect(groups.size).toBeGreaterThanOrEqual(3);
    for (const g of groups) {
      const pair = harnessParts.filter((p) => p.group === g);
      const request = pair.find((p) => p.enforcement === 'request');
      const hook = pair.find((p) => p.enforcement === 'system');
      expect(request && hook, String(g)).toBeTruthy();
      expect(request?.modifiers).toEqual(hook?.modifiers);
      expect(request?.installCost).toBeLessThan(hook?.installCost ?? 0);
    }
  });

  it('合算のしかたは全項目に定義があり、Model は Harness Builder で選べるよう複数ある', () => {
    for (const key of Object.keys(RANGE) as HarnessModifierKey[]) {
      const rule = balance.harness.combine[key];
      expect(rule.min).toBeLessThan(rule.max);
    }
    expect(content.models.map((m) => m.id)).toEqual(expect.arrayContaining(['standard', 'frontier']));
  });

  it('案件のすべての Task に種類（kind）がある', () => {
    for (const p of content.projects) for (const t of p.tasks) expect(t.kind, `${p.id}/${t.id}`).toBeDefined();
  });
});
