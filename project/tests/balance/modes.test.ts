import { describe, expect, it } from 'vitest';
import { assignModes } from '../../src/content/assignModes';
import { balance } from '../../src/content/balance';
import { content, getHarnessPart, getModel, getProject, humans } from '../../src/content/index';
import type { AssignModeId, ProjectDef, TaskDef } from '../../src/content/types';
import { expectWithSetup, harnessSetup } from '../../src/core/expectation';
import { escapedDefectCost, escapedFixMinutes, laborCost } from '../../src/core/formulas';
import { partsModel, partsModifiers } from '../../src/core/harness';
import { generatedProjectId } from '../../src/core/projectGen';
import { seeds } from '../helpers/compare';
import { FITTED } from '../helpers/fitted';
import { representativeProjects } from '../helpers/generated';

/**
 * 担当モードに支配的なものがないこと（企画書5章「AI を適切な仕事へ配置する」）。
 * 標準的な Harness（tests/helpers/fitted.ts の FITTED）・標準モデル・熟練度 1 で、Task ごとに各モードの見込みの損得を比べる。
 * 人間の時間は社員の平均の売値で換算する（その人日を別の案件に売れたはずの額）。
 * 「AI → 自動テスト → 確認」は、機械で確かめられる仕事（コード・テスト）では強いが、
 * 判断が中心の仕事（企画・設計・文章）ではすり抜けが多く、人間レビューの方が良い。
 */
const model = getModel('standard');
/** 素の AI はどのモードでも人間だけに負ける（tests/balance/bare-ai.test.ts）ので、標準的な Harness を付けた AI Worker でモードを比べる */
const parts = FITTED.map(getHarnessPart);
/**
 * 人間のゲーム内の1人日の値（円）。社員の平均の売値に、作業時間の縮尺（ゲーム内の1人日は請求の何人日分か）を掛ける
 * （見逃しの損害と同じく、縮めた時間を請求の時間に戻して換算する）
 */
const dailyRate = (humans.reduce((sum, h) => sum + h.dailyRate, 0) / humans.length) * balance.staff.timeScale;

/** モードで処理したときの見込みの損失（円）。人間の時間（納品後の修正を含む）・AI の費用・事故・見逃しの損害 */
function expectedLoss(task: TaskDef, mode: AssignModeId): number {
  const def = assignModes.find((m) => m.id === mode);
  if (!def) throw new Error(`未定義の担当モード: ${mode}`);
  const mods = partsModifiers(parts, task, { expected: true });
  const e = expectWithSetup(task, def, 1, harnessSetup(mods, partsModel(model, parts, mods)));
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

/** 固定 seed で生成した案件群（型ごとの代表的な案件の S・M と、seed を変えた引き合いの規模 S・M） */
const generated = [
  ...representativeProjects('S'),
  ...representativeProjects('M'),
  ...seeds(24, 'modes').flatMap((seed) => [generatedProjectId(seed, 'S'), generatedProjectId(seed, 'M')]),
].map(getProject);

const rowsOf = (projects: readonly ProjectDef[]) =>
  projects.flatMap((p) => p.tasks.map((task) => ({ projectId: p.id, task, best: bestMode(task) })));

describe.each([
  ['固定の案件', content.projects],
  ['固定 seed で生成した案件群', generated],
] as const)('担当モードに支配的なものがない（%s）', (label, projects) => {
  const rows = rowsOf(projects);
  // 修正前は「AI → 自動テスト → 確認」が 41 Task すべてで最適だった
  it('どのモードも、全 Task の 2/3 以上では最適にならない', () => {
    const counts: Partial<Record<AssignModeId, number>> = {};
    for (const r of rows) counts[r.best] = (counts[r.best] ?? 0) + 1;
    console.log(
      `[担当モード/${label}] Task ごとの最適モード（${rows.length} Task）：` +
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
    for (const p of projects.filter((x) => x.id !== 'tutorialLp')) {
      const modes = new Set(rows.filter((r) => r.projectId === p.id).map((r) => r.best));
      expect(modes.size, p.id).toBeGreaterThanOrEqual(2);
    }
  });
});
