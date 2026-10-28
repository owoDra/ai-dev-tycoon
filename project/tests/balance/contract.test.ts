import { describe, expect, it } from 'vitest';
import { getProject } from '../../src/content/index';
import type { Command } from '../../src/core/commands';
import { contractOf } from '../../src/core/contract';
import { generatedProjectId } from '../../src/core/projectGen';
import { teamMembers } from '../../src/core/team';
import { playProject, type Strategy, strategies } from '../helpers/strategies';

/**
 * 期限と掛け持ち（Phase 34）。期限厳守の案件は売上が高いが、外すと入金がない（ハイリスク・ハイリターン）。
 * 人間に仕事を掛け持ちさせると1件ずつが遅くなり、期限を外しやすくなる。
 */
const strictIds = Array.from({ length: 120 }, (_, i) => generatedProjectId(`strict-${i}`, 'S'))
  .filter((id) => contractOf(id) === 'strict')
  .slice(0, 20);

/** 人間の仕事をすべて1人に押し付ける（AI 適性の高い Task は AI → 人間レビュー） */
const overload =
  (projectId: string): Strategy =>
  (state) => {
    const one = teamMembers(state)[0]?.id ?? '';
    return getProject(projectId).tasks.map(
      (t): Command => ({ type: 'AssignTask', projectId, taskId: t.id, mode: 'human', workerId: one }),
    );
  };

const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');

describe('期限厳守の案件（core/contract.ts）', () => {
  it('分担して間に合えば平均で利益が出るが、1人に掛け持ちさせて期限を外すと入金がなく赤字になる', () => {
    let kept = 0;
    let missed = 0;
    let keptProfit = 0;
    let missedProfit = 0;
    for (const id of strictIds) {
      const good = playProject(id, strategies.smart(id), `strict-good-${id}`);
      const bad = playProject(id, overload(id), `strict-bad-${id}`);
      if (good.state.projects[id]?.cancelled === null) {
        kept++;
        keptProfit += good.score.profit;
      }
      if (bad.state.projects[id]?.cancelled === 'expired') {
        missed++;
        missedProfit += bad.score.profit;
        expect(bad.score.revenue, id).toBe(0);
        expect(bad.score.profit, id).toBeLessThan(0);
      }
    }
    console.log(
      `[Phase 34] 期限厳守 ${strictIds.length}件：分担して間に合った ${kept}件（平均利益 ${fmt(keptProfit / Math.max(1, kept))} 円）` +
        ` / 1人に掛け持ちさせて打ち切り ${missed}件（平均利益 ${fmt(missedProfit / Math.max(1, missed))} 円）`,
    );
    expect(kept).toBeGreaterThan(strictIds.length / 2);
    expect(keptProfit / kept).toBeGreaterThan(0);
    expect(missed).toBeGreaterThan(strictIds.length / 2);
  });
});
