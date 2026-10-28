import { getAssignMode } from '../content/assignModes';
import { balance } from '../content/balance';
import { harnessPresets } from '../content/harness/guide';
import { migratePartIds } from '../content/harness/legacy';
import { content, getHarnessPart, getModel } from '../content/index';
import { practiceAptitudes } from '../content/practice/index';
import type { AssignModeDef, HarnessPartDef, PracticeJobInput, PracticeStepInput, TaskDef } from '../content/types';
import type { Command } from './commands';
import { type AiSetup, expectWithSetup, harnessSetup } from './expectation';
import { escapedQuality, laborCost, perPersonDay } from './formulas';
import { partsModel, partsModifiers, withPart } from './harness';
import { MINUTES_PER_HOUR } from './units';

/*
 * 実務モード（企画書24章）の試算。実際の業務の工程を Task とみなし、ゲームと同じ式で改善後の見込みを出す。
 * 部品の補正は core/harness.ts の partsModifiers・partsModel、1工程の見込みは core/expectation.ts の expectWithSetup を
 * そのまま使い、ここでは工程の並び（Agent Workflow の連鎖）と年間の換算・ROI だけを計算する。
 * 人間は入力した本人（熟練度 1）なので、人間だけで行う工程は入力した時間がそのまま見込みになる。
 */

/** 入力した本人の熟練度。人間だけの工程の見込みが、入力した時間と一致する */
const SELF_SKILL = 1;

/** 工程を Task にする。作業量は今の人間時間、性質は AI 適性の選択肢から決める */
export function practiceTask(step: PracticeStepInput, index: number): TaskDef {
  return {
    id: `step${index}`,
    name: step.name,
    kind: step.kind,
    deps: index > 0 ? [`step${index - 1}`] : [],
    effort: step.minutes,
    ...practiceAptitudes[step.aptitude],
  };
}

/** 工程の部品（存在しないものは除く） */
function stepParts(step: PracticeStepInput): HarnessPartDef[] {
  return step.parts.flatMap((id) => content.harnessParts.filter((p) => p.id === id));
}

/** 工程の AI の作業の条件。ゲームの AI Worker と同じく、お願いの部品は守られる確率で薄めた見込みにする */
export function stepSetup(step: PracticeStepInput, task: TaskDef): AiSetup {
  const parts = stepParts(step);
  const mods = partsModifiers(parts, task, { expected: true });
  return harnessSetup(mods, partsModel(getModel(step.modelId), parts, mods));
}

/**
 * 工程の担当モード。前の工程も連鎖するモード（Agent Workflow）なら、ゲームと同じく指示出しを省く（core/taskFlow.ts）
 */
export function stepMode(job: PracticeJobInput, index: number): AssignModeDef {
  const mode = getAssignMode(job.steps[index]?.mode ?? 'human');
  const prev = index > 0 ? job.steps[index - 1] : undefined;
  if (!mode.chains || !prev || !getAssignMode(prev.mode).chains) return mode;
  return { ...mode, steps: mode.steps.filter((s) => !s.skipWhenChained) };
}

export interface PracticeStepEstimate {
  /** 今の人間時間（分） */
  readonly beforeMinutes: number;
  /** 改善後の人間時間の見込み（分）。指示出し・確認・手戻り */
  readonly afterMinutes: number;
  /** AI が作業する時間（分） */
  readonly aiMinutes: number;
  /** AI の費用（円） */
  readonly aiCost: number;
  /** 失敗を見逃したまま次へ渡す確率 */
  readonly pEscape: number;
}

