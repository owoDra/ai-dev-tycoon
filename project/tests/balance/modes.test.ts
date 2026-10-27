import { describe, expect, it } from 'vitest';
import { assignModes } from '../../src/content/assignModes';
import { content, getModel, humans } from '../../src/content/index';
import type { AssignModeId, TaskDef } from '../../src/content/types';
import { expectWithSetup, harnessSetup } from '../../src/core/expectation';
import { escapedDefectCost, escapedFixMinutes, laborCost } from '../../src/core/formulas';
import { NEUTRAL } from '../../src/core/harness';

/**
 * 担当モードに支配的なものがないこと（企画書5章「AI を適切な仕事へ配置する」）。
 * Harness なし・標準モデル・熟練度 1 で、Task ごとに各モードの見込みの損得を比べる。
 * 人間の時間は社員の平均の売値で換算する（その人日を別の案件に売れたはずの額）。
 * 「AI → 自動テスト → 確認」は、機械で確かめられる仕事（コード・テスト）では強いが、
 * 判断が中心の仕事（企画・設計・文章）ではすり抜けが多く、人間レビューの方が良い。
 */
const model = getModel('standard');
const dailyRate = humans.reduce((sum, h) => sum + h.dailyRate, 0) / humans.length;

/** モードで処理したときの見込みの損失（円）。人間の時間（納品後の修正を含む）・AI の費用・事故・見逃しの損害 */
function expectedLoss(task: TaskDef, mode: AssignModeId): number {
  const def = assignModes.find((m) => m.id === mode);
  if (!def) throw new Error(`未定義の担当モード: ${mode}`);
  const e = expectWithSetup(task, def, 1, harnessSetup(NEUTRAL, model));
  const human = e.humanMinutes + e.pEscape * escapedFixMinutes(task);
  return laborCost(human, dailyRate) + e.aiCost + e.accidentCost + e.pEscape * escapedDefectCost(task);
}

function bestMode(task: TaskDef): AssignModeId {
  let best: { mode: AssignModeId; loss: number } | null = null;
  for (const m of assignModes) {
    const loss = expectedLoss(task, m.id);
    if (!best || loss < best.loss) best = { mode: m.id, loss };
  }
  if (!best) throw new Error('担当モードがない');
  return best.mode;
}

const rows = content.projects.flatMap((p) => p.tasks.map((task) => ({ projectId: p.id, task, best: bestMode(task) })));

describe('担当モードに支配的なものがない', () => {
  // 修正前は「AI → 自動テスト → 確認」が 41 Task すべてで最適だった
  it('どのモードも、全 Task の 2/3 以上では最適にならない', () => {
    const counts: Partial<Record<AssignModeId, number>> = {};
    for (const r of rows) counts[r.best] = (counts[r.best] ?? 0) + 1;
    console.log(
      `[担当モード] Task ごとの最適モード（${rows.length} Task）：` +
        Object.entries(counts)
          .map(([mode, n]) => `${mode} ${n}`)
          .join(' / '),
    );
    for (const n of Object.values(counts)) expect(n).toBeLessThan((rows.length * 2) / 3);
  });

  it('自動テストとレビューのどちらにも、最適になる Task がある', () => {
    const winners = new Set(rows.map((r) => r.best));
    expect(winners.has('aiThenEval')).toBe(true);
    expect(winners.has('aiThenHumanReview')).toBe(true);
  });

  it('最適なモードは Task の種類で分かれる：コードは自動テスト、企画は人間レビュー', () => {
    const of = (kind: string) => rows.filter((r) => r.task.kind === kind).map((r) => r.best);
    expect(of('code').every((m) => m === 'aiThenEval')).toBe(true);
    expect(of('planning').every((m) => m === 'aiThenHumanReview')).toBe(true);
  });

  // チュートリアルはモードを順に教える台本の案件で、後半はコードの Task が続くので除く
  it('1つのモードを全 Task にコピーすれば最適、になる案件はない（チュートリアルを除く）', () => {
    for (const p of content.projects.filter((x) => x.id !== 'tutorialLp')) {
      const modes = new Set(rows.filter((r) => r.projectId === p.id).map((r) => r.best));
      expect(modes.size, p.id).toBeGreaterThanOrEqual(2);
    }
  });
});
