import { describe, expect, it } from 'vitest';
import type { TaskDef } from '../../src/content/types';
import { compare, seeds } from '../helpers/compare';
import { playConcurrent } from '../helpers/concurrent';

/**
 * 「この人を Premium にするより Workflow 直した方が良くない？」（企画書68章）を、キャンペーンの最後の同時進行で確かめる。
 * AI 適性の高い Task を「AI → 人間レビュー」で任せた構成では、人間のレビューがボトルネックで、AI の容量は足りている。
 * ここで運用者を Premium にしても速くならず固定費が増えるだけだが、レビューを自動テスト（AI → 自動テスト → 確認）に
 * 置き換えて Workflow を直すと、人間の時間が大きく減る。
 */
const SEEDS = seeds(30);
const reviewed = (task: TaskDef) => (task.aiAptitude >= 0.5 ? 'aiThenHumanReview' : 'human');
const automated = (task: TaskDef) => (task.aiAptitude >= 0.5 ? 'aiThenEval' : 'human');

const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');

describe('Premium を増やすより Workflow を直す方が効く（企画書68章）', () => {
  it('人間のレビューが詰まっている場面では、Workflow 改善の方が Premium 追加より Profit / Human Hour を伸ばす', () => {
    const r = compare(
      {
        before: (seed) => playConcurrent(seed, { mode: reviewed }),
        premium: (seed) => playConcurrent(seed, { mode: reviewed, seats: { suzuki: 'premium' } }),
        workflow: (seed) => playConcurrent(seed, { mode: automated }),
      },
      SEEDS,
    );
    console.log(
      `[企画書68章] Profit/Human Hour：Premium追加 ${fmt(r.premium.profitPerHumanHour)} vs Workflow改善 ${fmt(r.workflow.profitPerHumanHour)} 円/人時` +
        `（改善前 ${fmt(r.before.profitPerHumanHour)}）` +
        ` / 人間時間 ${fmt(r.premium.humanMinutes)} vs ${fmt(r.workflow.humanMinutes)} 分（改善前 ${fmt(r.before.humanMinutes)} 分）` +
        ` / 納品まで ${fmt(r.premium.finishedAt)} vs ${fmt(r.workflow.finishedAt)} 分（改善前 ${fmt(r.before.finishedAt)} 分）`,
    );
    expect(r.workflow.profitPerHumanHour).toBeGreaterThan(r.premium.profitPerHumanHour);
    expect(r.workflow.profitPerHumanHour - r.before.profitPerHumanHour).toBeGreaterThan(
      r.premium.profitPerHumanHour - r.before.profitPerHumanHour,
    );
    // Premium は人間の時間を減らさない（ボトルネックは人間のレビュー）
    expect(r.premium.humanMinutes).toBeCloseTo(r.before.humanMinutes, 0);
    expect(r.workflow.humanMinutes).toBeLessThan(r.before.humanMinutes / 2);
  });
});
