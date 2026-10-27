import { describe, expect, it } from 'vitest';
import { weeklyAnalytics } from '../../src/content/practice/index';
import type { PracticeJobInput, PracticeStepInput } from '../../src/content/types';
import { reduce } from '../../src/core/commands';
import { harnessModifiers } from '../../src/core/harness';
import {
  applyToStep,
  estimatePractice,
  newPracticeStep,
  parsePracticeJob,
  practiceTask,
  stepMode,
  stepSetup,
} from '../../src/core/practice';
import { createInitialState } from '../../src/core/state';
import { applyPracticeCommand, practiceForecast, practiceHarness, practiceReport } from '../../src/view/practice';

const job = weeklyAnalytics.job;

describe('実務モードの試算（core/practice.ts）', () => {
  it('週次アクセス解析のテンプレート：人間時間が 120分 → 15分前後になる（企画書24章）', () => {
    const e = estimatePractice(job);
    expect(e.beforeMinutes).toBe(120);
    expect(e.afterMinutes).toBeGreaterThanOrEqual(12);
    expect(e.afterMinutes).toBeLessThanOrEqual(18);
    // データ取得の指示出し（20分 × 指示出しの割合 5%）と、人間に残した承認（14分）だけが残る
    expect(e.afterMinutes).toBeCloseTo(20 * 0.05 + 14, 6);
    expect(e.reduction).toBeCloseTo(1 - 15 / 120, 6);
  });

  it('週次アクセス解析のテンプレート：年間の削減時間と ROI が手計算と一致する', () => {
    const e = estimatePractice(job);
    // 毎週 = 年 52 回。(120 − 15) 分 × 52 回 ÷ 60 = 91 h
    expect(e.runsPerYear).toBe(52);
    expect(e.annualSavedHours).toBeCloseTo(91, 6);
    expect(e.annualBeforeHours).toBeCloseTo(104, 6);
    expect(e.annualAfterHours).toBeCloseTo(13, 6);
    // 削減額 = 91 h × 時給 4,000 円 = 364,000 円
    expect(e.annualLaborSaved).toBeCloseTo(364_000, 3);
    // 導入コスト = Analytics 5,000 + Research 10,000 + Report 30,000 + 受け入れ基準 20,000（Analytics は2工程で使うが1回だけ）
    expect(e.installCost).toBe(65_000);
    // AI の費用（1回）：AI の作業は合計 約4.4分（標準モデルは人間の 24 倍速）× 1分 約42〜46円（部品のランニングコスト込み）≒ 188円
    expect(e.aiCostPerRun).toBeGreaterThan(150);
    expect(e.aiCostPerRun).toBeLessThan(230);
    // 1年目の追加コスト = 188 × 52 + 65,000 ≒ 74,776 円 → ROI = (364,000 − 74,776) ÷ 74,776 ≒ 3.87（387%）
    expect(e.aiExtraCost).toBeCloseTo(e.aiCostPerRun * 52 + 65_000, 6);
    expect(e.roi).toBeCloseTo(3.87, 1);
    expect(e.roi).toBeCloseTo((364_000 - e.aiExtraCost) / e.aiExtraCost, 9);
    // 人時あたりの利益：改善前 (30,000 − 2h × 4,000) ÷ 2h = 11,000 円/h
    expect(e.profitPerHumanHour.before).toBeCloseTo(11_000, 6);
    expect(e.profitPerHumanHour.after ?? 0).toBeGreaterThan(100_000);
  });

  it('ゲームの AI Worker と同じ modifier の定義で補正する（計算式を二重に持たない）', () => {
    for (const [i, step] of job.steps.entries()) {
      let state = reduce(createInitialState('practice'), {
        type: 'SetModel',
        workerId: 'agent',
        modelId: step.modelId,
      }).state;
      for (const partId of step.parts) state = reduce(state, { type: 'EquipPart', workerId: 'agent', partId }).state;
      const task = practiceTask(step, i);
      expect(stepSetup(step, task).mods).toEqual(harnessModifiers(state, 'agent', task, { expected: true }));
    }
  });

  it('人間だけの業務は改善前と同じで、追加コストがないので ROI は出さない', () => {
    const human: PracticeJobInput = { ...job, steps: job.steps.map((s) => ({ ...s, mode: 'human' })) };
    const e = estimatePractice(human);
    expect(e.afterMinutes).toBeCloseTo(e.beforeMinutes, 9);
    expect(e.aiExtraCost).toBe(0);
    expect(e.roi).toBeNull();
    expect(estimatePractice({ ...job, steps: [] }).profitPerHumanHour).toEqual({ before: null, after: null });
  });

  it('Agent Workflow が続く工程は、ゲームと同じく2つ目から指示出しを省く', () => {
    expect(stepMode(job, 0).steps.some((s) => s.phase === 'instruct')).toBe(true);
    expect(stepMode(job, 1).steps.some((s) => s.phase === 'instruct')).toBe(false);
    const split: PracticeJobInput = {
      ...job,
      steps: [job.steps[0], job.steps[3], job.steps[1]] as PracticeStepInput[],
    };
    expect(stepMode(split, 2).steps.some((s) => s.phase === 'instruct')).toBe(true);
  });

  it('頻度で年間の回数が変わる', () => {
    expect(estimatePractice({ ...job, frequency: 'daily' }).runsPerYear).toBe(240);
    expect(estimatePractice({ ...job, frequency: 'monthly' }).annualSavedHours).toBeCloseTo((105 * 12) / 60, 6);
  });
});

