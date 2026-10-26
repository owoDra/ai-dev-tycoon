import { describe, expect, it } from 'vitest';
import { findBottleneck } from '../../src/core/bottleneck';
import { compare, seeds } from '../helpers/compare';
import { playProject, type Strategy, type StrategyName, strategies } from '../helpers/strategies';

/** 企画書の設計意図（4〜5章・20章・22章）を、複数 seed の戦略シミュレーションで確かめる */
const P = 'ecRenewal';
const SEEDS = seeds(20);
const scoreOf = (name: StrategyName) => (seed: string) => playProject(P, strategies[name](P), seed).score;

/** 人間だけの配置から、実装だけを AI → 人間レビューに変えた戦略 */
const implementationByAi: Strategy = (state) =>
  strategies
    .allHuman(P)(state)
    .map((c) =>
      c.type === 'AssignTask' && c.taskId === 'implementation'
        ? { ...c, mode: 'aiThenHumanReview', workerId: 'agent' }
        : c,
    );

describe('バランスの基本（ECサイトリニューアル）', () => {
  it('AI 適性の高い Task だけ AI に任せる smart は、allHuman より Profit / Human Hour が高い（企画書22章）', () => {
    const r = compare({ smart: scoreOf('smart'), allHuman: scoreOf('allHuman') }, SEEDS);
    expect(r.smart.profitPerHumanHour).toBeGreaterThan(r.allHuman.profitPerHumanHour);
    expect(r.smart.humanMinutes).toBeLessThan(r.allHuman.humanMinutes);
  });

  it('レビューなしで AI に任せると、レビューありより品質が低い（企画書5章）', () => {
    const r = compare({ noReview: scoreOf('allAiNoReview'), withReview: scoreOf('aiWithReview') }, SEEDS);
    expect(r.noReview.quality).toBeLessThan(r.withReview.quality);
  });

  it('実装を AI 化すると、ボトルネックが実装から QA またはレビューへ移る（企画書20章）', () => {
    for (const seed of SEEDS) {
      const before = findBottleneck(playProject(P, strategies.allHuman(P), seed).state)?.ref;
      expect(before).toMatchObject({ kind: 'stage', taskId: 'implementation', stage: 'work' });

      const after = findBottleneck(playProject(P, implementationByAi, seed).state)?.ref;
      expect(after?.kind).toBe('stage');
      if (after?.kind !== 'stage') continue;
      expect(after.taskId === 'qa' || after.stage === 'review').toBe(true);
    }
  });
});
