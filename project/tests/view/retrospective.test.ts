import { describe, expect, it } from 'vitest';
import { getHarnessPart } from '../../src/content/index';
import { attributeProject } from '../../src/core/attribution';
import { stageTimes } from '../../src/core/bottleneck';
import { ja } from '../../src/i18n/ja';
import { bottleneckName } from '../../src/view/bottleneck';
import { counterfactualJobs, retrospective, runCounterfactuals } from '../../src/view/retrospective';
import { type PlayConfig, playConfigured } from '../helpers/configured';

/**
 * 振り返りの3枚のカード（企画書60章）が、プレイ内容に応じた妥当な内容になること。
 */
const EVAL_PLAY: PlayConfig = {
  projectId: 'corporateSite',
  mode: 'aiThenHumanReview',
  parts: ['evalAcceptance', 'toolFiles', 'skillReport'],
};
/** すべての資料を渡したまま（不要な資料を大量に渡す）、Harness は Eval だけ */
const CLUTTERED_PLAY: PlayConfig = {
  projectId: 'paymentFix',
  mode: 'aiThenHumanReview',
  parts: ['evalUnitTest'],
  feed: { mode: 'all' },
};
const SEEDS = ['retro-1', 'retro-2', 'retro-3'];

function retroOf(config: PlayConfig, seed: string, refine = false) {
  const { state, score } = playConfigured(config, seed);
  const attribution = attributeProject(state, config.projectId);
  const counterfactual = refine
    ? runCounterfactuals(counterfactualJobs(state, config.projectId, attribution))
    : new Map();
  return { state, retro: retrospective(state, config.projectId, score, attribution, counterfactual) };
}

const categoryOf = (factor: string | null) =>
  factor?.startsWith('part:') ? getHarnessPart(factor.slice('part:'.length)).category : factor;

describe('振り返りのカード', () => {
  it.each(SEEDS)('Eval を入れた構成では「一番効いた改善」に Eval が選ばれる（%s）', (seed) => {
    const { retro } = retroOf(EVAL_PLAY, seed);
    expect(categoryOf(retro.best.factor)).toBe('eval');
    expect(retro.best.title).toBe(getHarnessPart('evalAcceptance').name);
    expect(retro.best.body).toMatch(/削減|節約/);
  });

  it('「それが無かった場合」の再シミュレーションで置き換えても、一番効いた改善は Eval のまま', () => {
    const { retro } = retroOf(EVAL_PLAY, 'retro-cf', true);
    expect(categoryOf(retro.best.factor)).toBe('eval');
  });

  it('再シミュレーションは寄与の大きい改善の上位だけを、記録のある Task ごとに行う', () => {
    const { state } = playConfigured(EVAL_PLAY, 'retro-jobs');
    const jobs = counterfactualJobs(state, EVAL_PLAY.projectId, attributeProject(state, EVAL_PLAY.projectId));
    expect(new Set(jobs.map((j) => j.key)).size).toBeLessThanOrEqual(2);
    expect(jobs.map((j) => j.key)).toContain('part:evalAcceptance');
  });

  it.each(SEEDS)('不要な資料を大量に渡した構成では「最大の無駄」に Context が選ばれる（%s）', (seed) => {
    const { retro } = retroOf(CLUTTERED_PLAY, seed);
    expect(retro.waste.factor).toBe('context');
    expect(retro.waste.title).toBe(ja.retro.context);
  });

  it('必要な資料だけを渡せば、Context は最大の無駄にならない', () => {
    const { retro } = retroOf({ ...CLUTTERED_PLAY, feed: { mode: 'router' } }, 'retro-1');
    expect(retro.waste.factor).not.toBe('context');
  });

  it('「次に改善できる場所」は、最も時間のかかった工程を指す', () => {
    const { state, retro } = retroOf(EVAL_PLAY, 'retro-1');
    const slowest = stageTimes(state, EVAL_PLAY.projectId).sort((a, b) => b.minutes - a.minutes)[0];
    if (!slowest) throw new Error('工程がない');
    expect(retro.next.title).toBe(bottleneckName(slowest.ref));
  });

  it('改善のない構成（人間だけ）では、改善のカードは「これから」の案内になる', () => {
    const { retro } = retroOf({ projectId: 'corporateSite', mode: 'human' }, 'retro-1');
    expect(retro.best.factor).toBeNull();
    expect(retro.best.title).toBe(ja.retro.noGainTitle);
  });
});
