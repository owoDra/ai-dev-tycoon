import { describe, expect, it } from 'vitest';
import { content } from '../../src/content/index';
import { practiceAptitudeOrder, weeklyAnalytics } from '../../src/content/practice/index';
import type { PracticeJobInput, PracticeStepInput } from '../../src/content/types';
import { reduce } from '../../src/core/commands';
import { harnessModifiers } from '../../src/core/harness';
import {
  applyToStep,
  estimatePractice,
  newPracticeStep,
  parsePracticeJob,
  practiceRunsPerYear,
  practiceTask,
  stepMode,
  stepSetup,
} from '../../src/core/practice';
import { createInitialState } from '../../src/core/state';
import {
  applyPracticeCommand,
  practiceForecast,
  practiceHarness,
  practiceReport,
  stepBreakdown,
} from '../../src/view/practice';

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
    // 削減額 = 91 h（= 11.375 人日）× 人件費 32,000 円/人日 = 364,000 円
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
    // 人日あたりの利益：改善前は 120 分 = 0.25 人日。(30,000 − 0.25 人日 × 32,000) ÷ 0.25 人日 = 88,000 円/人日
    expect(e.profitPerPersonDay.before).toBeCloseTo(88_000, 6);
    expect(e.profitPerPersonDay.after ?? 0).toBeGreaterThan(800_000);
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
    expect(estimatePractice({ ...job, steps: [] }).profitPerPersonDay).toEqual({ before: null, after: null });
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
      'hook:SessionStart',
      'receive',
      'skill',
      'hook:PreToolUse',
      'tools',
      'split',
      'hook:PostToolUse',
      'validation',
      'hook:Stop',
      'mod',
      'permissions',
      'routine',
    ]);
    // 実務モードには案件の資料がないので、資料の渡し方と Context Router は出さない
    const contextIds = view?.rows.find((r) => r.id === 'receive')?.groups.flatMap((g) => g.options.map((o) => o.id));
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
    // Phase 18 より前の保存（時給）は、1営業日（8時間）分の人件費として読む
    const { dailyWage: _w, ...legacy } = job;
    expect(parsePracticeJob({ ...legacy, hourlyWage: 4000 })?.dailyWage).toBe(32_000);
    expect(parsePracticeJob({ ...job, frequency: 'hourly' })).toBeNull();
    expect(parsePracticeJob({ ...job, steps: [{ ...job.steps[0], mode: 'magic' }] })).toBeNull();
    const tooMany = parsePracticeJob({ ...job, steps: Array.from({ length: 20 }, () => job.steps[0]) });
    expect(tooMany?.steps).toHaveLength(8);
    const unknownPart = parsePracticeJob({ ...job, steps: [{ ...job.steps[0], parts: ['mcpGit', 'nope'] }] });
    expect(unknownPart?.steps[0]?.parts).toEqual(['mcpGit']);
  });

  it('結果は数字が主役の「2.0h → 0.3h / −88%」で、テキストと Markdown でコピーできる', () => {
    const e = estimatePractice(job);
    const text = practiceReport(job, e, 'text');
    expect(text).toContain('2.0h → 0.3h / −88%');
    expect(text).toContain('年間の削減時間：91.0h');
    expect(text).toContain('ROI：386%');
    const md = practiceReport(job, e, 'markdown');
    expect(md.split('\n')[0]).toBe('## 週次アクセス解析 の改善試算');
    expect(md).toContain('| データ取得 | Agent Workflow | 20分 | 1分 |');
  });
});