describe('実務モードの Harness Builder（ゲームと共通の UI）', () => {
  it('選択肢の Command で工程の部品と Model が変わり、Before → After が出る', () => {
    const view = practiceHarness(job, 3);
    const model = view?.rows.find((r) => r.id === 'model');
    expect(view?.rows.map((r) => r.id)).toEqual([
      'model',
      'context',
      'tools',
      'automation',
      'validation',
      'permissions',
      'split',
    ]);
    // 実務モードには案件の資料がないので、資料の渡し方と Context Router は出さない
    const contextIds = view?.rows.find((r) => r.id === 'context')?.groups.flatMap((g) => g.options.map((o) => o.id));
    expect(contextIds).not.toContain('contextRouter');
    const frontier = model?.groups[0]?.options.find((o) => o.id === 'frontier')?.command;
    if (!frontier) throw new Error('Model の選択肢がない');
    expect(applyPracticeCommand(job, 3, frontier).steps[3]?.modelId).toBe('frontier');

    const evalOption = view?.rows
      .find((r) => r.id === 'validation')
      ?.groups[0]?.options.find((o) => o.id === 'evalAcceptance');
    const aiJob = {
      ...job,
      steps: job.steps.map((s, i) => (i === 3 ? { ...s, mode: 'aiThenHumanReview' as const } : s)),
    };
    const f = practiceForecast(aiJob, 3, evalOption?.command ?? null);
    expect(f.after.humanMinutes).toBeLessThan(f.before.humanMinutes);
  });

  it('同じ group の部品は付け替える（ゲームの equipPart と同じ）', () => {
    const step = newPracticeStep('x');
    const a = applyToStep(step, { type: 'EquipPart', workerId: 'practice:0', partId: 'requestFormatter' });
    const b = applyToStep(a, { type: 'EquipPart', workerId: 'practice:0', partId: 'hookFormatter' });
    expect(b.parts).toEqual(['hookFormatter']);
    expect(applyToStep(b, { type: 'RemovePart', workerId: 'practice:0', partId: 'hookFormatter' }).parts).toEqual([]);
  });
});

describe('実務モードの入力の保存と結果のコピー', () => {
  it('保存した入力（JSON）を読み直すと同じになり、壊れた値は拒む', () => {
    expect(parsePracticeJob(JSON.parse(JSON.stringify(job)))).toEqual(job);
    expect(parsePracticeJob(null)).toBeNull();
    expect(parsePracticeJob({ ...job, frequency: 'hourly' })).toBeNull();
    expect(parsePracticeJob({ ...job, steps: [{ ...job.steps[0], mode: 'magic' }] })).toBeNull();
    const tooMany = parsePracticeJob({ ...job, steps: Array.from({ length: 20 }, () => job.steps[0]) });
    expect(tooMany?.steps).toHaveLength(8);
    const unknownPart = parsePracticeJob({ ...job, steps: [{ ...job.steps[0], parts: ['toolGit', 'nope'] }] });
    expect(unknownPart?.steps[0]?.parts).toEqual(['toolGit']);
  });

  it('結果は数字が主役の「2.0h → 0.3h / −88%」で、テキストと Markdown でコピーできる', () => {
    const e = estimatePractice(job);
    const text = practiceReport(job, e, 'text');
    expect(text).toContain('2.0h → 0.3h / −88%');
    expect(text).toContain('年間の削減時間：91.0h');
    expect(text).toContain('ROI：387%');
    const md = practiceReport(job, e, 'markdown');
    expect(md.split('\n')[0]).toBe('## 週次アクセス解析 の改善試算');
    expect(md).toContain('| データ取得 | Agent Workflow | 20分 | 1分 |');
  });
});
