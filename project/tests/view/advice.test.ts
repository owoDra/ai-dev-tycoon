import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/core/commands';
import { reduce } from '../../src/core/commands';
import { createInitialState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { adviseProblems, nextAdvice } from '../../src/view/advice';
import { humanActorId, islandId } from '../../src/view/world';
import { runHeadless } from '../helpers/headless';

const P = 'ecRenewal';
const start: Command = { type: 'StartProject', projectId: P };
const human = (taskId: string): Command => ({
  type: 'AssignTask',
  projectId: P,
  taskId,
  mode: 'human',
  workerId: 'sato',
});

describe('adviseProblems（次に対応すべき問題）', () => {
  it('ボトルネックがあるとき、担当が決まっていない Task より優先して最初に選ばれる', () => {
    // 要望整理を人間が手作業し続け、リリースだけ担当を決めずにおく
    const commands = [start, ...['hearing', 'requirements', 'uiDesign', 'research', 'implementation', 'qa'].map(human)];
    const { state } = runHeadless({
      seed: 'advice',
      commands: commands.map((command) => ({ at: 0, command })),
      until: 60,
    });

    const problems = adviseProblems(state, P);
    expect(problems[0]?.kind).toBe('bottleneck');
    expect(problems[0]?.entityId).toBe(islandId('hearing'));
    expect(problems[0]?.problem).toBe(ja.advice.bottleneck(ja.tasks.ecRenewal.hearing));
    expect(problems.map((p) => p.id)).toContain('unassigned:release');
    expect(nextAdvice(state, P)).toEqual(problems[0]);
  });

  it('問題 → 原因 → 次の行動 の3段がそろっている', () => {
    const s = reduce(createInitialState('advice'), start).state;
    for (const p of adviseProblems(s, P)) {
      expect(p.problem.length).toBeGreaterThan(0);
      expect(p.cause.length).toBeGreaterThan(0);
      expect(p.action.length).toBeGreaterThan(0);
    }
  });

  it('始めたばかりで詰まりがなければ、すぐ始められる未割り当ての Task が最初に来る', () => {
    const s = reduce(createInitialState('advice'), start).state;
    const first = nextAdvice(s, P);
    expect(first?.kind).toBe('unassigned');
    expect(first?.entityId).toBe(islandId('hearing'));
    expect(first?.severity).toBe('danger');
  });

  it('同じ人に仕事が集中して待ちが積み上がると、その人をボトルネックとして指す', () => {
    const s = reduce(createInitialState('advice'), start).state;
    const queued = {
      ...s,
      clock: 120,
      humanQueues: {
        ...s.humanQueues,
        sato: [
          { projectId: P, taskId: 'hearing', queuedAt: 0 },
          { projectId: P, taskId: 'requirements', queuedAt: 0 },
        ],
      },
    };
    const first = nextAdvice(queued, P);
    expect(first?.kind).toBe('bottleneck');
    expect(first?.entityId).toBe(humanActorId('sato'));
  });

  it('納品済み・未開始の案件では問題を出さない', () => {
    expect(adviseProblems(createInitialState('advice'), P)).toEqual([]);
  });

  it('担当を決めると、その Task の「担当が決まっていない」問題は消える', () => {
    const s = reduce(createInitialState('advice'), start).state;
    const next = reduce(s, human('hearing')).state;
    expect(adviseProblems(next, P).map((p) => p.id)).not.toContain('unassigned:hearing');
  });
});
