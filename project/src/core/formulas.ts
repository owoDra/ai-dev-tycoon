import { balance } from '../content/balance';
import type { AssignModeDef, ModelDef, ModeStep, TaskDef } from '../content/types';

/**
 * 工程の担い手。人間は skill（速さと正確さの両方に効く）と正確さ（accuracy。省けば balance.human.competence の平均的な人）、
 * AI は Model の性能で計算する
 */
export type ActorProfile =
  | { readonly kind: 'human'; readonly skill: number; readonly accuracy?: number }
  | { readonly kind: 'ai'; readonly model: ModelDef };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 工程の所要時間（分）。作業量 × 工程の割合を、人間は skill、AI は Model の速度で割る */
export function stepMinutes(task: TaskDef, step: ModeStep, actor: ActorProfile): number {
  const rate = actor.kind === 'human' ? actor.skill : actor.model.speed;
  return (task.effort * step.effortShare) / rate;
}

/** Task 固有の失敗リスク。基礎リスクに、難易度と品質要求の重み付き和を掛ける */
export function taskRisk(task: TaskDef): number {
  const { difficultyWeight, qualityReqWeight } = balance.success;
  return task.failRisk * (difficultyWeight * task.difficulty + qualityReqWeight * task.qualityReq);
}

/**
 * 作業が成功する確率。担い手の正確さからリスクを引き、[min, max] に収める。
 * 人間は正確さ × skill からリスクの影響を riskScale 倍に抑えて引く安定型、AI は Model の能力を AI 適性に応じて発揮する。
 */
export function successProbability(task: TaskDef, actor: ActorProfile): number {
  const { min, max } = balance.success;
  if (actor.kind === 'human') {
    const accuracy = actor.accuracy ?? balance.human.competence;
    return clamp(accuracy * actor.skill - balance.human.riskScale * taskRisk(task), min, max);
  }
  const floor = balance.ai.aptitudeFloor;
  const competence = actor.model.capability * (floor + (1 - floor) * task.aiAptitude);
  return clamp(competence - taskRisk(task), min, max);
}

/** AI が minutes 分作業したときの費用（円） */
export function aiCost(minutes: number, model: ModelDef): number {
  return minutes * model.costPerMinute;
}

/** 人間の稼働時間（分）を人日に換算する。1人日は1日の勤務時間（balance.project.minutesPerPersonDay） */
export function personDays(minutes: number): number {
  return minutes / balance.project.minutesPerPersonDay;
}

/** 人日あたりの値。value を人間の稼働時間（分）の人日で割る。稼働がなければ 0 */
/** 利益 / 人日 を「人間1人が1か月（balance.score.workDaysPerMonth 日）働いた場合の利益」に換算する（表示用） */
export function monthlyPace(profitPerPersonDay: number): number {
  return profitPerPersonDay * balance.score.workDaysPerMonth;
}

export function perPersonDay(value: number, minutes: number): number {
  return minutes > 0 ? value / personDays(minutes) : 0;
}

/** 人間が minutes 分働いたときの人件費（円）。dailyCost は1人日あたりの原価 */
export function laborCost(minutes: number, dailyCost: number): number {
  return personDays(minutes) * dailyCost;
}

/** 社員の1人日あたりの原価（給与）。売値（dailyRate）に原価率を掛ける */
export function dailyCost(worker: { readonly dailyRate: number }): number {
  return worker.dailyRate * balance.staff.costRatio;
}

/** レビューで失敗が見つかったときの手戻りにかかる人間の時間（分） */
export function reworkMinutes(task: TaskDef, skill: number): number {
  return (task.effort * balance.assign.reworkShare) / skill;
}

/** 自動テストで失敗が見つかったときに AI が修復する時間（分） */
export function repairMinutes(task: TaskDef, model: ModelDef): number {
  return (task.effort * balance.assign.repairShare) / model.speed;
}

