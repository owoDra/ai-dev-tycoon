import { describe, expect, it } from 'vitest';
import { managedScore, qualityDemand, qualityExtremes, WORKERS } from '../helpers/managers';

/**
 * 管理者の設計意図：品質要求の低い案件では AI PM、高い案件では人間 PM の方が 利益 / 人日 が高い（どちらも支配的でない）。
 * 管理者を置ける規模の会社で、平均的な社員3人と AI Worker のチームに案件1件を任せ、納品まで進める（tests/helpers/managers.ts）。
 * 人間 PM は判断が堅実だが、PM の稼働を人日に数える。AI PM は人日を使わないが、見逃しの損害を軽く見て判断にばらつきがあり、
 * 品質要求の高い Task では見落とし（失敗と事故）が増える。
 * 固定 seed で生成した規模 M の案件を品質要求の順に並べ、低い6件と高い6件を、2つの seed で平均して比べる。
 */
const COUNT = 6;
const SEEDS = ['a', 'b'];
const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');

interface Row {
  readonly projectId: string;
  readonly demand: number;
  readonly human: number;
  readonly ai: number;
  readonly humanQuality: number;
  readonly aiQuality: number;
}

function compare(ids: readonly string[]): Row[] {
  return ids.map((projectId) => {
    const h = SEEDS.map((seed) => managedScore(projectId, 'human', seed));
    const a = SEEDS.map((seed) => managedScore(projectId, 'ai', seed));
    const avg = (xs: readonly { profitPerPersonDay: number }[]) =>
      xs.reduce((sum, x) => sum + x.profitPerPersonDay, 0) / xs.length;
    const q = (xs: readonly { quality: number }[]) => xs.reduce((sum, x) => sum + x.quality, 0) / xs.length;
    for (const s of [...h, ...a]) expect(s.completed).toBe(true);
    return {
      projectId,
      demand: qualityDemand(projectId),
      human: avg(h),
      ai: avg(a),
      humanQuality: q(h),
      aiQuality: q(a),
    };
  });
}

const mean = (rows: readonly Row[], f: (r: Row) => number) => rows.reduce((sum, r) => sum + f(r), 0) / rows.length;

describe('管理者のバランス（人間 PM と AI PM のどちらも支配的でない）', () => {
  it('品質要求の低い案件では AI PM、高い案件では人間 PM の方が 利益 / 人日 が高い', () => {
    const { low, high } = qualityExtremes(COUNT);
    const groups = { low: compare(low), high: compare(high) };
    const line = (r: Row) =>
      `  ${r.projectId}（品質要求 ${r.demand.toFixed(2)}）：人間 PM ${fmt(r.human)}（品質 ${r.humanQuality.toFixed(2)}）` +
      ` / AI PM ${fmt(r.ai)}（品質 ${r.aiQuality.toFixed(2)}）`;
    const summary = (label: string, rows: readonly Row[]) =>
      `${label}：人間 PM ${fmt(mean(rows, (r) => r.human))} 円/人日・AI PM ${fmt(mean(rows, (r) => r.ai))} 円/人日` +
      `・AI PM が上回った案件 ${rows.filter((r) => r.ai > r.human).length}/${rows.length}\n${rows.map(line).join('\n')}`;
    console.log(
      `[管理者] 社員${WORKERS}人＋AI Worker のチーム・${SEEDS.length} seed の平均（利益 / 人日）\n` +
        `${summary('品質要求の低い案件', groups.low)}\n${summary('品質要求の高い案件', groups.high)}`,
    );
    // 品質要求の低い案件：AI PM の方が平均で高く、過半数の案件で上回る
    expect(mean(groups.low, (r) => r.ai)).toBeGreaterThan(mean(groups.low, (r) => r.human));
    expect(groups.low.filter((r) => r.ai > r.human).length).toBeGreaterThan(COUNT / 2);
    // 品質要求の高い案件：人間 PM の方が平均で高く、過半数の案件で上回る。AI PM は品質も低い
    expect(mean(groups.high, (r) => r.human)).toBeGreaterThan(mean(groups.high, (r) => r.ai));
    expect(groups.high.filter((r) => r.human > r.ai).length).toBeGreaterThan(COUNT / 2);
    expect(mean(groups.high, (r) => r.aiQuality)).toBeLessThan(mean(groups.high, (r) => r.humanQuality));
  });
});
