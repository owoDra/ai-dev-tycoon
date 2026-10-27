import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getHuman } from '../../src/content/index';
import type { HumanWorkerDef } from '../../src/content/types';
import { scoreCompany } from '../../src/core/scoring';
import { marketCandidates, talentId } from '../../src/core/talent';
import { playCampaign, smartHirePolicy, smartPolicy } from '../helpers/campaign';

/**
 * 採用市場の人材の売値（企画の変更「売値は能力で変わり、人日あたり最低5万・平均8万」）。
 * 大量に生成して分布を確かめ、能力（速度・正確さ・得意分野）と売値が相関することを示す
 */
const COUNT = 5_000;
const talents: HumanWorkerDef[] = Array.from({ length: COUNT }, (_, i) => getHuman(talentId(`balance-${i}`)));
const rates = talents.map((h) => h.dailyRate);
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');

/** ピアソンの相関係数 */
function correlation(xs: readonly number[], ys: readonly number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((x, i) => {
    const y = ys[i] ?? 0;
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  });
  return sxy / Math.sqrt(sxx * syy);
}

/** 能力の総合点。速度と正確さを平均からの比で足し、得意分野を少し加える */
const ability = (h: HumanWorkerDef) =>
  h.skill / ((balance.talent.skill.min + balance.talent.skill.max) / 2) +
  h.accuracy / balance.human.competence +
  0.1 * h.strengths.length;

describe('人材の売値の分布', () => {
  it('売値の平均は8万円前後で、下限5万円を下回らない', () => {
    const min = Math.min(...rates);
    const max = Math.max(...rates);
    const avg = mean(rates);
    const atFloor = rates.filter((r) => r === balance.talent.rate.floor).length / COUNT;
    const buckets = [50_000, 60_000, 70_000, 80_000, 90_000, 100_000, 110_000].map((lo) => {
      const n = rates.filter((r) => r >= lo && r < lo + 10_000).length;
      return `${lo / 10_000}万〜 ${((n / COUNT) * 100).toFixed(1)}%`;
    });
    console.log(
      `[人材] ${COUNT}人の売値：最小 ${fmt(min)} / 平均 ${fmt(avg)} / 最大 ${fmt(max)} 円/人日` +
        `（下限ちょうど ${(atFloor * 100).toFixed(1)}%）\n  ${buckets.join(' / ')}`,
    );
    expect(min).toBeGreaterThanOrEqual(balance.talent.rate.floor);
    expect(min).toBe(50_000);
    expect(avg).toBeGreaterThan(77_000);
    expect(avg).toBeLessThan(83_000);
    // 単価に幅があり、高い人も安い人もいる（全員が同じ値段にならない）
    expect(max).toBeGreaterThan(105_000);
    expect(atFloor).toBeLessThan(0.05);
  });

  it('能力と売値が相関する（速い人・正確な人・得意分野の多い人ほど高い）', () => {
    const total = correlation(talents.map(ability), rates);
    const bySkill = correlation(
      talents.map((h) => h.skill),
      rates,
    );
    const byAccuracy = correlation(
      talents.map((h) => h.accuracy),
      rates,
    );
    const byStrengths = correlation(
      talents.map((h) => h.strengths.length),
      rates,
    );
    console.log(
      `[人材] 売値との相関：能力の総合 ${total.toFixed(2)} / 速度 ${bySkill.toFixed(2)} / 正確さ ${byAccuracy.toFixed(2)} / 得意分野の数 ${byStrengths.toFixed(2)}`,
    );
    expect(total).toBeGreaterThan(0.9);
    for (const r of [bySkill, byAccuracy, byStrengths]) expect(r).toBeGreaterThan(0.2);
  });

  it('毎日の採用市場には、安い人と高い人が混ざる（同じ単価の候補ばかりにならない）', () => {
    const days = Array.from({ length: 200 }, (_, d) => marketCandidates('market-balance', d).map(getHuman));
    const spread = days.map((c) => Math.max(...c.map((h) => h.dailyRate)) - Math.min(...c.map((h) => h.dailyRate)));
    expect(mean(spread)).toBeGreaterThan(10_000);
  });
});

describe('採用の経営判断', () => {
  it('人を増やすとキャンペーンを早く納品できるが、契約金と待機中の給与がかかる（採用は無料の上位互換ではない）', () => {
    const options = { thinkSeconds: 20, tutorialThinkSeconds: 5, limitMinutes: 20_000 };
    const lean = playCampaign({ ...options, policy: smartPolicy });
    const grown = playCampaign({ ...options, policy: smartHirePolicy(4) });
    const a = scoreCompany(lean.state);
    const b = scoreCompany(grown.state);
    console.log(
      `[採用] 2人のまま：クリア ${fmt(lean.clearedAt ?? 0)} 分・待機中の給与 ${fmt(a.idleCost)} 円 / ` +
        `4人に増やす：クリア ${fmt(grown.clearedAt ?? 0)} 分・契約金 ${fmt(b.hireCost)} 円・待機中の給与 ${fmt(b.idleCost)} 円` +
        ` / 会社の Profit/Person-Day ${fmt(a.profitPerPersonDay)} vs ${fmt(b.profitPerPersonDay)} 円/人日`,
    );
    expect(Object.keys(grown.state.team)).toHaveLength(4);
    expect(lean.clearedAt).not.toBeNull();
    expect(grown.clearedAt ?? Infinity).toBeLessThan(lean.clearedAt ?? 0);
    expect(b.hireCost).toBeGreaterThan(0);
    expect(b.idleCost).toBeGreaterThan(a.idleCost);
  });
});
