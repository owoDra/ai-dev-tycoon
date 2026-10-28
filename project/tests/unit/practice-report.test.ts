import { describe, expect, it } from 'vitest';
import { weeklyAnalytics } from '../../src/content/practice/index';
import { estimatePractice } from '../../src/core/practice';
import {
  practicePremise,
  practiceReport,
  roiFormula,
  stepFormulas,
  stepQuality,
  stepSuccess,
} from '../../src/view/practice';

const job = weeklyAnalytics.job;
const e = estimatePractice(job);

describe('コピーする報告に前提と式を含める（Phase 27）', () => {
  it('前提：自分の速さ・1人日・年の回数・人件費・お願いの遵守率・モデルの性能と単価', () => {
    expect(practicePremise(job).map((p) => p.key)).toEqual([
      'skill',
      'personDay',
      'runs',
      'wage',
      'compliance',
      'model',
    ]);
    for (const format of ['text', 'markdown'] as const) {
      const r = practiceReport(job, e, format);
      expect(r).toContain('前提');
      expect(r).toContain('自分の速さ：1');
      expect(r).toContain('1人日：480分');
      expect(r).toContain('年の回数：52');
      expect(r).toContain('人件費（円/人日）：32,000円');
      expect(r).toContain('お願いの遵守率：50%');
      expect(r).toContain('ソネ太：性能 0.95・速さ 24倍・40円/分');
    }
    expect(
      practiceReport({ ...job, runsPerYear: 48 }, estimatePractice({ ...job, runsPerYear: 48 }), 'text'),
    ).toContain('年の回数：48');
  });

  it('工程ごとの式（人間の時間・AI の時間・費用・成功率・品質）を、実際の値を入れて含める', () => {
    const step = job.steps[0] as (typeof job.steps)[number];
    const est = e.steps[0] as (typeof e.steps)[number];
    const fetch = [...stepFormulas(step, est), stepSuccess(step, est), stepQuality(est)];
    expect(fetch).toEqual([
      '人間の時間 = 指示（20分 × 5% = 1.0分） = 1.0分',
      'AI の時間 = 作業（20分 × 100% ÷ 24.0倍速 × 1.01（MCP の選び間違い） = 0.8分） = 0.8分',
      'AI の費用 = 0.8分 × 42円/分 = 36円',
      'AI 適性「高い（定型）」→ 1回で成功 85%',
      'レビューなし → 見逃し 15% → 品質 93%',
    ]);
    const text = practiceReport(job, e, 'text');
    for (const line of fetch) expect(text).toContain(line);
    expect(text).toContain('前の工程から AI が続けて作業するので、指示も要らない');
    expect(text).toContain('Eval → 見逃し');
    expect(text).toContain('人間の時間 = 自分の作業（14分 × 100% = 14.0分） = 14.0分');
  });

  it('年間の削減額と ROI の式を含める', () => {
    const md = practiceReport(job, e, 'markdown');
    expect(md).toContain('- 年間の削減額：364,000円（91.0h ÷ 8.0h × 32,000円/人日）');
    expect(roiFormula(e)).toMatch(/^\(364,000円 − [\d,]+円\) ÷ [\d,]+円 = 38\d%$/);
    expect(md).toContain(`ROI の式：(削減額 − AI の追加コスト) ÷ AI の追加コスト = ${roiFormula(e)}`);
    expect(md).toContain('### 工程の内訳と式');
    const human = { ...job, steps: job.steps.map((s) => ({ ...s, mode: 'human' as const })) };
    expect(roiFormula(estimatePractice(human))).toBeNull();
  });
});
