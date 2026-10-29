import { describe, expect, it } from 'vitest';
import { getAssignMode, primaryActor } from '../../src/content/assignModes';
import { content } from '../../src/content/index';
import { validateWorkflow } from '../../src/core/library';
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