/** 業務1回と1年の試算 */
export interface PracticeEstimate {
  readonly steps: readonly PracticeStepEstimate[];
  /** 業務1回の人間時間（分） */
  readonly beforeMinutes: number;
  readonly afterMinutes: number;
  /** 人間時間の削減率（0〜1。増えたら負） */
  readonly reduction: number;
  readonly runsPerYear: number;
  /** 年間の人間時間（h） */
  readonly annualBeforeHours: number;
  readonly annualAfterHours: number;
  /** 年間の削減時間（h） */
  readonly annualSavedHours: number;
  /** 業務1回の AI の費用（円） */
  readonly aiCostPerRun: number;
  /** 年間の AI の利用料（円） */
  readonly annualAiCost: number;
  /** 部品の導入コスト（円）。会社の資産なので、複数の工程で使う部品も1回だけ払う */
  readonly installCost: number;
  /** 1年目の AI の追加コスト（利用料 + 導入コスト、円） */
  readonly aiExtraCost: number;
  /** 年間の削減時間を人件費で換算した額（円） */
  readonly annualLaborSaved: number;
  /** ROI（(削減額 − AI の追加コスト) ÷ AI の追加コスト）。追加コストがなければ null */
  readonly roi: number | null;
  /** 人日あたりの利益（円/人日。(業務の価値 − 人件費 − AI の費用) ÷ 人間時間）。人間時間が 0 なら null */
  readonly profitPerPersonDay: { readonly before: number | null; readonly after: number | null };
  /** 品質の期待値（工程の作業量による加重平均。見逃した失敗の分だけ下がる） */
  readonly quality: number;
  /** AI が人間なしで作業する時間（分、業務1回） */
  readonly aiMinutes: number;
}

/** 1人日の時間（h）。時給で持っていた古い入力の換算に使う */
const personDayHours = balance.project.minutesPerPersonDay / MINUTES_PER_HOUR;

const perDay = (value: number, minutes: number) => (minutes > 0 ? perPersonDay(value, minutes) : null);

/** 業務の試算（純粋関数）。改善前はすべての工程を人間が行う */
export function estimatePractice(job: PracticeJobInput): PracticeEstimate {
  const steps = job.steps.map((step, i) => {
    const task = practiceTask(step, i);
    const e = expectWithSetup(task, stepMode(job, i), SELF_SKILL, stepSetup(step, task));
    return {
      task,
      estimate: {
        beforeMinutes: step.minutes,
        afterMinutes: e.humanMinutes,
        aiMinutes: e.aiMinutes,
        aiCost: e.aiCost,
        pEscape: e.pEscape,
      },
    };
  });
  const sum = (key: keyof PracticeStepEstimate) => steps.reduce((s, x) => s + x.estimate[key], 0);
  const beforeMinutes = sum('beforeMinutes');
  const afterMinutes = sum('afterMinutes');
  const aiCostPerRun = sum('aiCost');
  const runsPerYear = balance.practice.runsPerYear[job.frequency];
  const installCost = [...new Set(job.steps.filter(usesAi).flatMap((s) => s.parts))]
    .filter((id) => content.harnessParts.some((p) => p.id === id))
    .reduce((total, id) => total + getHarnessPart(id).installCost, 0);
  const annualAiCost = aiCostPerRun * runsPerYear;
  const aiExtraCost = annualAiCost + installCost;
  const annualSavedHours = ((beforeMinutes - afterMinutes) * runsPerYear) / MINUTES_PER_HOUR;
  const annualLaborSaved = laborCost((beforeMinutes - afterMinutes) * runsPerYear, job.dailyWage);
  const effort = steps.reduce((s, x) => s + x.task.effort, 0);
  const quality =
    effort > 0
      ? steps.reduce((s, x) => s + (1 - x.estimate.pEscape * (1 - escapedQuality(x.task))) * x.task.effort, 0) / effort
      : 1;
  return {
    steps: steps.map((x) => x.estimate),
    beforeMinutes,
    afterMinutes,
    reduction: beforeMinutes > 0 ? 1 - afterMinutes / beforeMinutes : 0,
    runsPerYear,
    annualBeforeHours: (beforeMinutes * runsPerYear) / MINUTES_PER_HOUR,
    annualAfterHours: (afterMinutes * runsPerYear) / MINUTES_PER_HOUR,
    annualSavedHours,
    aiCostPerRun,
    annualAiCost,
    installCost,
    aiExtraCost,
    annualLaborSaved,
    roi: aiExtraCost > 0 ? (annualLaborSaved - aiExtraCost) / aiExtraCost : null,
    profitPerPersonDay: {
      before: perDay(job.valuePerRun - laborCost(beforeMinutes, job.dailyWage), beforeMinutes),
      after: perDay(job.valuePerRun - laborCost(afterMinutes, job.dailyWage) - aiCostPerRun, afterMinutes),
    },
    quality,
    aiMinutes: sum('aiMinutes'),
  };
}

/** 工程に AI が関わるか（人間だけの工程の部品と Model は使わない） */
export function usesAi(step: PracticeStepInput): boolean {
  return getAssignMode(step.mode).steps.some((s) => s.actor === 'ai');
}

