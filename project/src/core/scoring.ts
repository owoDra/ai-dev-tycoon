import { getAssignMode } from '../content/assignModes';
import { balance } from '../content/balance';
import { getProject } from '../content/index';
import { delayLoss, escapedDefectCost, escapedFixMinutes, laborCost as wageCost } from './formulas';
import type { GameState } from './state';
import { MINUTES_PER_HOUR } from './units';

/** 案件のスコア（企画書22章）。金額は円、時間はゲーム内の分 */
export interface ProjectScore {
  /** 売上。納品（全 Task 完了）までは 0 */
  readonly revenue: number;
  readonly laborCost: number;
  readonly aiCost: number;
  /** 見逃した失敗が納品後に起こす手戻りの費用（損害＋修正の人件費）。レビューで見つけた手戻りは人件費に含まれる */
  readonly reworkCost: number;
  readonly delayLoss: number;
  readonly profit: number;
  /** 人間の総稼働時間（分）。見逃した失敗を納品後に直す時間を含む */
  readonly humanMinutes: number;
  /** 見逃した失敗を納品後に直す人間の時間（分） */
  readonly aftercareMinutes: number;
  /** メイン KPI。利益 ÷ 人間の総稼働時間（時間）。人間が稼働していなければ 0 */
  readonly profitPerHumanHour: number;
  /** AI が関わる Task に人間が費やした時間（指示出し・レビュー・手戻り） */
  readonly humanIntervention: number;
  /** AI が人間なしで処理した時間 */
  readonly autonomousTime: number;
  /** 完了した Task のうち、失敗して手戻りが発生した（レビューで発見 or 見逃し）割合 */
  readonly reworkRate: number;
  /** AI が関わって完了した Task 1件あたりの AI 費用 */
  readonly aiCostPerWork: number;
  /** 完了した Task の品質の、作業量による加重平均（0〜1）。完了した Task がなければ 1 */
  readonly quality: number;
  /** 案件開始からの経過時間（納品済みなら納品まで） */
  readonly elapsedMinutes: number;
  readonly completed: boolean;
}

/** 案件のスコアを state から算出する。未開始の案件は null */
export function scoreProject(state: GameState, projectId: string): ProjectScore | null {
  const run = state.projects[projectId];
  if (!run) return null;
  const def = getProject(projectId);
  const completed = run.completedAt !== null;
  const elapsedMinutes = (run.completedAt ?? state.clock) - run.startedAt;

  let laborCost = 0;
  let aiCost = 0;
  let reworkCost = 0;
  let humanMinutes = 0;
  let aftercareMinutes = 0;
  let humanIntervention = 0;
  let autonomousTime = 0;
  let doneCount = 0;
  let reworked = 0;
  let aiWorks = 0;
  let qualitySum = 0;
  let effortSum = 0;
  for (const task of def.tasks) {
    const t = run.tasks[task.id];
    if (!t) continue;
    const usesAi = t.assignment !== null && getAssignMode(t.assignment.mode).steps.some((s) => s.actor === 'ai');
    laborCost += t.laborCost;
    aiCost += t.aiCost;
    humanMinutes += t.humanMinutes;
    autonomousTime += t.aiMinutes;
    if (usesAi) humanIntervention += t.humanMinutes;
    if (t.escaped) {
      const fix = escapedFixMinutes(task);
      aftercareMinutes += fix;
      reworkCost += escapedDefectCost(task) + wageCost(fix, balance.score.escapedFixHourlyWage);
    }
    if (t.status !== 'done') continue;
    doneCount++;
    if (t.reworks > 0 || t.escaped) reworked++;
    if (usesAi) aiWorks++;
    qualitySum += (t.quality ?? 0) * task.effort;
    effortSum += task.effort;
  }

  humanMinutes += aftercareMinutes;
  const revenue = completed ? def.revenue : 0;
  const delay = delayLoss(elapsedMinutes, def);
  const profit = revenue - laborCost - aiCost - reworkCost - delay;
  return {
    revenue,
    laborCost,
    aiCost,
    reworkCost,
    delayLoss: delay,
    profit,
    humanMinutes,
    aftercareMinutes,
    profitPerHumanHour: humanMinutes > 0 ? profit / (humanMinutes / MINUTES_PER_HOUR) : 0,
    humanIntervention,
    autonomousTime,
    reworkRate: doneCount > 0 ? reworked / doneCount : 0,
    aiCostPerWork: aiWorks > 0 ? aiCost / aiWorks : 0,
    quality: effortSum > 0 ? qualitySum / effortSum : 1,
    elapsedMinutes,
    completed,
  };
}
