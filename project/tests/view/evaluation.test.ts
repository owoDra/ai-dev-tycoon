import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { openInquiries, postInquiries } from '../../src/core/board';
import { reduce } from '../../src/core/commands';
import { deliveryRating } from '../../src/core/orders';
import { scoreProject } from '../../src/core/scoring';
import { createInitialState, type GameState } from '../../src/core/state';
import { deliveryBreakdown, evaluationGuide } from '../../src/view/evaluation';
import { todoList } from '../../src/view/todo';
import { growCompany } from '../helpers/growth';

const delivered = (() => {
  let cached: GameState | undefined;
  return () => {
    cached ??= growCompany('evaluation', 4).state;
    return cached;
  };
})();

describe('納品の評価の内訳（view/evaluation.ts）', () => {
  it('売上から費用を引くと利益になり、評判の理由の合計は評判の変化と一致する', () => {
    const state = delivered();
    const ids = Object.values(state.projects).filter((p) => p.completedAt !== null);
    expect(ids.length).toBeGreaterThan(0);
    for (const run of ids) {
      const b = deliveryBreakdown(state, run.projectId);
      if (!b) throw new Error('内訳がない');
      const [revenue, ...costs] = b.lines;
      expect(revenue?.id).toBe('revenue');
      expect((revenue?.amount ?? 0) - costs.reduce((sum, l) => sum + l.amount, 0)).toBeCloseTo(b.profit, 6);
      expect(b.profit).toBeCloseTo(scoreProject(state, run.projectId)?.profit ?? NaN, 6);
      expect(b.personDays).toBeGreaterThan(0);
      expect(b.reputation?.total).toBeCloseTo(deliveryRating(state, run.projectId), 6);
      // 次に直す場所は、品質が基準を下回った工程だけ
      if (b.weakest) expect(b.weakest.quality).toBeLessThan(b.qualityPivot);
    }
  });

  it('納品していない案件は内訳を出さない', () => {
    const s = reduce(createInitialState('ev', { board: true }), {
      type: 'StartProject',
      projectId: 'tutorialLp',
    }).state;
    expect(deliveryBreakdown(s, 'tutorialLp')).toBeNull();
  });

  it('評価のしくみは、評判の条件と評判による受注額の補正をいまの値で出す', () => {
    const base = createInitialState('guide', { board: true, tutorial: false });
    const g = evaluationGuide(base);
    expect(g.onTime).toBe(balance.reputation.onTime);
    expect(g.qualityPivot).toBe(balance.reputation.qualityPivot);
    // 初期の評判では補正なし、評判が高いほど受注額が上がる
    expect(g.priceEffect).toBeCloseTo(0, 6);
    expect(evaluationGuide({ ...base, reputation: 100 }).priceEffect).toBeGreaterThan(0);
  });
});

describe('今日やること（view/todo.ts）', () => {
  it('案件がなく引き合いが届いていれば受注を先に、最後に次の目標（昇格の条件のうち一番遠いもの）を置く', () => {
    const s = postInquiries(createInitialState('todo', { board: true, tutorial: false }), () => {});
    expect(openInquiries(s).length).toBeGreaterThan(0);
    const items = todoList(s);
    expect(items[0]?.id).toBe('order');
    expect(items.at(-1)).toMatchObject({ id: 'goal', target: { type: 'company' } });
  });

  it('受注した案件の担当が決まっていなければ、その案件を開く項目を出す。資金がマイナスなら一番先に出す', () => {
    const s = postInquiries(createInitialState('todo2', { board: true, tutorial: false }), () => {});
    const id = openInquiries(s)[0] ?? '';
    const accepted = reduce(s, { type: 'AcceptOrder', projectId: id }).state;
    expect(todoList(accepted)[0]).toMatchObject({ id: 'assign', target: { type: 'project', projectId: id } });
    const broke: GameState = { ...accepted, ledger: { ...accepted.ledger, projectProfit: -balance.funds.initial * 2 } };
    expect(todoList(broke)[0]?.id).toBe('cash');
  });

  it('チュートリアル中や単発のプレイでは出さない', () => {
    expect(todoList(createInitialState('todo3', { board: true }))).toEqual([]);
    expect(todoList(createInitialState('todo4'))).toEqual([]);
  });
});