/**
 * Harness Builder の選択肢の Command（Model の変更・部品の付け外し）を、実務モードの工程に適用する。
 * 同じ group の部品は付け替える（ゲームの equipPart と同じ withPart を使う）。関係のない Command はそのまま返す
 */
export function applyToStep(step: PracticeStepInput, command: Command): PracticeStepInput {
  switch (command.type) {
    case 'SetModel':
      return content.models.some((m) => m.id === command.modelId) ? { ...step, modelId: command.modelId } : step;
    case 'EquipPart':
      return step.parts.includes(command.partId) || !content.harnessParts.some((p) => p.id === command.partId)
        ? step
        : { ...step, parts: withPart(step.parts, command.partId) };
    case 'RemovePart':
      return { ...step, parts: step.parts.filter((id) => id !== command.partId) };
    case 'ApplyHarnessPreset': {
      const preset = harnessPresets.find((p) => p.id === command.presetId);
      return preset ? { ...step, parts: preset.parts.reduce<string[]>((acc, id) => withPart(acc, id), []) } : step;
    }
    default:
      return step;
  }
}

/** 新しい工程。AI 適性はふつう、担当は人間（まだ改善していない） */
export function newPracticeStep(name: string): PracticeStepInput {
  return { name, minutes: 0, kind: 'planning', aptitude: 'mid', mode: 'human', modelId: 'standard', parts: [] };
}

const FREQUENCIES = Object.keys(balance.practice.runsPerYear);
const APTITUDES = Object.keys(practiceAptitudes);
const KINDS = ['planning', 'research', 'design', 'content', 'code', 'test', 'release'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clampNumber = (v: unknown, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : null;
const text = (v: unknown) => (typeof v === 'string' ? [...v].slice(0, balance.practice.maxNameLength).join('') : null);

function parseStep(v: unknown): PracticeStepInput | null {
  if (!isRecord(v)) return null;
  const name = text(v.name);
  const minutes = clampNumber(v.minutes, balance.practice.maxStepMinutes);
  const mode = content.assignModes.find((m) => m.id === v.mode)?.id;
  if (
    name === null ||
    minutes === null ||
    !mode ||
    !KINDS.includes(v.kind as string) ||
    !APTITUDES.includes(v.aptitude as string) ||
    !content.models.some((m) => m.id === v.modelId) ||
    !Array.isArray(v.parts)
  ) {
    return null;
  }
  const parts = migratePartIds(
    v.parts.filter((id): id is string => typeof id === 'string'),
    () => undefined,
  ).filter(
    (id): id is string =>
      typeof id === 'string' && content.harnessParts.some((p) => p.id === id && p.category !== 'contextRouter'),
  );
  return {
    name,
    minutes,
    kind: v.kind as PracticeStepInput['kind'],
    aptitude: v.aptitude as PracticeStepInput['aptitude'],
    mode,
    modelId: v.modelId as string,
    parts: parts.reduce<string[]>((acc, id) => (acc.includes(id) ? acc : withPart(acc, id)), []),
  };
}

/**
 * 保存しておいた入力（localStorage の JSON）を読み直す。形が違う・知らない値なら null。
 * 数値は範囲に収め、工程は上限までにし、存在しない部品は落とす
 */
export function parsePracticeJob(v: unknown): PracticeJobInput | null {
  if (!isRecord(v) || !Array.isArray(v.steps)) return null;
  const name = text(v.name);
  // Phase 18 より前の入力は時給で持っていたので、1営業日分に換算して読む
  const legacyWage = typeof v.hourlyWage === 'number' ? v.hourlyWage * personDayHours : undefined;
  const wage = clampNumber(v.dailyWage ?? legacyWage, Number.MAX_SAFE_INTEGER);
  const value = clampNumber(v.valuePerRun, Number.MAX_SAFE_INTEGER);
  const steps = v.steps.slice(0, balance.practice.maxSteps).map(parseStep);
  if (name === null || wage === null || value === null || !FREQUENCIES.includes(v.frequency as string)) return null;
  if (steps.some((s) => s === null)) return null;
  return {
    name,
    frequency: v.frequency as PracticeJobInput['frequency'],
    dailyWage: wage,
    valuePerRun: value,
    steps: steps as PracticeStepInput[],
  };
}
