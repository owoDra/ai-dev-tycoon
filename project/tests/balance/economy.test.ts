import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getHuman, getProject } from '../../src/content/index';
import type { ProjectSize } from '../../src/content/types';
import { estimatePersonDays, type PriceStep, priceSteps, quoteBid } from '../../src/core/bidding';
import { openInquiries } from '../../src/core/board';
import { reduce } from '../../src/core/commands';
import { dailyCost, laborCost } from '../../src/core/formulas';
import { generatedProjectId } from '../../src/core/projectGen';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';

/**
 * 経済の土台（Phase 30。企画書「人間1人あたりの利益を最大化する」）。
 * 案件の作業量は請求の人日より縮めてあるので、給与も同じ縮尺で上げ、人間だけで進めると利益が薄くなるようにする。
 * AI で人間の時間を浮かせることが、お金の面で効く。序盤は失敗しても立て直せる資金を持たせる。
 */

const DAY = balance.time.minutesPerDay;
const median = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

/** 平均的な売値の社員（給与は dailyCost で、作業時間の縮尺を掛ける） */
const average = { dailyRate: balance.talent.rate.mean };

describe('人件費の縮尺', () => {
  it('見積の「人間だけの人件費」は、人間だけで進めたときの実際の人件費とおおむね揃う（規模によらない）', () => {
    for (const size of ['S', 'M', 'L', 'XL'] as const satisfies readonly ProjectSize[]) {
      const ratios = Array.from({ length: 80 }, (_, i) => {
        const def = getProject(generatedProjectId(`economy:${i}`, size));
        const minutes = def.tasks.reduce((sum, t) => sum + t.effort, 0);
        const actual = laborCost(minutes, dailyCost(average));
        const estimate = estimatePersonDays(def) * balance.talent.rate.mean * balance.staff.costRatio;
        return actual / estimate;
      });
      const m = median(ratios);
      expect(m, size).toBeGreaterThan(0.5);
      expect(m, size).toBeLessThan(1.5);
    }
  });

  it('人間だけで進めると、標準の見積額に対する人件費が売上の半分ほどになる（利益率が9割を超えない）', () => {
    const shares = Array.from({ length: 120 }, (_, i) => {
      const def = getProject(generatedProjectId(`margin:${i}`, (['S', 'M', 'L'] as const)[i % 3] ?? 'M'));
      const minutes = def.tasks.reduce((sum, t) => sum + t.effort, 0);
      return laborCost(minutes, dailyCost(average)) / def.revenue;
    });
    expect(median(shares)).toBeGreaterThan(0.25);
    expect(median(shares)).toBeLessThan(0.9);
  });
});

describe('序盤の資金（失敗しても立て直せる）', () => {
  it('開業資金で、最初の社員の給与を3週間（15営業日）以上払える', () => {
    const s = createInitialState('funds', { board: true, tutorial: false, talent: true });
    const payroll = Object.keys(s.team).reduce((sum, id) => sum + dailyCost(getHuman(id)), 0);
    expect(balance.funds.initial / payroll).toBeGreaterThanOrEqual(15);
  });
});

describe('見積の最善は評判で変わる', () => {
  it('評判が低いと安めの見積が、高いと高めの見積が、期待利益（勝率 ×（見積額 − 人間だけの人件費））で最善になりやすい', () => {
    const bestAt = (reputation: number) => {
      const counts: Partial<Record<PriceStep, number>> = {};
      for (let n = 0; n < 12; n++) {
        const s = withInquiries(`best:${n}`, reputation);
        for (const id of openInquiries(s)) {
          const def = getProject(id);
          const labor = estimatePersonDays(def) * balance.talent.rate.mean * balance.staff.costRatio;
          const expected = (p: PriceStep) => {
            const q = quoteBid(s, id, p, 'standard');
            return q.winChance * (q.amount - labor);
          };
          const best = [...priceSteps].sort((a, b) => expected(b) - expected(a))[0];
          if (best) counts[best] = (counts[best] ?? 0) + 1;
        }
      }
      return counts;
    };
    const rank = (p: PriceStep) => priceSteps.indexOf(p);
    const meanRank = (counts: Partial<Record<PriceStep, number>>) => {
      const entries = Object.entries(counts) as [PriceStep, number][];
      const total = entries.reduce((sum, [, c]) => sum + c, 0);
      return entries.reduce((sum, [p, c]) => sum + rank(p) * c, 0) / Math.max(1, total);
    };
    const low = bestAt(10);
    const high = bestAt(95);
    console.log(`[経済] 期待利益で最善の価格：評判10 ${JSON.stringify(low)} / 評判95 ${JSON.stringify(high)}`);
    // 評判が高いほど、最善の価格は高い側に寄る。どちらの評判でも、1つの価格がすべての引き合いで最善にはならない
    expect(meanRank(high)).toBeGreaterThan(meanRank(low));
    expect(Object.keys(high).length).toBeGreaterThan(1);
  });
});

/** 引き合いが届いた、評判 reputation の会社 */
function withInquiries(seed: string, reputation: number): GameState {
  const s = createInitialState(seed, { board: true, tutorial: false, talent: true });
  const started = reduce(reduce({ ...s, paused: true }, { type: 'TogglePause' }).state, { type: 'TogglePause' }).state;
  const posted = step({ ...started, paused: false }, 1).state;
  if (posted.clock >= DAY) throw new Error('引き合いが届く前に営業日が終わった');
  return { ...posted, reputation };
}
