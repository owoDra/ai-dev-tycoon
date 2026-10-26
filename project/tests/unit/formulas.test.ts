import { describe, expect, it } from 'vitest';
import { getAssignMode } from '../../src/content/assignModes';
import { balance } from '../../src/content/balance';
import { getModel } from '../../src/content/index';
import type { ModeStep, TaskDef } from '../../src/content/types';
import {
  type ActorProfile,
  aiCost,
  deadlineMinutes,
  delayLoss,
  escapedDefectCost,
  escapedQuality,
  expectedHumanMinutes,
  laborCost,
  reworkMinutes,
  stepMinutes,
  successProbability,
} from '../../src/core/formulas';

const task: TaskDef = {
  id: 't',
  name: 't',
  deps: [],
  effort: 120,
  difficulty: 0.5,
  aiAptitude: 0.5,
  qualityReq: 0.5,
  failRisk: 0.5,
  contextNeeds: [],
};
const model = getModel('standard');
const human: ActorProfile = { kind: 'human', skill: 1 };
const ai: ActorProfile = { kind: 'ai', model };
const grid = [0, 0.25, 0.5, 0.75, 1];
const work: ModeStep = { actor: 'human', phase: 'work', effortShare: 1 };

describe('successProbability', () => {
  it('難易度・品質要求・失敗リスクが上がると下がる（人間・AI とも）', () => {
    for (const actor of [human, ai]) {
      for (const key of ['difficulty', 'qualityReq', 'failRisk'] as const) {
        const ps = grid.map((v) => successProbability({ ...task, [key]: v }, actor));
        for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeLessThanOrEqual(ps[i - 1] as number);
        expect(ps.at(-1)).toBeLessThan(ps[0] as number);
      }
    }
  });

  it('AI 適性・Model の能力・人間の skill が上がると上がる', () => {
    const byApt = grid.map((v) => successProbability({ ...task, aiAptitude: v }, ai));
    const byCap = grid.map((v) => successProbability(task, { kind: 'ai', model: { ...model, capability: v } }));
    const bySkill = [0.5, 0.75, 1].map((v) => successProbability(task, { kind: 'human', skill: v }));
    for (const ps of [byApt, byCap, bySkill]) {
      for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeGreaterThanOrEqual(ps[i - 1] as number);
      expect(ps.at(-1)).toBeGreaterThan(ps[0] as number);
    }
  });

  it('どんな入力でも [min, max] に収まる', () => {
    for (const d of grid)
      for (const a of grid)
        for (const r of grid)
          for (const actor of [human, ai, { kind: 'ai', model: { ...model, capability: 0 } } as const]) {
            const p = successProbability({ ...task, difficulty: d, aiAptitude: a, failRisk: r, qualityReq: r }, actor);
            expect(p).toBeGreaterThanOrEqual(balance.success.min);
            expect(p).toBeLessThanOrEqual(balance.success.max);
          }
  });

  it('人間は AI より安定している（AI 適性が平均的な Task で）', () => {
    expect(successProbability(task, human)).toBeGreaterThan(successProbability(task, ai));
  });
});

describe('時間とコスト', () => {
  it('所要時間は作業量と割合に比例し、skill や速度に反比例する', () => {
    expect(stepMinutes(task, work, human)).toBe(120);
    expect(stepMinutes(task, { ...work, effortShare: 0.25 }, human)).toBe(30);
    expect(stepMinutes(task, work, { kind: 'human', skill: 2 })).toBe(60);
    expect(stepMinutes(task, { ...work, actor: 'ai' }, ai)).toBe(120 / model.speed);
    expect(stepMinutes(task, work, ai)).toBeLessThan(stepMinutes(task, work, human));
  });

  it('費用は時間に比例し、0 分なら 0 円', () => {
    expect(aiCost(0, model)).toBe(0);
    expect(aiCost(10, model)).toBe(10 * model.costPerMinute);
    expect(laborCost(0, 3000)).toBe(0);
    expect(laborCost(90, 3000)).toBe(4500);
  });

  it('手戻りは skill が高いほど短い', () => {
    expect(reworkMinutes(task, 2)).toBeLessThan(reworkMinutes(task, 1));
    expect(reworkMinutes(task, 1)).toBeGreaterThan(0);
  });

  it('人間の拘束時間：人間だけ > AI → レビュー > AI だけ > 0', () => {
    const h = (id: Parameters<typeof getAssignMode>[0]) => expectedHumanMinutes(task, getAssignMode(id), 1, model);
    expect(h('human')).toBe(task.effort);
    expect(h('human')).toBeGreaterThan(h('aiThenHumanReview'));
    expect(h('aiThenHumanReview')).toBeGreaterThan(h('ai'));
    expect(h('ai')).toBeGreaterThan(0);
  });
});

describe('品質と損失', () => {
  it('見逃した失敗の品質は 0〜1 で、品質要求が高いほど低い', () => {
    const qs = grid.map((v) => escapedQuality({ ...task, qualityReq: v }));
    for (const q of qs) expect(q).toBeGreaterThanOrEqual(0);
    for (const q of qs) expect(q).toBeLessThan(1);
    for (let i = 1; i < qs.length; i++) expect(qs[i]).toBeLessThan(qs[i - 1] as number);
  });

  it('見逃した失敗の損害は作業量と品質要求に比例する', () => {
    expect(escapedDefectCost({ ...task, qualityReq: 0 })).toBe(0);
    expect(escapedDefectCost({ ...task, effort: 240 })).toBe(2 * escapedDefectCost(task));
  });

  it('遅延損失は納期までは 0、超過に比例して増える', () => {
    const project = { id: 'p', name: 'p', revenue: 1_000_000, deadlineDays: 2, tasks: [task] };
    const deadline = deadlineMinutes(project);
    const day = balance.project.minutesPerBusinessDay;
    expect(delayLoss(deadline, project)).toBe(0);
    expect(delayLoss(deadline + day, project)).toBeCloseTo(project.revenue * balance.project.delayLossPerDay);
    expect(delayLoss(deadline + 2 * day, project)).toBeCloseTo(2 * delayLoss(deadline + day, project));
  });
});
