import { getAssignMode } from '../content/assignModes';
import { balance } from '../content/balance';
import { content } from '../content/index';
import type { PracticeJobInput, PracticeStepInput } from '../content/types';
import type { Command } from '../core/commands';
import type { WorkerExpectation } from '../core/expectation';
import {
  applyToStep,
  estimatePractice,
  type PracticeEstimate,
  type PracticeStepEstimate,
  practiceRunsPerYear,
  usesAi,
} from '../core/practice';
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

/** 試算をコピー用の文書にする。text はチャットに貼る箇条書き、markdown は表付き。前提と工程ごとの式も含め、社内で根拠を説明できるようにする */
export function practiceReport(job: PracticeJobInput, e: PracticeEstimate, format: 'text' | 'markdown'): string {
  const r = t.report;
  const h = practiceHeadline(e);
  const roiText = roiFormula(e);
  const lines = [
    r.humanTime(h.before, h.after, h.rate),
    r.annual(t.hours(e.annualBeforeHours), t.hours(e.annualAfterHours)),
    r.saved(t.hours(e.annualSavedHours)),
    r.savedYen(`${t.yen(e.annualLaborSaved)}（${savedYenDetail(job, e)}）`),
    r.aiCost(t.yen(e.aiExtraCost)),
    r.roi(formatRoi(e.roi)),
    ...(roiText ? [r.roiFormula(roiText)] : []),
    r.profit(perHour(e.profitPerPersonDay.before), perHour(e.profitPerPersonDay.after)),
  ];
  const premise = practicePremise(job).map((p) => r.premiseItem(p.label, p.value));
  const steps = job.steps.map((s, i) => {
    const est = e.steps[i];
    return {
      name: s.name,
      mode: getAssignMode(s.mode).name,
      before: t.minutes(s.minutes),
      after: t.minutes(est?.afterMinutes ?? s.minutes),
      formulas: est ? [...stepFormulas(s, est), stepSuccess(s, est), stepQuality(est)] : [],
    };
  });
  if (format === 'text') {
    return [
      r.heading(job.name),
      ...lines.map((l) => `・${l}`),
      `${r.steps}：`,
      ...steps.map((s) => `・${r.step(s.name, s.mode, s.before, s.after)}`),
      `${r.premise}：`,
      ...premise.map((p) => `・${p}`),
      `${r.breakdown}：`,
      ...steps.flatMap((s) => [`・${s.name}`, ...s.formulas.map((f) => `　${f}`)]),
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
    '',
    `### ${r.premise}`,
    '',
    ...premise.map((p) => `- ${p}`),
    '',
    `### ${r.breakdown}`,
    '',
    ...steps.flatMap((s) => [`- ${s.name}`, ...s.formulas.map((f) => `  - ${f}`)]),
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

const x = t.explain;
const pct = (v: number) => t.percent(v);

/** 内訳のバーの1区間 */
export interface BreakdownSegment {
  readonly key: 'instruct' | 'work' | 'review' | 'rework' | 'aiWork' | 'verify' | 'repair';
  readonly label: string;
  readonly minutes: number;
}

/** 工程の内訳（バー）。人間は指示・自分の作業・レビュー・手戻りの見込み、AI は作業・検証・修正。0分の区間は除く */
export function stepBreakdown(s: PracticeStepEstimate): { human: BreakdownSegment[]; ai: BreakdownSegment[] } {
  const kinds = ['instruct', 'work', 'review', 'rework'] as const;
  const human = kinds.map((key) => ({
    key,
    label: x.parts[key],
    minutes: s.human.filter((h) => h.kind === key).reduce((sum, h) => sum + h.minutes, 0),
  }));
  const ai: BreakdownSegment[] = [
    { key: 'aiWork', label: x.parts.aiWork, minutes: s.ai.work },
    { key: 'verify', label: x.parts.verify, minutes: s.ai.verify },
    { key: 'repair', label: x.parts.repair, minutes: s.ai.repair },
  ];
  return { human: human.filter((h) => h.minutes > 0), ai: ai.filter((a) => a.minutes > 0) };
}

const checksLabel = (s: PracticeStepEstimate) =>
  s.checks.length === 0 ? x.noCheck : s.checks.map((c) => x.checks[c]).join(x.checkJoin);

/**
 * 「なぜこの数字？」：工程の見込みを、実際の値を入れた式にする（式そのものは core/formulas.ts の modeOutcome と core/practice.ts）。
 * 人間の時間・AI の時間・AI の費用の順（成功率と品質は stepSuccess・stepQuality）
 */
export function stepFormulas(step: PracticeStepInput, s: PracticeStepEstimate): string[] {
  const base = t.minutes(step.minutes);
  const terms = s.human.map((h) =>
    x.humanTerm(
      x.parts[h.kind],
      base,
      pct(h.share),
      `${h.factor === 1 ? '' : x.factor(h.factor)}${h.chance === 1 ? '' : x.chance(pct(h.chance))}`,
      x.min(h.minutes),
    ),
  );
  const lines = [
    terms.length > 0 ? x.humanTime(terms.join(' + '), x.min(s.afterMinutes)) : x.humanNone(x.min(s.afterMinutes)),
  ];
  if (s.chained) lines.push(x.chained);
  const w = s.aiWork;
  if (w) {
    const rest = s.ai.verify + s.ai.repair > 0 ? x.aiRest(x.min(s.ai.verify), x.min(s.ai.repair)) : '';
    const miss = w.toolMiss === 1 ? '' : x.toolMiss(w.toolMiss);
    lines.push(x.aiTime(base, pct(w.share), w.speed, miss, x.min(s.ai.work), rest, x.min(s.aiMinutes)));
    lines.push(x.aiCost(x.min(s.aiMinutes), w.costPerMinute, t.yen(s.aiCost)));
  }
  return lines;
}

/** 選んだ AI 適性で、1回で成功する確率（AI が関わらない工程は本人の作業） */
export function stepSuccess(step: PracticeStepInput, s: PracticeStepEstimate): string {
  const aptitude = t.steps.aptitudes[step.aptitude];
  return s.aiWork ? x.success(aptitude, pct(s.success)) : x.successHuman(aptitude, pct(s.success));
}

/** 時間を減らした代償（「レビューなし → 見逃し 12% → 品質 88%」） */
export function stepQuality(s: PracticeStepEstimate): string {
  return x.quality(checksLabel(s), pct(s.pEscape), pct(s.quality));
}

/** 前提のカードの1行 */
export interface PremiseItem {
  readonly key: 'skill' | 'personDay' | 'runs' | 'wage' | 'compliance' | 'model';
  readonly label: string;
  readonly value: string;
}

/** 前提（自分の速さ・1人日・年の回数・人件費・お願いの遵守率・使うモデルの性能と単価） */
export function practicePremise(job: PracticeJobInput): PremiseItem[] {
  const p = t.premise;
  const models = content.models.filter((m) => job.steps.some((s) => usesAi(s) && s.modelId === m.id));
  return [
    { key: 'skill', label: p.skill, value: p.skillValue },
    { key: 'personDay', label: p.personDay, value: p.personDayValue(balance.project.minutesPerPersonDay) },
    { key: 'runs', label: p.runs, value: `${practiceRunsPerYear(job)}` },
    { key: 'wage', label: p.wage, value: t.yen(job.dailyWage) },
    { key: 'compliance', label: p.compliance, value: pct(balance.harness.requestCompliance) },
    ...models.map((m) => ({
      key: 'model' as const,
      label: p.models,
      value: p.model(m.name, m.capability, m.speed, m.costPerMinute),
    })),
  ];
}

/** ROI の式（(削減額 − AI の追加コスト) ÷ AI の追加コスト）。追加コストがなければ null */
export function roiFormula(e: PracticeEstimate): string | null {
  return e.roi === null ? null : t.result.roiFormula(t.yen(e.annualLaborSaved), t.yen(e.aiExtraCost), formatRoi(e.roi));
}

/** 年間の削減額の式（削減時間 ÷ 1人日 × 人件費） */
export function savedYenDetail(job: PracticeJobInput, e: PracticeEstimate): string {
  return t.result.savedYenDetail(
    t.hours(e.annualSavedHours),
    t.hours(balance.project.minutesPerPersonDay / MINUTES_PER_HOUR),
    t.yenPerPersonDay(job.dailyWage),
  );
}
