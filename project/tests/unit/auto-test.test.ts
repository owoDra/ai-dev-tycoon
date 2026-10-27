import { describe, expect, it } from 'vitest';
import { getAssignMode } from '../../src/content/assignModes';
import { getTask } from '../../src/content/index';
import { reduce } from '../../src/core/commands';
import { expectTask } from '../../src/core/expectation';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';

/**
 * AI → 自動テスト → 確認 のシミュレーション（core/taskFlow.ts）と見込み（core/formulas.ts の modeOutcome）が、
 * 同じ流れ（作業 → 自動テストと修復のループ → 最後の確認）になっていること。多くの seed で見逃しの割合を比べる
 */
const P = 'ecRenewal';
const SEEDS = 300;

function start(seed: string, taskId: string): GameState {
  const s = reduce(createInitialState(seed), { type: 'StartProject', projectId: P }).state;
  return reduce(s, { type: 'AssignTask', projectId: P, taskId, mode: 'aiThenEval', workerId: 'agent' }).state;
}

function escapeRate(taskId: string): number {
  let escaped = 0;
  for (let i = 0; i < SEEDS; i++) {
    let s = start(`auto-${taskId}-${i}`, taskId);
    for (let n = 0; n < 2000 && s.projects[P]?.tasks[taskId]?.status !== 'done'; n++) s = step(s, 1).state;
    if (s.projects[P]?.tasks[taskId]?.escaped) escaped++;
  }
  return escaped / SEEDS;
}

describe('自動テストのシミュレーションと見込みの一致', () => {
  it.each(['hearing'])('%s：見逃しの割合が見込みに近い', (taskId) => {
    const expected = expectTask(
      start('expect', taskId),
      P,
      getTask(P, taskId),
      getAssignMode('aiThenEval'),
      'agent',
      1,
    );
    const actual = escapeRate(taskId);
    console.log(`[自動テスト] ${taskId}：見逃し 実測 ${actual.toFixed(3)} / 見込み ${expected.pEscape.toFixed(3)}`);
    expect(actual).toBeGreaterThan(0);
    expect(Math.abs(actual - expected.pEscape)).toBeLessThan(0.06);
  });
});
