import { describe, expect, it } from 'vitest';
import { attributeProject, type Impact } from '../../src/core/attribution';
import { deserialize, serialize } from '../../src/core/serialize';
import { seeds } from '../helpers/compare';
import { type PlayConfig, playConfigured } from '../helpers/configured';

/**
 * 寄与の記録（core/attribution.ts）。AI の作業の構成を Task に記録し、要素ごとの寄与を期待値で見積もる。
 * 期待値の寄与の合計が、実際にシミュレーションした「構成あり − 基準の構成」の差分とおおむね一致することを確かめる。
 */
const SEEDS = seeds(40, 'attr');
/** 期待値の見積もりと、seed で平均したシミュレーションの差分のずれの許容（差分に対する割合） */
const TOLERANCE = 0.35;

interface Realized {
  readonly humanMinutes: number;
  readonly cost: number;
  readonly attributed: Impact;
}

/** seed で平均した実績（人間時間・人件費以外の費用）と、寄与の見積もりの合計 */
function realize(config: PlayConfig): Realized {
  let humanMinutes = 0;
  let cost = 0;
  let attributed: Impact = { humanMinutes: 0, cost: 0, quality: 0 };
  for (const seed of SEEDS) {
    const { state, score } = playConfigured(config, seed);
    humanMinutes += score.humanMinutes / SEEDS.length;
    cost += (score.aiCost + score.accidentCost + score.reworkCost) / SEEDS.length;
    const a = attributeProject(state, config.projectId).total;
    attributed = {
      humanMinutes: attributed.humanMinutes + a.humanMinutes / SEEDS.length,
      cost: attributed.cost + a.cost / SEEDS.length,
      quality: attributed.quality + a.quality / SEEDS.length,
    };
  }
  return { humanMinutes, cost, attributed };
}

const near = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * TOLERANCE);

describe('寄与の記録', () => {
  it('AI が作業した Task に構成（Harness と Session）を記録し、人間だけの Task には記録しない', () => {
    const { state } = playConfigured(
      { projectId: 'corporateSite', mode: 'aiThenHumanReview', parts: ['evalUnitTest'] },
      'attr-setup',
    );
    const tasks = Object.values(state.projects.corporateSite?.tasks ?? {});
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) expect(t.setup?.harness.parts).toEqual(['evalUnitTest']);
    const human = playConfigured({ projectId: 'corporateSite', mode: 'human' }, 'attr-setup');
    for (const t of Object.values(human.state.projects.corporateSite?.tasks ?? {})) expect(t.setup).toBeNull();
  });

  it('記録はセーブを通っても残り、v7 のセーブは記録なしで読み込める', () => {
    const { state } = playConfigured({ projectId: 'corporateSite', mode: 'ai', parts: ['hookUnitTest'] }, 'attr-save');
    expect(deserialize(serialize(state))).toEqual(state);
    const v7 = JSON.parse(serialize(state)) as {
      saveVersion: number;
      state: { projects: Record<string, { tasks: Record<string, Record<string, unknown>> }> };
    };
    for (const p of Object.values(v7.state.projects)) for (const t of Object.values(p.tasks)) delete t.setup;
    v7.saveVersion = 7;
    const loaded = deserialize(JSON.stringify(v7));
    for (const t of Object.values(loaded.projects.corporateSite?.tasks ?? {})) expect(t.setup).toBeNull();
  });

  it('要素ごとの寄与の合計は、構成全体の差分（記録した構成 − 基準の構成）に一致する', () => {
    const { state } = playConfigured(
      {
        projectId: 'paymentFix',
        mode: 'aiThenHumanReview',
        parts: ['hookUnitTest', 'evalUnitTest', 'skillFrontend'],
        modelId: 'frontier',
        feed: { mode: 'all' },
      },
      'attr-sum',
    );
    const a = attributeProject(state, 'paymentFix');
    expect(a.factors.map((f) => f.key).sort()).toEqual(
      ['context', 'model:frontier', 'part:evalUnitTest', 'part:hookUnitTest', 'part:skillFrontend'].sort(),
    );
    for (const key of ['humanMinutes', 'cost', 'quality'] as const) {
      const sum = a.factors.reduce((s, f) => s + f.impact[key], 0);
      expect(sum).toBeCloseTo(a.total[key], 6);
      for (const t of a.tasks) expect(t.factors.reduce((s, f) => s + f.impact[key], 0)).toBeCloseTo(t.total[key], 6);
    }
  });

  it.each([
    ['Eval 3種', ['evalUnitTest', 'evalAcceptance', 'evalUiReq']],
    ['Hook・Skill・Eval', ['hookUnitTest', 'skillFrontend', 'evalUnitTest']],
  ])('Harness（%s）の寄与の合計が、シミュレーションの差分とおおむね一致する', (_, parts) => {
    const base = realize({ projectId: 'corporateSite', mode: 'aiThenHumanReview' });
    const withParts = realize({ projectId: 'corporateSite', mode: 'aiThenHumanReview', parts });
    expect(base.attributed.humanMinutes).toBe(0);
    near(withParts.attributed.humanMinutes, withParts.humanMinutes - base.humanMinutes);
    near(withParts.attributed.cost, withParts.cost - base.cost);
  });

  it('不要な資料を渡すと、Context の寄与は人間時間と費用を増やす向きに出て、シミュレーションの差分と向きがそろう', () => {
    const needed = realize({ projectId: 'paymentFix', mode: 'aiThenHumanReview', feed: { mode: 'needed' } });
    const all = realize({ projectId: 'paymentFix', mode: 'aiThenHumanReview', feed: { mode: 'all' } });
    const diff = all.attributed.humanMinutes - needed.attributed.humanMinutes;
    expect(all.humanMinutes - needed.humanMinutes).toBeGreaterThan(0);
    expect(diff).toBeGreaterThan(0);
    expect(all.cost - needed.cost).toBeGreaterThan(0);
    expect(all.attributed.cost - needed.attributed.cost).toBeGreaterThan(0);
  });
});
