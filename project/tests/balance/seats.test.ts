import { describe, expect, it } from 'vitest';
import { getProject } from '../../src/content/index';
import type { SeatId, TaskDef } from '../../src/content/types';
import { compare, seeds } from '../helpers/compare';
import { playConcurrent, RUSH } from '../helpers/concurrent';

/**
 * Seat の設計意図（企画書6章「全員 Premium にすれば強いとは限らない」を、会社が枚数で買う Seat で表したもの）を、
 * 短納期の2件の同時進行（固定 seed で生成した、社内ツールの改修とキャンペーンLP制作の型の案件）で確かめる。
 * 全社員がそろい、AI 適性の高い Task は「AI → 自動テスト → 確認」に Eval を付けて任せる（AI Worker の使用量が多い、終盤の構成）。
 * Seat の枚数だけを変えて比べる。
 */
const SEEDS = seeds(30);
const EVALS = ['evalUnitTest', 'evalAcceptance'];
const mode = (task: TaskDef) => (task.aiAptitude >= 0.5 ? 'aiThenEval' : 'human');
const play = (seats: Partial<Readonly<Record<SeatId, number>>>) => (seed: string) =>
  playConcurrent(seed, { mode, seats, parts: EVALS });

const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');

describe('Seat のバランス（企画書6章・短納期の2件の同時進行）', () => {
  it('Seat は足りないと AI が止まって大きく遅れ、使い切る量より多く買っても速くならず固定費だけが増える', () => {
    const r = compare(
      {
        short: play({ standard: 1 }),
        enough: play({}),
        over: play({ premium: 5 }),
      },
      SEEDS,
    );
    console.log(
      `[企画書6章] ${RUSH.map((id) => getProject(id).name).join('＋')} の Profit/Person-Day：` +
        `Standard 1枚 ${fmt(r.short.profitPerPersonDay)} / Standard 2枚 ${fmt(r.enough.profitPerPersonDay)} / ` +
        `＋Premium 5枚 ${fmt(r.over.profitPerPersonDay)} 円/人日` +
        ` / 納品まで ${fmt(r.short.finishedAt)} / ${fmt(r.enough.finishedAt)} / ${fmt(r.over.finishedAt)} 分` +
        ` / Seat の固定費 ${fmt(r.short.seatCost)} / ${fmt(r.enough.seatCost)} / ${fmt(r.over.seatCost)} 円`,
    );
    // 足りないと、使用量を使い切った AI が翌営業日まで止まる
    expect(r.short.finishedAt).toBeGreaterThan(r.enough.finishedAt * 2);
    expect(r.enough.profitPerPersonDay).toBeGreaterThan(r.short.profitPerPersonDay);
    // 足りている以上に買っても速くならず、固定費だけが増える
    expect(r.over.finishedAt).toBeCloseTo(r.enough.finishedAt);
    expect(r.over.seatCost).toBeGreaterThan(r.enough.seatCost);
    expect(r.enough.profitPerPersonDay).toBeGreaterThan(r.over.profitPerPersonDay);
  });
});
