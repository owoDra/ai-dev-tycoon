import { describe, expect, it } from 'vitest';
import { getProject } from '../../src/content/index';
import type { SeatId, TaskDef } from '../../src/content/types';
import { compare, seeds } from '../helpers/compare';
import { FULL_TEAM, playConcurrent, RUSH } from '../helpers/concurrent';

/**
 * Seat の設計意図（企画書6章「全員 Premium にすれば強いとは限らない」）を、短納期の2件の同時進行
 * （固定 seed で生成した、社内ツールの改修とキャンペーンLP制作の型の案件）で確かめる。全社員がそろい、AI 適性の高い Task は
 * 「AI → 自動テスト → 確認」に Eval を付けて任せる（AI Worker の使用量が多い、終盤の構成）。Seat だけを変えて比べる。
 */
const SEEDS = seeds(30);
const OPERATOR = 'suzuki';
const EVALS = ['evalUnitTest', 'evalAcceptance'];
const mode = (task: TaskDef) => (task.aiAptitude >= 0.5 ? 'aiThenEval' : 'human');
const play = (seats: Readonly<Record<string, SeatId>>) => (seed: string) =>
  playConcurrent(seed, { mode, seats, parts: EVALS });

const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');

describe('Seat のバランス（企画書6章・短納期の2件の同時進行）', () => {
  it('全員 Premium は最適ではない：AI Worker を運用する人だけ Premium の方が Profit / Person-Day が高い', () => {
    const allPremium = Object.fromEntries(FULL_TEAM.map((id) => [id, 'premium' as const]));
    const r = compare(
      { allStandard: play({}), operator: play({ [OPERATOR]: 'premium' }), allPremium: play(allPremium) },
      SEEDS,
    );
    console.log(
      `[企画書6章] ${RUSH.map((id) => getProject(id).name).join('＋')} の Profit/Person-Day：` +
        `全員Premium ${fmt(r.allPremium.profitPerPersonDay)} vs 一部Premium（運用者だけ） ${fmt(r.operator.profitPerPersonDay)} 円/人日` +
        `（参考：全員Standard ${fmt(r.allStandard.profitPerPersonDay)}）` +
        ` / 納品まで ${fmt(r.allPremium.finishedAt)} vs ${fmt(r.operator.finishedAt)} 分（全員Standard ${fmt(r.allStandard.finishedAt)} 分）` +
        ` / Seat の固定費 ${fmt(r.allPremium.seatCost)} vs ${fmt(r.operator.seatCost)} 円（全員Standard ${fmt(r.allStandard.seatCost)} 円）`,
    );
    expect(r.operator.profitPerPersonDay).toBeGreaterThan(r.allPremium.profitPerPersonDay);
    // 運用者以外の Premium は AI の容量を増やさない（速くならず、固定費だけが増える）
    expect(r.allPremium.finishedAt).toBeCloseTo(r.operator.finishedAt);
    expect(r.allPremium.seatCost).toBeGreaterThan(r.operator.seatCost);
    // 運用者の Premium には意味がある：使用量の上限で遅くならず、全員 Standard より早く納品できる
    expect(r.operator.finishedAt).toBeLessThan(r.allStandard.finishedAt);
  });
});