/** Eval → Repair → Eval のループの見込み（Generate の後の検証。企画書18章） */
export interface EvalLoopOutcome {
  /** ループを抜けたときに失敗が残っている確率 */
  readonly defect: number;
  /** 検証を行う回数の期待値 */
  readonly evalRuns: number;
  /** 修復を行う回数の期待値 */
  readonly repairs: number;
}

/**
 * 成功確率 p の作業の後に、失敗を catchRate の確率で見つける検証を行う。見つけたら直して（修復も確率 p で成功する）もう一度検証し、
 * 修復が balance.harness.maxRepairLoops 回に達したら、残った失敗のまま抜ける。シミュレーション（core/taskFlow.ts）と同じ流れの期待値。
 * initialDefect は最初の検証の時点で失敗が残っている確率（既定は作業そのものの失敗確率）
 */
export function evalLoop(p: number, catchRate: number, initialDefect = 1 - p): EvalLoopOutcome {
  if (catchRate <= 0) return { defect: initialDefect, evalRuns: 0, repairs: 0 };
  let mass = 1;
  let d = initialDefect;
  let defect = 0;
  let evalRuns = 0;
  let repairs = 0;
  for (let loop = 1; ; loop++) {
    evalRuns += mass;
    const caught = mass * d * catchRate;
    defect += mass * d * (1 - catchRate);
    if (caught === 0) break;
    repairs += caught;
    if (loop >= balance.harness.maxRepairLoops) {
      defect += caught * (1 - p);
      break;
    }
    mass = caught;
    d = 1 - p;
  }
  return { defect, evalRuns, repairs };
}

/** AI の自動テストが、残っている失敗を見つける確率。Task の種類で決まる（balance.assign.autoTestCatch） */
export function autoTestCatch(task: TaskDef): number {
  const { autoTestCatch: byKind, autoTestCatchDefault } = balance.assign;
  return task.kind ? byKind[task.kind] : autoTestCatchDefault;
}

/** review の工程が、残っている失敗を見つける確率（ModeStep.catchRate） */
export function reviewCatch(task: TaskDef, step: ModeStep): number {
  return step.catchRate ?? (step.actor === 'ai' ? autoTestCatch(task) : 1);
}

/** Harness が人間の時間の見込みに与える補正（core/harness.ts の HarnessModifiers の一部） */
export interface HumanTimeHarness {
  /** AI が関わる Task の指示出しと確認の時間の倍率 */
  readonly humanTime: number;
  /** AI の作業の直後の自動検証が失敗を見つける確率 */
  readonly evalCatch: number;
}

const NO_HARNESS: HumanTimeHarness = { humanTime: 1, evalCatch: 0 };

/** 指示出しと確認は、Harness の人間の介入の補正を受ける */
export const isIntervention = (step: ModeStep) =>
  step.actor === 'human' && (step.phase === 'instruct' || step.phase === 'review');

/** モードの工程を順にたどった見込み（modeOutcome） */
export interface ModeOutcome {
  /** 人間の拘束時間（分）。指示出し・確認・レビューで見つかった失敗の手戻り */
  readonly humanMinutes: number;
  /** AI の自動テストの工程（検証の繰り返しと修復）にかかる AI の時間（分） */
  readonly aiReviewMinutes: number;
  /** 失敗を見逃したまま完了する確率 */
  readonly defect: number;
}

/**
 * モードの工程を順にたどった見込み。シミュレーション（core/taskFlow.ts）と同じ流れを、乱数を引かずに確率で平均する。
 * - 作業の工程は成功確率で失敗を残す。aiSuccess で AI の作業の成功確率を補正できる（Context と Harness の影響。core/contextWork.ts・core/harness.ts）。
 *   harness の Eval（evalCatch）があれば AI の作業の直後に検証して残る失敗を減らす
 * - 人間のレビューは、残っている失敗を catchRate の確率で見つけて手戻りにする（既定は必ず見つける）
 * - AI の自動テストは、Task の種類の検出率で見つけて AI が直し、もう一度テストする（Eval と同じループ）
 * harness を渡すと、指示出しと確認の時間を補正する（連鎖による指示出しの省略は考えない）。
 */