describe('工程の内訳（Phase 27：計算の根拠を見せる）', () => {
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

  it('どの担当・AI 適性・部品でも、人間の内訳の合計が「改善後」、AI の内訳の合計が AI の時間と一致する', () => {
    for (const mode of content.assignModes) {
      for (const aptitude of practiceAptitudeOrder) {
        for (const parts of [[], ['evalAcceptance', 'requestFormatter'], ['skillReport', 'mcpAnalytics']]) {
          const steps = job.steps.map((s) => ({ ...s, mode: mode.id, aptitude, parts }));
          const e = estimatePractice({ ...job, steps });
          for (const s of e.steps) {
            expect(sum(s.human.map((h) => h.minutes))).toBeCloseTo(s.afterMinutes, 9);
            expect(s.ai.work + s.ai.verify + s.ai.repair).toBeCloseTo(s.aiMinutes, 9);
            const bar = stepBreakdown(s);
            expect(sum(bar.human.map((b) => b.minutes))).toBeCloseTo(s.afterMinutes, 9);
            expect(sum(bar.ai.map((b) => b.minutes))).toBeCloseTo(s.aiMinutes, 9);
            // 内訳の1項目は「今の時間 × 割合 × Harness の補正 × 起こる確率」（本人の速さは 1）
            for (const h of s.human) expect(h.minutes).toBeCloseTo(s.beforeMinutes * h.share * h.factor * h.chance, 9);
          }
          expect(sum(e.steps.map((s) => s.afterMinutes))).toBeCloseTo(e.afterMinutes, 9);
        }
      }
    }
  });

  it('週次アクセス解析のテンプレート：各工程の内訳の値', () => {
    const [fetch, analysis, report, approval] = estimatePractice(job).steps;
    // データ取得：指示（20分 × 5% = 1分）だけが人間に残り、AI が 20分 ÷ 24倍速 × MCP の選び間違い 1.0144 ≒ 0.85分で作業する
    expect(fetch?.human).toEqual([{ kind: 'instruct', share: 0.05, factor: 1, chance: 1, minutes: 1 }]);
    expect(fetch?.ai.work).toBeCloseTo((20 / 24) * 1.0144, 9);
    expect(fetch?.aiWork).toMatchObject({ share: 1, speed: 24, costPerMinute: 42 });
    expect(fetch?.chained).toBe(false);
    expect(fetch?.checks).toEqual([]);
    // 集計・分析：前の工程から Agent Workflow が続くので指示もなく、人間の時間は 0
    expect(analysis?.human).toEqual([]);
    expect(analysis?.chained).toBe(true);
    // レポート作成：Eval（受け入れ基準）が検証し、見つけた失敗を AI が直す
    expect(report?.human).toEqual([]);
    expect(report?.ai.work).toBeCloseTo(46 / 24, 9);
    expect(report?.ai.verify).toBeGreaterThan(0);
    expect(report?.ai.repair).toBeGreaterThan(0);
    expect(report?.checks).toEqual(['eval']);
    // 承認・共有：人間だけ（自分の作業 14分）。AI は関わらない
    expect(approval?.human).toEqual([{ kind: 'work', share: 1, factor: 1, chance: 1, minutes: 14 }]);
    expect(approval?.aiWork).toBeNull();
    expect(approval?.aiMinutes).toBe(0);
  });

  it('AI 適性が高いほど成功率が上がり、見逃しが減って品質が上がる', () => {
    const at = (aptitude: 'high' | 'mid' | 'low') =>
      estimatePractice({ ...job, steps: [{ ...job.steps[0], aptitude } as PracticeStepInput] }).steps[0];
    const [high, mid, low] = [at('high'), at('mid'), at('low')];
    expect(high?.success).toBeGreaterThan(mid?.success ?? 1);
    expect(mid?.success).toBeGreaterThan(low?.success ?? 1);
    expect(high?.pEscape).toBeLessThan(low?.pEscape ?? 0);
    expect(high?.quality).toBeGreaterThan(low?.quality ?? 1);
    // レビューのない AI だけの担当は、失敗がそのまま見逃しになる
    expect(high?.pEscape).toBeCloseTo(1 - (high?.success ?? 0), 9);
  });

  it('人間のレビューは時間（レビューと手戻り）と引き換えに見逃しを 0 にする', () => {
    const step = { ...job.steps[2], mode: 'aiThenHumanReview', parts: [] } as PracticeStepInput;
    const s = estimatePractice({ ...job, steps: [step] }).steps[0];
    expect(s?.human.map((h) => h.kind)).toEqual(['instruct', 'review', 'rework']);
    expect(s?.human[2]?.chance).toBeCloseTo(1 - (s?.success ?? 0), 9);
    expect(s?.pEscape).toBeCloseTo(0, 9);
    expect(s?.quality).toBeCloseTo(1, 9);
    expect(s?.checks).toEqual(['humanReview']);
  });

  it('年の回数は入力で変えられ、保存した値も読み直せる', () => {
    expect(practiceRunsPerYear(job)).toBe(52);
    const custom = { ...job, runsPerYear: 48 };
    expect(estimatePractice(custom).annualSavedHours).toBeCloseTo((105 * 48) / 60, 6);
    expect(parsePracticeJob(JSON.parse(JSON.stringify(custom)))?.runsPerYear).toBe(48);
    expect(parsePracticeJob({ ...job, runsPerYear: 1e9 })?.runsPerYear).toBe(5000);
    expect(parsePracticeJob({ ...job, runsPerYear: 'x' })).toBeNull();
  });
});
