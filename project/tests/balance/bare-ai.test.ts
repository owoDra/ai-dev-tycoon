import { describe, expect, it } from 'vitest';
import { content } from '../../src/content/index';
import type { AssignModeId } from '../../src/content/types';
import type { ProjectScore } from '../../src/core/scoring';
import { type Averaged, compare, seeds } from '../helpers/compare';
import { playConfigured } from '../helpers/configured';
import { EARLY, FITTED } from '../helpers/fitted';
import { playProject, strategies } from '../helpers/strategies';

/**
 * 「ハーネスもワークフローもなしで、ただ AI を使うだけ」では割に合わない（balance.harness.bare）。
 * Harness の部品を付けていない AI Worker は、どの担当モードでも品質が低く、人間だけより Profit / Person-Day が低い。
 * Skill・ルール（Hook）・Eval で AI の仕事を型にはめて初めて、AI が人間だけより儲かる。人間だけは安全だが儲からない選択肢として残る。
 * 固定の案件（チュートリアルを除く）で、すべての Task を同じモードで AI Worker に任せ、seed の平均で人間だけと比べる。
 */
const SEEDS = seeds(10);
const PROJECTS = content.projects.filter((p) => p.id !== 'tutorialLp').map((p) => p.id);
/** AI が関わる担当モードすべて */
const AI_MODES: readonly AssignModeId[] = ['ai', 'aiThenHumanReview', 'aiThenEval', 'agentWorkflow'];
/** 素の AI の品質の上限（これ未満なら「品質がとても悪い」）と、Harness を付けてレビューしたときの品質の下限 */
const BARE_QUALITY_MAX = 0.8;
const FITTED_QUALITY_MIN = 0.95;

const fmt = (n: number) => `${Math.round(n / 1000).toLocaleString('ja-JP')}k`;

const human = (projectId: string) => (seed: string) =>
  playProject(projectId, strategies.allHuman(projectId), seed).score;
const configured = (projectId: string, mode: AssignModeId, parts: readonly string[]) => (seed: string) =>
  playConfigured({ projectId, mode, parts }, seed).score;

describe.each(PROJECTS)('素の AI は割に合わない（%s）', (projectId) => {
  const r: Record<string, Averaged<ProjectScore>> = compare(
    {
      human: human(projectId),
      ...Object.fromEntries(AI_MODES.map((m) => [`bare:${m}`, configured(projectId, m, [])])),
      ...Object.fromEntries(AI_MODES.map((m) => [`fitted:${m}`, configured(projectId, m, FITTED)])),
      'early:aiThenHumanReview': configured(projectId, 'aiThenHumanReview', EARLY),
    },
    SEEDS,
  );
  const cell = (name: string) => {
    const c = r[name];
    if (!c) throw new Error(`候補がない: ${name}`);
    return c;
  };
  console.log(
    `[素の AI] ${projectId}：人間だけ ${fmt(cell('human').profitPerPersonDay)}（品質 ${cell('human').quality.toFixed(2)}）` +
      AI_MODES.map(
        (m) =>
          ` / ${m} 素 ${fmt(cell(`bare:${m}`).profitPerPersonDay)}（${cell(`bare:${m}`).quality.toFixed(2)}）` +
          `→Harness ${fmt(cell(`fitted:${m}`).profitPerPersonDay)}（${cell(`fitted:${m}`).quality.toFixed(2)}）`,
      ).join(''),
  );

  it.each(AI_MODES)('Harness なしの AI は %s でも、品質が低く、人間だけより Profit / Person-Day が低い', (mode) => {
    const bare = cell(`bare:${mode}`);
    expect(bare.quality).toBeLessThan(BARE_QUALITY_MAX);
    expect(bare.profitPerPersonDay).toBeLessThan(cell('human').profitPerPersonDay);
  });

  it('人間だけは安全：品質はほぼ落ちない', () => {
    expect(cell('human').quality).toBeGreaterThanOrEqual(FITTED_QUALITY_MIN);
  });

  it('適切な Harness を付けると、レビューと自動テストのどちらでも人間だけより割に合い、レビューすれば品質も保てる', () => {
    for (const mode of ['aiThenHumanReview', 'aiThenEval'] as const) {
      expect(cell(`fitted:${mode}`).profitPerPersonDay, mode).toBeGreaterThan(cell('human').profitPerPersonDay);
    }
    expect(cell('fitted:aiThenHumanReview').quality).toBeGreaterThanOrEqual(FITTED_QUALITY_MIN);
  });

  it('Harness は同じモードの素の AI より、品質も Profit / Person-Day も上げる', () => {
    for (const mode of AI_MODES) {
      expect(cell(`fitted:${mode}`).quality, mode).toBeGreaterThan(cell(`bare:${mode}`).quality);
      expect(cell(`fitted:${mode}`).profitPerPersonDay, mode).toBeGreaterThan(cell(`bare:${mode}`).profitPerPersonDay);
    }
  });

  // チュートリアルの後に最初に解放される部品だけで、AI に任せる道が開ける（序盤で詰まない）
  it('最初に解放される Skill と Hook だけでも、AI → 人間レビューは人間だけより割に合う', () => {
    expect(cell('early:aiThenHumanReview').profitPerPersonDay).toBeGreaterThan(cell('human').profitPerPersonDay);
  });
});
