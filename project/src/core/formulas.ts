import { balance } from '../content/balance';
import type { AssignModeDef, ModelDef, ModeStep, ProjectDef, TaskDef } from '../content/types';
import { MINUTES_PER_HOUR } from './units';

/** 工程の担い手。人間は skill、AI は Model の性能で計算する */
export type ActorProfile =
  | { readonly kind: 'human'; readonly skill: number }
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
 * 人間はリスクの影響を riskScale 倍に抑えた安定型、AI は Model の能力を AI 適性に応じて発揮する。
 */
export function successProbability(task: TaskDef, actor: ActorProfile): number {
  const { min, max } = balance.success;
  if (actor.kind === 'human') {
    return clamp(balance.human.competence * actor.skill - balance.human.riskScale * taskRisk(task), min, max);
  }
  const floor = balance.ai.aptitudeFloor;
  const competence = actor.model.capability * (floor + (1 - floor) * task.aiAptitude);
  return clamp(competence - taskRisk(task), min, max);
}

/** AI が minutes 分作業したときの費用（円） */
export function aiCost(minutes: number, model: ModelDef): number {
  return minutes * model.costPerMinute;
}

/** 人間が minutes 分働いたときの人件費（円） */
export function laborCost(minutes: number, hourlyWage: number): number {
  return (minutes / MINUTES_PER_HOUR) * hourlyWage;
}

/** レビューで失敗が見つかったときの手戻りにかかる人間の時間（分） */
export function reworkMinutes(task: TaskDef, skill: number): number {
  return (task.effort * balance.assign.reworkShare) / skill;
}

/** 自動テストで失敗が見つかったときに AI が修復する時間（分）。手戻りと同じ量を AI の速度で処理する */
export function repairMinutes(task: TaskDef, model: ModelDef): number {
  return (task.effort * balance.assign.reworkShare) / model.speed;
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
 * 修復が balance.harness.maxRepairLoops 回に達したら、残った失敗のまま抜ける。シミュレーション（core/taskFlow.ts）と同じ流れの期待値
 */
export function evalLoop(p: number, catchRate: number): EvalLoopOutcome {
  if (catchRate <= 0) return { defect: 1 - p, evalRuns: 0, repairs: 0 };
  let mass = 1;
  let d = 1 - p;
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

/**
 * 人間の拘束時間の見込み（分）。モードの人間の工程の合計に、
 * 人間のレビューでは、それまでに残っている失敗の確率 × 手戻り時間を足す。
 * AI の自動テストは失敗を見つけて AI が直すので、それ以降に残る失敗はなくなる（連鎖による指示出しの省略は考えない）。
 * aiSuccess で AI の作業の成功確率を補正できる（Context と Harness の影響。core/contextWork.ts・core/harness.ts）。
 * harness を渡すと、指示出しと確認の時間を補正し、AI の作業の後の自動検証（Eval のループ）で残る失敗を減らす。
 */
export function expectedHumanMinutes(
  task: TaskDef,
  mode: AssignModeDef,
  skill: number,
  model: ModelDef,
  aiSuccess: (p: number) => number = (p) => p,
  harness: HumanTimeHarness = NO_HARNESS,
): number {
  const human: ActorProfile = { kind: 'human', skill };
  const ai: ActorProfile = { kind: 'ai', model };
  let minutes = 0;
  let pAllOk = 1;
  for (const step of mode.steps) {
    if (step.actor === 'human') {
      const m = stepMinutes(task, step, human);
      minutes += isIntervention(step) && harness.humanTime !== 1 ? m * harness.humanTime : m;
    }
    if (step.phase === 'work') {
      const p = step.actor === 'human' ? successProbability(task, human) : aiSuccess(successProbability(task, ai));
      pAllOk *= step.actor === 'ai' && harness.evalCatch > 0 ? 1 - evalLoop(p, harness.evalCatch).defect : p;
    }
    if (step.phase !== 'review') continue;
    if (step.actor === 'human') minutes += (1 - pAllOk) * reworkMinutes(task, skill);
    pAllOk = 1;
  }
  return minutes;
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

/** 納期（ゲーム内の分、案件開始からの経過） */
export function deadlineMinutes(project: ProjectDef): number {
  return project.deadlineDays * balance.project.minutesPerBusinessDay;
}

/** 遅延損失（円）。納期を超えた営業日数（端数も比例）× 売上 × 1日あたりの損失率 */
export function delayLoss(elapsedMinutes: number, project: ProjectDef): number {
  const lateDays = Math.max(0, elapsedMinutes - deadlineMinutes(project)) / balance.project.minutesPerBusinessDay;
  return lateDays * project.revenue * balance.project.delayLossPerDay;
}
