import { describe, expect, it } from 'vitest';
import { type Command, reduce } from '../../src/core/commands';
import { createInitialState } from '../../src/core/state';
import { forecastAssign, forecastTask } from '../../src/view/forecast';

const P = 'ecRenewal';
const started = reduce(createInitialState('forecast'), { type: 'StartProject', projectId: P }).state;
const assign = (taskId: string, mode: 'ai' | 'aiThenHumanReview' | 'human'): Command => ({
  type: 'AssignTask',
  projectId: P,
  taskId,
  mode,
  workerId: mode === 'human' ? 'sato' : 'agent',
});

describe('forecastAssign（担当変更のプレビュー）', () => {
  it('レビューを外すと、人間時間が減り、品質の見込みが下がる', () => {
    const withReview = reduce(started, assign('implementation', 'aiThenHumanReview')).state;
    const { before, after } = forecastAssign(withReview, P, 'implementation', 'ai');
    if (!before) throw new Error('今の担当の見込みがない');
    expect(after.humanMinutes).toBeLessThan(before.humanMinutes);
    expect(after.quality).toBeLessThan(before.quality);
    expect(after.aiCost).toBeGreaterThan(0);
  });

  it('人間から AI に任せると、人間時間が大きく減り、AI コストが増える', () => {
    const s = reduce(started, assign('implementation', 'human')).state;
    const { before, after } = forecastAssign(s, P, 'implementation', 'aiThenHumanReview');
    if (!before) throw new Error('今の担当の見込みがない');
    expect(after.humanMinutes).toBeLessThan(before.humanMinutes / 2);
    expect(before.aiCost).toBe(0);
    expect(after.aiCost).toBeGreaterThan(0);
  });

  it('担当が決まっていなければ Before は null', () => {
    expect(forecastAssign(started, P, 'qa', 'human').before).toBeNull();
  });

  it('同じ条件なら同じ見込みになり、実際の state は変えない', () => {
    const a = forecastTask(started, P, 'uiDesign', 'ai');
    const b = forecastTask(structuredClone(started), P, 'uiDesign', 'ai');
    expect(a).toEqual(b);
    expect(started.projects[P]?.tasks.uiDesign?.assignment).toBeNull();
    expect(started.clock).toBe(0);
  });
});
