import { describe, expect, it } from 'vitest';
import { getAssignMode, primaryActor } from '../../src/content/assignModes';
import { content } from '../../src/content/index';
import { practiceTemplates } from '../../src/content/practice/index';
import { validateWorkflow } from '../../src/core/library';
import { parsePracticeJob } from '../../src/core/practice';
import { sampleWorkflows } from '../helpers/workflows';

describe('テストで使う Workflow の構成（tests/helpers/workflows.ts）', () => {
  it('参照先（モード・Model・部品）が存在し、スキーマの検証を通る（バランステストの前提）', () => {
    for (const [key, w] of Object.entries(sampleWorkflows)) {
      expect(validateWorkflow(w), key).toEqual([]);
      expect(primaryActor(getAssignMode(w.mode)), key).toBe('ai');
    }
  });

  it('PR Review は企画書25章の構成（Context・Skill・Tool・Subagent・Hook・Eval）をそろえている', () => {
    const pr = sampleWorkflows.prReview;
    const categories = pr.parts.map((id) => content.harnessParts.find((p) => p.id === id)?.category);
    expect(pr.context).toBe('needed');
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
