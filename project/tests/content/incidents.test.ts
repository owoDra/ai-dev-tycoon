import { describe, expect, it } from 'vitest';
import { harnessCategories } from '../../src/content/harness/index';
import { content } from '../../src/content/index';
import type { TaskKind } from '../../src/content/types';
import { allFeatures } from '../../src/content/unlocks';
import { ja } from '../../src/i18n/ja';

const KINDS: readonly TaskKind[] = ['planning', 'research', 'design', 'content', 'code', 'test', 'release'];

describe('事件のデータ（content/incidents.ts）', () => {
  it('企画書19章の8種類がそろっている', () => {
    expect(content.incidents.map((d) => d.id).sort()).toEqual(
      [
        'contextOverflow',
        'staleContext',
        'instructionConflict',
        'retrySpiral',
        'agentDrift',
        'missingValidation',
        'coordinationExplosion',
        'humanBottleneck',
      ].sort(),
    );
  });

  it.each(content.incidents.map((d) => [d.id, d] as const))('%s：解決アクションと3段構成の文言がある', (id, def) => {
    expect(def.resolve.length).toBeGreaterThan(0);
    const t = ja.incidents[id];
    for (const text of [t.name, t.problem, t.cause, t.action]) expect(text.length, id).toBeGreaterThan(0);
  });

  it.each(content.incidents.map((d) => [d.id, d] as const))('%s：参照先が存在し、値が範囲内にある', (id, def) => {
    expect(allFeatures, id).toContain(def.unlock);
    expect(def.trigger.perUnit).toBeGreaterThan(0);
    expect(def.trigger.max).toBeGreaterThan(0);
    expect(def.trigger.max).toBeLessThanOrEqual(1);
    expect(def.effect.successPenalty).toBeGreaterThanOrEqual(0);
    expect(def.effect.aiTimeFactor).toBeGreaterThanOrEqual(1);
    expect(def.effect.humanTimeFactor).toBeGreaterThanOrEqual(1);
    // 影響のない事件は「敵」にならない
    expect(def.effect.successPenalty + def.effect.aiTimeFactor + def.effect.humanTimeFactor).toBeGreaterThan(2);
    for (const c of def.guard ?? []) expect(harnessCategories).toContain(c);
    for (const action of def.resolve) {
      if (action.type === 'EquipPart') {
        const parts = action.parts.map((pid) => content.harnessParts.find((p) => p.id === pid));
        expect(parts.every((p) => p !== undefined && p.enforcement === 'system')).toBe(true);
        // どの種類の Task で起きても、効く部品が選択肢にある（解決アクションで原因を取り除ける）
        const covered = new Set(parts.flatMap((p) => p?.appliesTo ?? []));
        for (const kind of KINDS) expect(covered, `${id}: ${kind}`).toContain(kind);
        // 防ぐ部品のカテゴリに、解決で付ける部品が入っている
        if (def.guard) for (const p of parts) expect(def.guard).toContain(p?.category);
      }
      if (action.type === 'TrimParts') expect(action.keep).toBeLessThanOrEqual(def.trigger.threshold);
    }
  });

  it('Harness 由来の事件は、解決アクションが Harness 部品の導入や設定の変更につながる', () => {
    const harnessBorn = ['retrySpiral', 'agentDrift', 'missingValidation', 'coordinationExplosion', 'humanBottleneck'];
    for (const id of harnessBorn) {
      const def = content.incidents.find((d) => d.id === id);
      expect(
        def?.resolve.some((a) => a.type === 'EquipPart' || a.type === 'TrimParts'),
        id,
      ).toBe(true);
    }
  });
});
