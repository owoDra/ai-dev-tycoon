import { balance } from '../content/balance';
import { getHarnessPart, getModel, getProject } from '../content/index';
import type { TaskDef } from '../content/types';
import {
  addImpact,
  applySetup,
  attributeProject,
  type FactorImpact,
  type FactorRef,
  factorKey,
  type Impact,
  type ProjectAttribution,
  setupFactors,
  ZERO_IMPACT,
} from '../core/attribution';
import { stageTimes } from '../core/bottleneck';
import { dailyCost, escapedDefectCost, escapedFixMinutes, personDays } from '../core/formulas';
import type { ProjectScore } from '../core/scoring';
import type { GameState, TaskRun } from '../core/state';
import { teamMembers } from '../core/team';
import { MINUTES_PER_HOUR } from '../core/units';
import { ja } from '../i18n/ja';
import { bottleneckName } from './bottleneck';
import { simulateTaskAlone } from './forecast';

/*
 * 振り返り（企画書60章）。案件の終わりに「一番効いた改善」「最大の無駄」「次に改善できる場所」を言葉で返す。
 * 寄与は core/attribution.ts の期待値で見積もり、寄与の大きい改善だけは「それが無かった場合」をヘッドレスで再シミュレーションして置き換える。
 */

/** 振り返りのカード1枚 */
export interface RetroCard {
  readonly kind: 'best' | 'waste' | 'next';
  /** 見出し（部品の名前・工程の名前など） */
  readonly title: string;
  /** 1行の説明 */
  readonly body: string;
  /** 寄与の要素（best / waste のうち構成の要素のとき）。結果画面の強調や Workflow の保存に使う */
  readonly factor: string | null;
}

export interface Retrospective {
  readonly best: RetroCard;
  readonly waste: RetroCard;
  readonly next: RetroCard;
}

/** 人間の時間を円に換算する人日あたりの原価（会社にいる社員の平均） */
export function averageWage(state: GameState): number {
  const team = teamMembers(state);
  return team.reduce((sum, h) => sum + dailyCost(h), 0) / Math.max(1, team.length);
}

/** 影響を円に換算した値。正なら得（人間時間と費用が減った）、負なら損 */
export function impactValue(impact: Impact, wage: number): number {
  return -personDays(impact.humanMinutes) * wage - impact.cost;
}

export function factorName(ref: FactorRef): string {
  if (ref.kind === 'part') return getHarnessPart(ref.partId).name;
  if (ref.kind === 'model') return getModel(ref.modelId).name;
  return ja.retro.context;
}

/** 再シミュレーションした Task の人間時間。見逃した失敗は納品後に直す時間を足す（寄与の見込みと同じ数え方。core/attribution.ts） */
const runHumanMinutes = (r: TaskRun | undefined, task: TaskDef) =>
  (r?.humanMinutes ?? 0) + (r?.escaped ? escapedFixMinutes(task) : 0);

/** 再シミュレーションした Task の費用。見逃した失敗の損害を足す */
const runCost = (r: TaskRun | undefined, task: TaskDef) =>
  (r?.aiCost ?? 0) + (r?.escaped ? escapedDefectCost(task) : 0);

/** 「それが無かった場合」の再シミュレーションの1件（1つの要素 × 1つの Task）。結果画面で少しずつ実行する */
export interface CounterfactualJob {
  readonly key: string;
  readonly run: () => Impact;
}

/**
 * 寄与の大きい改善（上位 balance.result.counterfactualTop 件）について、要素を外した構成で Task を再シミュレーションする仕事の列。
 * Task ごとに、記録した構成のままと要素だけを外した構成を、同じ seed の列で balance.result.counterfactualSamples 回ずつ処理して差をとる
 */
export function counterfactualJobs(
  state: GameState,
  projectId: string,
  attribution: ProjectAttribution,
): CounterfactualJob[] {
  const wage = averageWage(state);
  const top = attribution.factors
    .filter((f) => impactValue(f.impact, wage) > 0)
    .sort((a, b) => impactValue(b.impact, wage) - impactValue(a.impact, wage))
    .slice(0, balance.result.counterfactualTop);
  const run = state.projects[projectId];
  const effortSum = getProject(projectId).tasks.reduce((sum, t) => sum + t.effort, 0);
  const jobs: CounterfactualJob[] = [];
  for (const f of top) {
    for (const task of getProject(projectId).tasks) {
      const t = run?.tasks[task.id];
      const setup = t?.setup;
      if (!t?.assignment || !setup) continue;
      const { mode, workerId } = t.assignment;
      const has = (ref: FactorRef) => factorKey(ref) === f.key;
      if (!setupFactors(projectId, workerId, setup).some(has)) continue;
      jobs.push({
        key: f.key,
        run: () => {
          const withIt = applySetup(state, workerId, setup, () => true);
          const without = applySetup(state, workerId, setup, (ref) => !has(ref));
          let sum = ZERO_IMPACT;
          const n = balance.result.counterfactualSamples;
          for (let i = 0; i < n; i++) {
            const seed = `${state.seed}/retro/${task.id}/${i}`;
            const a = simulateTaskAlone(withIt, projectId, task.id, mode, workerId, seed);
            const b = simulateTaskAlone(without, projectId, task.id, mode, workerId, seed);
            const diff: Impact = {
              humanMinutes: runHumanMinutes(a, task) - runHumanMinutes(b, task),
              cost: runCost(a, task) - runCost(b, task),
              quality: effortSum > 0 ? (((a?.quality ?? 0) - (b?.quality ?? 0)) * task.effort) / effortSum : 0,
            };
            sum = addImpact(sum, diff, 1 / n);
          }
          return sum;
        },
      });
    }
  }
  return jobs;
}

