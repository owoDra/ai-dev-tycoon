import { getAssignMode } from '../content/assignModes';
import { balance } from '../content/balance';
import { aiWorkers, findWorker, getProject, humans } from '../content/index';
import type { AssignModeDef, HarnessModifiers, ModelDef, TaskDef } from '../content/types';
import {
  aiCostFactor,
  aiSuccessWithContext,
  aiWorkTime,
  type ContextWorkTime,
  expectedAiWorkMinutes,
} from './contextWork';
import {
  aiCost,
  escapedQuality,
  evalLoop,
  modeOutcome,
  repairMinutes,
  stepMinutes,
  successProbability,
} from './formulas';
import { evalMinutes, harnessModel, harnessModifiers, harnessSuccess, harnessToolMiss, NEUTRAL } from './harness';
import type { GameState } from './state';
import { MINUTES_PER_HOUR } from './units';

/*
 * 見込み（期待値）。シミュレーションと同じ式（formulas・contextWork・harness）を、乱数を引かずに確率で平均した値。
 * HUD の Profit / Person-Day の見込み（view/hud.ts）と、Harness Builder の Before → After（view/harness.ts）で使う。
 */

/** 1つの Task をモードで処理したときの見込み */
export interface TaskExpectation {
  /** 人間の時間（分）。指示出し・確認・レビューでの手戻り */
  readonly humanMinutes: number;
  /** AI が作業する時間（分）。Eval の検証と修復を含む */
  readonly aiMinutes: number;
  /** AI の費用（円） */
  readonly aiCost: number;
  /** 失敗を見逃したまま完了する確率 */
  readonly pEscape: number;
  /** 事故の損害の見込み（円） */
  readonly accidentCost: number;
}

/** 人間の平均的な熟練度 */
export function averageSkill(): number {
  return humans.reduce((sum, h) => sum + h.skill, 0) / Math.max(1, humans.length);
}

/**
 * AI の作業の条件（Harness と Context を入れたもの）。ゲームでは AI Worker の state から（expectTask）、
 * 実務モードでは工程の入力から（core/practice.ts）作り、同じ expectWithSetup で見込みを出す
 */
export interface AiSetup {
  /** Harness の補正（お願いは守られる確率で薄めたもの） */
  readonly mods: HarnessModifiers;
  /** 補正とランニングコストを入れた実効の Model */
  readonly model: ModelDef;
  /** AI の作業の成功確率の補正（Context・Harness・事故） */
  readonly aiSuccess: (p: number) => number;
  /** AI の作業の所要時間への影響（Context と Tool の誤選択） */
  readonly time: ContextWorkTime;
  /** AI の費用の倍率（Context の使用率） */
  readonly costFactor: number;
}

/** Context のない AI の作業の条件。Harness の補正だけを入れる */
export function harnessSetup(mods: HarnessModifiers, model: ModelDef): AiSetup {
  const safe = 1 - mods.risk;
  return {
    mods,
    model,
    aiSuccess: (p) => harnessSuccess(p, mods) * safe,
    time: { factor: 1, toolMissChance: harnessToolMiss(mods), extraMinutes: 0 },
    costFactor: 1,
  };
}

/**
 * Task をモードで処理したときの見込み。workerId はモードの主な担い手。
 * AI Worker なら、その Harness（Model と部品。お願いは守られる確率で薄める）と Session の Context を入れる。
 */
export function expectTask(
  state: GameState,
  projectId: string,
  task: TaskDef,
  mode: AssignModeDef,
  workerId: string,
  skill: number,
): TaskExpectation {
  const isAi = findWorker(workerId)?.kind === 'ai';
  const aiId = isAi ? workerId : (aiWorkers[0]?.id ?? '');
  const mods: HarnessModifiers = isAi ? harnessModifiers(state, workerId, task, { expected: true }) : NEUTRAL;
  const model: ModelDef = harnessModel(state, aiId, mods);
  const safe = 1 - mods.risk;
  const context = aiWorkTime(state, workerId, projectId, task, model);
  const harnessMiss = harnessToolMiss(mods);
  return expectWithSetup(task, mode, skill, {
    mods,
    model,
    aiSuccess: (p) => {
      const q = harnessSuccess(aiSuccessWithContext(state, workerId, projectId, task.id, p), mods);
      return safe === 1 ? q : q * safe;
    },
    time:
      harnessMiss === 0
        ? context
        : { ...context, toolMissChance: 1 - (1 - context.toolMissChance) * (1 - harnessMiss) },
    costFactor: aiCostFactor(state, workerId, projectId, task.id),
  });
}

