import { getAssignMode } from '../content/assignModes';
import { balance } from '../content/balance';
import type { PracticeJobInput } from '../content/types';
import type { Command } from '../core/commands';
import type { WorkerExpectation } from '../core/expectation';
import { applyToStep, estimatePractice, type PracticeEstimate } from '../core/practice';
import { MINUTES_PER_HOUR } from '../core/units';
import { ja } from '../i18n/ja';
import { type HarnessForecast, type HarnessView, harnessCard } from './harness';

/*
 * 実務モード（企画書24章）の表示用データ（純粋関数）。工程の Harness Builder は、ゲームと同じ harnessCard で作る
 * （実務モードでは、すべての部品を選べ、案件の資料がないので資料の渡し方と Context Router は出さない）。
 */

const t = ja.practice;

/** 実務モードの Harness Builder の選択肢の宛先（Command の workerId。工程の番号で区別する） */
export const practiceWorkerId = (index: number) => `practice:${index}`;

/** 工程の Harness Builder のカード */
export function practiceHarness(job: PracticeJobInput, index: number): HarnessView | null {
  const step = job.steps[index];
  if (!step) return null;
  return harnessCard(
    {
      workerId: practiceWorkerId(index),
      modelId: step.modelId,
      equipped: step.parts,
      isUnlocked: () => true,
      owned: () => false,
      feed: null,
    },
    step.name,
  );
}

/** Harness Builder の選択肢の Command を、工程の入力に適用する */
export function applyPracticeCommand(job: PracticeJobInput, index: number, command: Command): PracticeJobInput {
  const step = job.steps[index];
  if (!step) return job;
  const next = applyToStep(step, command);
  return next === step ? job : { ...job, steps: job.steps.map((s, i) => (i === index ? next : s)) };
}

/** 業務1回の見込みを、Harness Builder の Before → After と同じ4つの値にする */
export function practiceExpectation(e: PracticeEstimate): WorkerExpectation {
  return { humanMinutes: e.afterMinutes, aiCost: e.aiCostPerRun, quality: e.quality, autonomyMinutes: e.aiMinutes };
}

/** 選択肢を確定した場合の、業務1回の Before → After */
export function practiceForecast(job: PracticeJobInput, index: number, command: Command | null): HarnessForecast {
  const before = practiceExpectation(estimatePractice(job));
  if (!command) return { before, after: before };
  return { before, after: practiceExpectation(estimatePractice(applyPracticeCommand(job, index, command))) };
}

/** 数字を主役にした見出し（「8.4h → 1.7h / −80%」） */
export interface PracticeHeadline {
  readonly before: string;
  readonly after: string;
  readonly rate: string;
}

const hours = (minutes: number) => t.hours(minutes / MINUTES_PER_HOUR);

export function practiceHeadline(e: PracticeEstimate): PracticeHeadline {
  return { before: hours(e.beforeMinutes), after: hours(e.afterMinutes), rate: t.result.reduction(e.reduction) };
}

export const formatRoi = (roi: number | null) => (roi === null ? t.result.roiNone : t.percent(roi));
const perHour = (v: number | null) => (v === null ? t.none : t.yenPerPersonDay(v));

/** 試算をコピー用の文書にする。text はチャットに貼る箇条書き、markdown は表付き */
export function practiceReport(job: PracticeJobInput, e: PracticeEstimate, format: 'text' | 'markdown'): string {
  const r = t.report;
  const h = practiceHeadline(e);
  const lines = [
    r.humanTime(h.before, h.after, h.rate),
    r.annual(t.hours(e.annualBeforeHours), t.hours(e.annualAfterHours)),
    r.saved(t.hours(e.annualSavedHours)),
    r.aiCost(t.yen(e.aiExtraCost)),
    r.roi(formatRoi(e.roi)),
    r.profit(perHour(e.profitPerPersonDay.before), perHour(e.profitPerPersonDay.after)),
  ];
  const steps = job.steps.map((s, i) => ({
    name: s.name,
    mode: getAssignMode(s.mode).name,
    before: t.minutes(s.minutes),
    after: t.minutes(e.steps[i]?.afterMinutes ?? s.minutes),
  }));
  if (format === 'text') {
    return [
      r.heading(job.name),
      ...lines.map((l) => `・${l}`),
      `${r.steps}：`,
      ...steps.map((s) => `・${r.step(s.name, s.mode, s.before, s.after)}`),
    ].join('\n');
  }
  return [
    `## ${r.heading(job.name)}`,
    '',
    ...lines.map((l) => `- ${l}`),
    '',
    `### ${r.steps}`,
    '',
    r.tableHead,
    r.tableRule,
    ...steps.map((s) => r.row(s.name, s.mode, s.before, s.after)),
  ].join('\n');
}

/** 白紙の業務 */
export function blankJob(): PracticeJobInput {
  return {
    name: '',
    frequency: 'weekly',
    dailyWage: balance.practice.dailyWage,
    valuePerRun: 0,
    steps: [],
  };
}