/** 仕事の列をすべて実行し、要素ごとに合計する（テストと、分割実行の最後のまとめに使う） */
export function runCounterfactuals(jobs: readonly CounterfactualJob[]): Map<string, Impact> {
  const out = new Map<string, Impact>();
  for (const job of jobs) out.set(job.key, addImpact(out.get(job.key) ?? ZERO_IMPACT, job.run()));
  return out;
}

const hours = (minutes: number) => ja.retro.hours(Math.abs(minutes) / MINUTES_PER_HOUR);

/** 改善の効果の1行。円に換算して大きい方（人間時間 / 費用）で言う */
function gainLine(impact: Impact, wage: number): string {
  const timeValue = -personDays(impact.humanMinutes) * wage;
  if (timeValue >= -impact.cost) return ja.retro.savedTime(hours(impact.humanMinutes));
  return ja.retro.savedCost(-impact.cost);
}

/** 無駄の1行 */
function lossLine(ref: FactorRef | null, impact: Impact, wage: number): string {
  const timeLoss = personDays(impact.humanMinutes) * wage;
  if (timeLoss > impact.cost) return ja.retro.lostTime(hours(impact.humanMinutes));
  if (ref?.kind === 'context') return ja.retro.contextCost(impact.cost);
  return ref?.kind === 'part' ? ja.retro.partCost(impact.cost) : ja.retro.lostCost(impact.cost);
}

interface Candidate {
  readonly title: string;
  readonly body: string;
  readonly factor: string | null;
  readonly value: number;
}

/**
 * 振り返りの3枚のカード。counterfactual があれば、その要素の寄与は再シミュレーションの値を使う。
 * - 一番効いた改善：円に換算した得が最も大きい構成の要素
 * - 最大の無駄：円に換算した損が最も大きいもの（構成の要素、見逃した失敗の手戻り、事故、納期の超過）
 * - 次に改善できる場所：待ち時間を含めて最も時間のかかった工程（ボトルネック）
 */
export function retrospective(
  state: GameState,
  projectId: string,
  score: ProjectScore,
  attribution: ProjectAttribution = attributeProject(state, projectId),
  counterfactual: ReadonlyMap<string, Impact> = new Map(),
): Retrospective {
  const wage = averageWage(state);
  const min = balance.result.minCardValue;
  const factors: FactorImpact[] = attribution.factors.map((f) => ({
    ...f,
    impact: counterfactual.get(f.key) ?? f.impact,
  }));
  const valued = factors.map((f) => ({ f, value: impactValue(f.impact, wage) }));

  const gains = valued.filter((v) => v.value >= min).sort((a, b) => b.value - a.value);
  const top = gains[0];
  const best: RetroCard = top
    ? { kind: 'best', title: factorName(top.f.ref), body: gainLine(top.f.impact, wage), factor: top.f.key }
    : { kind: 'best', title: ja.retro.noGainTitle, body: ja.retro.noGainBody, factor: null };

  const losses: Candidate[] = valued
    .filter((v) => -v.value >= min)
    .map((v) => ({
      title: factorName(v.f.ref),
      body: lossLine(v.f.ref, v.f.impact, wage),
      factor: v.f.key,
      value: -v.value,
    }));
  const rework = score.reworkCost;
  if (rework >= min)
    losses.push({ title: ja.retro.rework, body: ja.retro.lostCost(rework), factor: null, value: rework });
  if (score.accidentCost >= min) {
    losses.push({
      title: ja.retro.accident,
      body: ja.retro.lostCost(score.accidentCost),
      factor: null,
      value: score.accidentCost,
    });
  }
  const worst = losses.sort((a, b) => b.value - a.value)[0];
  const waste: RetroCard = worst
    ? { kind: 'waste', title: worst.title, body: worst.body, factor: worst.factor }
    : { kind: 'waste', title: ja.retro.noWasteTitle, body: ja.retro.noWasteBody, factor: null };

  const slowest = stageTimes(state, projectId).sort((a, b) => b.minutes - a.minutes)[0];
  const next: RetroCard = slowest
    ? {
        kind: 'next',
        title: bottleneckName(slowest.ref),
        body: ja.retro.bottleneck(hours(slowest.minutes)),
        factor: null,
      }
    : { kind: 'next', title: ja.retro.noBottleneckTitle, body: ja.retro.noBottleneckBody, factor: null };

  return { best, waste, next };
}
