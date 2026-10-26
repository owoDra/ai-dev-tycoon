import { describe, expect, it } from 'vitest';
import { getProject } from '../../src/content/index';
import { reduce } from '../../src/core/commands';
import { deadlineMinutes, escapedDefectCost } from '../../src/core/formulas';
import { scoreProject } from '../../src/core/scoring';
import { createInitialState, type GameState, updateTask } from '../../src/core/state';
import { MINUTES_PER_HOUR } from '../../src/core/units';
import { playProject, strategies } from '../helpers/strategies';

const P = 'ecRenewal';
const def = getProject(P);

describe('scoreProject', () => {
  it('未開始の案件は null', () => {
    expect(scoreProject(createInitialState('s'), P)).toBeNull();
  });

  it('利益は売上から人件費・AI費用・手戻り・遅延損失を引いたもので、Profit / Human Hour はそれを人間の時間で割る', () => {
    const { score } = playProject(P, strategies.smart(P), 'score');
    expect(score.completed).toBe(true);
    expect(score.revenue).toBe(def.revenue);
    expect(score.profit).toBeCloseTo(
      score.revenue - score.laborCost - score.aiCost - score.reworkCost - score.delayLoss,
    );
    expect(score.profitPerHumanHour).toBeCloseTo(score.profit / (score.humanMinutes / MINUTES_PER_HOUR));
    expect(score.humanIntervention).toBeGreaterThan(0);
    expect(score.humanIntervention).toBeLessThanOrEqual(score.humanMinutes);
    expect(score.autonomousTime).toBeGreaterThan(0);
    expect(score.aiCostPerWork).toBeGreaterThan(0);
  });

  it('人間だけなら介入も自律時間も AI 費用も 0', () => {
    const { score } = playProject(P, strategies.allHuman(P), 'human');
    expect(score.humanIntervention).toBe(0);
    expect(score.autonomousTime).toBe(0);
    expect(score.aiCost).toBe(0);
    expect(score.aiCostPerWork).toBe(0);
  });

  it('納品前は売上 0、納期を過ぎると遅延損失が出る', () => {
    const started = reduce(createInitialState('s'), { type: 'StartProject', projectId: P }).state;
    const late: GameState = { ...started, clock: deadlineMinutes(def) * 2 };
    const score = scoreProject(late, P);
    expect(score?.revenue).toBe(0);
    expect(score?.delayLoss).toBeGreaterThan(0);
    expect(score?.profitPerHumanHour).toBe(0);
  });

  it('見逃した失敗は、損害と納品後の修正時間（人間の稼働）として数え、品質と Rework Rate に表れる', () => {
    const started = reduce(createInitialState('s'), { type: 'StartProject', projectId: P }).state;
    const done = (escaped: boolean) =>
      def.tasks.reduce(
        (s, t) =>
          updateTask(s, P, t.id, (r) => ({
            ...r,
            status: 'done',
            quality: escaped && t.id === 'qa' ? 0.5 : 1,
            escaped: escaped && t.id === 'qa',
          })),
        started,
      );
    const clean = scoreProject(done(false), P);
    const dirty = scoreProject(done(true), P);
    const qa = def.tasks.find((t) => t.id === 'qa');
    if (!qa) throw new Error('QA がない');
    expect(clean?.reworkCost).toBe(0);
    expect(dirty?.reworkCost).toBeGreaterThan(escapedDefectCost(qa));
    expect(dirty?.aftercareMinutes).toBeGreaterThan(0);
    expect(dirty?.humanMinutes).toBe(dirty?.aftercareMinutes);
    expect(dirty?.quality).toBeLessThan(clean?.quality ?? 0);
    expect(dirty?.reworkRate).toBeCloseTo(1 / def.tasks.length);
  });
});
