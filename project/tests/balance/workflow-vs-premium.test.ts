import { describe, expect, it } from 'vitest';
import type { TaskDef } from '../../src/content/types';
import { autoTestCatch } from '../../src/core/formulas';
import { compare, seeds } from '../helpers/compare';
import { playConcurrent } from '../helpers/concurrent';
import { EARLY } from '../helpers/fitted';

/**
 * 「この人を Premium にするより Workflow 直した方が良くない？」（企画書68章）を、キャンペーンの最後の同時進行で確かめる。
 * AI 適性の高い Task を「AI → 人間レビュー」で任せた構成では、人間のレビューがボトルネックで、AI の容量は足りている。
 * ここで Premium の Seat を買い足しても速くならず固定費が増えるだけだが、自動テストで確かめられる Task のレビューを
 * 自動テスト（AI → 自動テスト → 確認）に置き換えて Workflow を直すと、人間の時間が大きく減る。
 * 素の AI（Harness なし）はレビューも自動テストも失敗を見逃すので、AI Worker には Skill と Hook を付けておく（tests/helpers/fitted.ts）。
 */
const SEEDS = seeds(30);
const reviewed = (task: TaskDef) => (task.aiAptitude >= 0.5 ? 'aiThenHumanReview' : 'human');
/** 自動テストで確かめられる Task（検出率が半分以上）だけを自動テストに置き換え、残りはそのまま人間レビューにする */
const automated = (task: TaskDef) => (autoTestCatch(task) >= 0.5 ? automatable(task) : reviewed(task));
const automatable = (task: TaskDef) => (task.aiAptitude >= 0.5 ? 'aiThenEval' : 'human');

const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');

describe('Premium を増やすより Workflow を直す方が効く（企画書68章）', () => {
  it('人間のレビューが詰まっている場面では、Workflow 改善の方が Premium 追加より Profit / Person-Day を伸ばす', () => {
    const r = compare(
      {
        before: (seed) => playConcurrent(seed, { mode: reviewed, parts: EARLY }),
        premium: (seed) => playConcurrent(seed, { mode: reviewed, seats: { premium: 1 }, parts: EARLY }),
        workflow: (seed) => playConcurrent(seed, { mode: automated, parts: EARLY }),
      },
      SEEDS,
    );
    console.log(
      `[企画書68章] Profit/Person-Day：Premium追加 ${fmt(r.premium.profitPerPersonDay)} vs Workflow改善 ${fmt(r.workflow.profitPerPersonDay)} 円/人日` +
        `（改善前 ${fmt(r.before.profitPerPersonDay)}）` +
        ` / 人間時間 ${fmt(r.premium.humanMinutes)} vs ${fmt(r.workflow.humanMinutes)} 分（改善前 ${fmt(r.before.humanMinutes)} 分）` +
        ` / 納品まで ${fmt(r.premium.finishedAt)} vs ${fmt(r.workflow.finishedAt)} 分（改善前 ${fmt(r.before.finishedAt)} 分）`,
    );
    expect(r.workflow.profitPerPersonDay).toBeGreaterThan(r.premium.profitPerPersonDay);
    expect(r.workflow.profitPerPersonDay - r.before.profitPerPersonDay).toBeGreaterThan(
      r.premium.profitPerPersonDay - r.before.profitPerPersonDay,
    );
    // Premium は人間の時間を減らさない（ボトルネックは人間のレビュー）
    expect(r.premium.humanMinutes).toBeCloseTo(r.before.humanMinutes, 0);
    // 自動テストで確かめられない Task はレビューのまま残るので、人間の時間は半分までは減らないが、はっきり減る
    expect(r.workflow.humanMinutes).toBeLessThan(r.before.humanMinutes * 0.85);
  });
});