/** Task をモードで処理したときの見込み（AI の作業の条件を渡す） */
export function expectWithSetup(task: TaskDef, mode: AssignModeDef, skill: number, setup: AiSetup): TaskExpectation {
  const { mods, model, aiSuccess, time } = setup;
  const outcome = modeOutcome(task, mode, skill, model, aiSuccess, mods);
  let aiMinutes = outcome.aiReviewMinutes;
  let aiWorks = 0;
  for (const s of mode.steps) {
    if (s.actor !== 'ai' || s.phase !== 'work') continue;
    aiWorks++;
    aiMinutes += expectedAiWorkMinutes(stepMinutes(task, s, { kind: 'ai', model }), time);
    if (mods.evalCatch <= 0) continue;
    const loop = evalLoop(aiSuccess(successProbability(task, { kind: 'ai', model })), mods.evalCatch);
    aiMinutes += loop.evalRuns * evalMinutes(task, model) + loop.repairs * repairMinutes(task, model);
  }
  return {
    humanMinutes: outcome.humanMinutes,
    aiMinutes,
    aiCost: aiCost(aiMinutes, model) * setup.costFactor,
    pEscape: outcome.defect,
    accidentCost: aiWorks * mods.risk * balance.harness.accidentCost,
  };
}

/** AI Worker の、案件の仕事の見込み（Harness Builder の Before → After） */
export interface WorkerExpectation {
  readonly humanMinutes: number;
  readonly aiCost: number;
  /** 品質の期待値（作業量による加重平均） */
  readonly quality: number;
  /** AI が人間なしで作業する時間（分） */
  readonly autonomyMinutes: number;
}

/** 担当が決まっていない Task を AI Worker に任せるときに仮定するモード */
const ASSUMED_MODE = 'aiThenHumanReview';

/**
 * AI Worker が案件で受け持つ、まだ終わっていない仕事の見込み。
 * その AI Worker の担当の Task と、担当が決まっていない Task（AI → 人間レビューで任せると仮定する）を合計する
 */
export function expectWorker(state: GameState, projectId: string, workerId: string): WorkerExpectation {
  const run = state.projects[projectId];
  const skill = averageSkill();
  let humanMinutes = 0;
  let cost = 0;
  let autonomy = 0;
  let qualitySum = 0;
  let effortSum = 0;
  for (const task of getProject(projectId).tasks) {
    const t = run?.tasks[task.id];
    if (t?.status === 'done') continue;
    const assignment = t?.assignment ?? null;
    if (assignment && assignment.workerId !== workerId) continue;
    const mode = getAssignMode(assignment?.mode ?? ASSUMED_MODE);
    const e = expectTask(state, projectId, task, mode, workerId, skill);
    humanMinutes += e.humanMinutes;
    cost += e.aiCost;
    autonomy += e.aiMinutes;
    qualitySum += (1 - e.pEscape * (1 - escapedQuality(task))) * task.effort;
    effortSum += task.effort;
  }
  return {
    humanMinutes,
    aiCost: cost,
    quality: effortSum > 0 ? qualitySum / effortSum : 1,
    autonomyMinutes: autonomy,
  };
}

/** 進行中の案件すべてで、AI Worker の仕事の人間時間の見込み（h） */
export function workerHumanHours(state: GameState, workerId: string): number {
  let minutes = 0;
  for (const [projectId, run] of Object.entries(state.projects)) {
    if (run.completedAt === null) minutes += expectWorker(state, projectId, workerId).humanMinutes;
  }
  return minutes / MINUTES_PER_HOUR;
}
