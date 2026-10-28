import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getHuman, getProject } from '../../src/content/index';
import type { ProjectSize } from '../../src/content/types';
import { openInquiries, postInquiries } from '../../src/core/board';
import { contractOf } from '../../src/core/contract';
import { dailyCost, laborCost } from '../../src/core/formulas';
import { orderTerms } from '../../src/core/orders';
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
  it('標準価格から見積もった「人間だけの人件費」（標準価格 × 原価率）は、人間だけで進めたときの実際の人件費とおおむね揃う（規模によらない）', () => {
    for (const size of ['S', 'M', 'L', 'XL'] as const satisfies readonly ProjectSize[]) {
      // 期限厳守の案件は標準価格に割増が乗るので、炎上しても続行の案件で比べる
      const ids = Array.from({ length: 160 }, (_, i) => generatedProjectId(`economy:${i}`, size));
      const ratios = ids
        .filter((id) => contractOf(id) === 'lenient')
        .slice(0, 80)
        .map((id) => {
          const def = getProject(id);
          const minutes = def.tasks.reduce((sum, t) => sum + t.effort, 0);
          const actual = laborCost(minutes, dailyCost(average));
          return actual / (def.revenue * balance.staff.costRatio);
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

describe('報酬は評判で変わる', () => {
  it('同じ引き合いでも、評判が高いほど受注したときの報酬が高い（評判を守る価値がある）', () => {
    let higher = 0;
    let total = 0;
    for (let n = 0; n < 12; n++) {
      const low = withInquiries(`best:${n}`, 10);
      const high = { ...low, reputation: 95 };
      for (const id of openInquiries(low)) {
        total++;
        if (orderTerms(high, id).revenue > orderTerms(low, id).revenue) higher++;
        expect(orderTerms(high, id).deadlineDays).toBe(orderTerms(low, id).deadlineDays);
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(higher).toBe(total);
  });
});

/** 引き合いが届いた、評判 reputation の会社 */
function withInquiries(seed: string, reputation: number): GameState {
  const s = createInitialState(seed, { board: true, tutorial: false, talent: true });
  const started = postInquiries(s, () => {});
  const posted = step(started, 1).state;
  if (posted.clock >= DAY) throw new Error('引き合いが届く前に営業日が終わった');
  return { ...posted, reputation };
}