export function modeOutcome(
  task: TaskDef,
  mode: AssignModeDef,
  skill: number,
  model: ModelDef,
  aiSuccess: (p: number) => number = (p) => p,
  harness: HumanTimeHarness = NO_HARNESS,
): ModeOutcome {
  const human: ActorProfile = { kind: 'human', skill };
  const ai: ActorProfile = { kind: 'ai', model };
  let minutes = 0;
  let aiReviewMinutes = 0;
  let pAllOk = 1;
  let aiP = aiSuccess(successProbability(task, ai));
  for (const step of mode.steps) {
    if (step.actor === 'human') {
      const m = stepMinutes(task, step, human);
      minutes += isIntervention(step) && harness.humanTime !== 1 ? m * harness.humanTime : m;
    }
    if (step.phase === 'work') {
      if (step.actor === 'human') {
        pAllOk *= successProbability(task, human);
        continue;
      }
      aiP = aiSuccess(successProbability(task, ai));
      pAllOk *= harness.evalCatch > 0 ? 1 - evalLoop(aiP, harness.evalCatch).defect : aiP;
      continue;
    }
    if (step.phase !== 'review') continue;
    const c = reviewCatch(task, step);
    if (step.actor === 'human') {
      minutes += (1 - pAllOk) * c * reworkMinutes(task, skill);
      pAllOk = 1 - (1 - pAllOk) * (1 - c);
      continue;
    }
    const loop = evalLoop(aiP, c, 1 - pAllOk);
    aiReviewMinutes +=
      Math.max(1, loop.evalRuns) * stepMinutes(task, step, ai) + loop.repairs * repairMinutes(task, model);
    pAllOk = 1 - loop.defect;
  }
  return { humanMinutes: minutes, aiReviewMinutes, defect: 1 - pAllOk };
}

/** 人間の拘束時間の見込み（分）。modeOutcome の humanMinutes */
export function expectedHumanMinutes(
  task: TaskDef,
  mode: AssignModeDef,
  skill: number,
  model: ModelDef,
  aiSuccess: (p: number) => number = (p) => p,
  harness: HumanTimeHarness = NO_HARNESS,
): number {
  return modeOutcome(task, mode, skill, model, aiSuccess, harness).humanMinutes;
}

/** 失敗を見逃したまま完了した Task の品質。品質要求が高い Task ほど落ち込みが大きい */
export function escapedQuality(task: TaskDef): number {
  const { escapedLossBase, escapedLossByReq } = balance.quality;
  return clamp(1 - escapedLossBase - escapedLossByReq * task.qualityReq, 0, 1);
}

/** 見逃した失敗が納品後に起こす損害（円、修正の人件費は含まない）。作業量と品質要求に比例する */
export function escapedDefectCost(task: TaskDef): number {
  return task.effort * task.qualityReq * balance.score.escapedDefectCostPerEffortMinute;
}

/** 見逃した失敗を納品後に人間が直す時間（分） */
export function escapedFixMinutes(task: TaskDef): number {
  return task.effort * balance.score.escapedFixShare;
}

/** 案件の売上と納期。案件の定義（ProjectDef）か、始めた案件の契約（core/state.ts の ProjectRun） */
export interface ProjectTerms {
  readonly revenue: number;
  readonly deadlineDays: number;
}

/** 納期（ゲーム内の分、案件開始からの経過） */
export function deadlineMinutes(project: ProjectTerms): number {
  return project.deadlineDays * balance.time.minutesPerDay;
}

/** 遅延損失（円）。納期を超えた営業日数（端数も比例）× 売上 × 1日あたりの損失率 */
export function delayLoss(elapsedMinutes: number, project: ProjectTerms): number {
  const lateDays = Math.max(0, elapsedMinutes - deadlineMinutes(project)) / balance.time.minutesPerDay;
  return lateDays * project.revenue * balance.project.delayLossPerDay;
}
