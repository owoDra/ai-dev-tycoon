import { describe, expect, it } from 'vitest';
import { getAssignMode, primaryActor } from '../../src/content/assignModes';
import { content } from '../../src/content/index';
import { libraryPresets } from '../../src/content/library';
import { practiceTemplates } from '../../src/content/practice/index';
import { validateWorkflow } from '../../src/core/library';
import { parsePracticeJob } from '../../src/core/practice';
import { ja } from '../../src/i18n/ja';

describe('同梱の Workflow プリセット（content/library.ts）', () => {
  it('参照先（モード・Model・部品）が存在し、スキーマの検証を通る', () => {
    for (const w of libraryPresets) {
      expect(validateWorkflow(w), w.id).toEqual([]);
      expect(primaryActor(getAssignMode(w.mode)), w.id).toBe('ai');
      expect(
        content.models.some((m) => m.id === w.modelId),
        w.id,
      ).toBe(true);
      for (const id of w.parts)
        expect(
          content.harnessParts.some((p) => p.id === id),
          `${w.id}: ${id}`,
        ).toBe(true);
      expect(w.name).toBe(ja.library.presets[w.id as keyof typeof ja.library.presets]);
    }
  });

  it('id が重複せず、保存した Workflow の id（custom*）とぶつからない', () => {
    const ids = libraryPresets.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).not.toMatch(/^custom/);
  });

  it('PR Review は企画書25章の構成（Context・Skill・Tool・Subagent・Hook・Eval）をそろえている', () => {
    const pr = libraryPresets.find((w) => w.id === 'presetPrReview');
    const categories = pr?.parts.map((id) => content.harnessParts.find((p) => p.id === id)?.category);
    expect(pr?.context).toBe('needed');
    expect(new Set(categories)).toEqual(new Set(['skill', 'mcp', 'subagent', 'hook', 'eval']));
  });
});

describe('実務モードのテンプレート（content/practice）', () => {
  it('参照先（モード・Model・部品）が存在し、保存した入力として読み直せる', () => {
    for (const t of practiceTemplates) {
      for (const s of t.job.steps) {
        expect(content.assignModes.some((m) => m.id === s.mode)).toBe(true);
        expect(content.models.some((m) => m.id === s.modelId)).toBe(true);
        for (const id of s.parts)
          expect(
            content.harnessParts.some((p) => p.id === id),
            id,
          ).toBe(true);
      }
      expect(parsePracticeJob(t.job)).toEqual(t.job);
    }
  });
});
