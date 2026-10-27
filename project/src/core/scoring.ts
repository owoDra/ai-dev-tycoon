import { getAssignMode } from '../content/assignModes';
import { balance } from '../content/balance';
import { getProject } from '../content/index';
import { delayLoss, escapedDefectCost, escapedFixMinutes, perPersonDay, laborCost as wageCost } from './formulas';
import type { GameState } from './state';

/** 案件のスコア（企画書22章）。金額は円、時間はゲーム内の分 */
export interface ProjectScore {
  /** 売上。納品（全 Task 完了）までは 0 */
  readonly revenue: number;
  readonly laborCost: number;
  readonly aiCost: number;
  /** 見逃した失敗が納品後に起こす手戻りの費用（損害＋修正の人件費）。レビューで見つけた手戻りは人件費に含まれる */
  readonly reworkCost: number;
  /** Harness 部品の導入コスト（案件の期間中に払ったもの） */
  readonly harnessCost: number;
  /** 事故（権限・Tool の誤用）の損害 */
  readonly accidentCost: number;
  readonly delayLoss: number;
  readonly profit: number;
  /** 人間の総稼働時間（分）。見逃した失敗を納品後に直す時間を含む */
  readonly humanMinutes: number;
  /** 見逃した失敗を納品後に直す人間の時間（分） */
  readonly aftercareMinutes: number;
  /** メイン KPI。利益 ÷ 人間の総稼働（人日）。人間が稼働していなければ 0 */
  readonly profitPerPersonDay: number;
  /** AI が関わる Task に人間が費やした時間（指示出し・レビュー・手戻り） */
  readonly humanIntervention: number;
  /** AI が人間なしで処理した時間 */
  readonly autonomousTime: number;
  /** AI が関わる Task に人間が介入した回数（指示出し・確認・手戻りの工程に入った回数） */
  readonly interventions: number;
  /** 人間の介入間隔の平均（分）。AI が人間なしで処理した時間 ÷ 介入の回数（介入がなければ自律時間そのもの） */
  readonly interventionInterval: number;
  /** 事故の数 */
  readonly accidents: number;
  /** AI が関わって完了した Task 1件あたりの事故の数 */
  readonly accidentRate: number;
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
  let interventions = 0;
  let accidents = 0;
  for (const task of def.tasks) {
    const t = run.tasks[task.id];
    if (!t) continue;
    const usesAi = t.assignment !== null && getAssignMode(t.assignment.mode).steps.some((s) => s.actor === 'ai');
    laborCost += t.laborCost;
    aiCost += t.aiCost;
    humanMinutes += t.humanMinutes;
    autonomousTime += t.aiMinutes;
    if (usesAi) humanIntervention += t.humanMinutes;
    interventions += t.interventions;
    accidents += t.accidents;
    if (t.escaped) {
      const fix = escapedFixMinutes(task);
      aftercareMinutes += fix;
      reworkCost += escapedDefectCost(task) + wageCost(fix, balance.score.escapedFixDailyCost);
    }
    if (t.status !== 'done') continue;
    doneCount++;
    if (t.reworks > 0 || t.escaped) reworked++;
    if (usesAi) aiWorks++;
    qualitySum += (t.quality ?? 0) * task.effort;
    effortSum += task.effort;
  }

  humanMinutes += aftercareMinutes;
  const revenue = completed ? run.revenue : 0;
  const delay = delayLoss(elapsedMinutes, run);
  const end = run.completedAt ?? state.clock;
  const harnessCost = state.harnessLedger
    .filter((e) => e.at >= run.startedAt && e.at <= end)
    .reduce((sum, e) => sum + e.cost, 0);
  const accidentCost = accidents * balance.harness.accidentCost;
  const profit = revenue - laborCost - aiCost - reworkCost - harnessCost - accidentCost - delay;
  return {
    revenue,
    laborCost,
    aiCost,
    reworkCost,
    harnessCost,
    accidentCost,
    delayLoss: delay,
    profit,
    humanMinutes,
    aftercareMinutes,
    profitPerPersonDay: perPersonDay(profit, humanMinutes),
    humanIntervention,
    autonomousTime,
    interventions,
    interventionInterval: interventions > 0 ? autonomousTime / interventions : autonomousTime,
    accidents,
    accidentRate: aiWorks > 0 ? accidents / aiWorks : 0,
    reworkRate: doneCount > 0 ? reworked / doneCount : 0,
    aiCostPerWork: aiWorks > 0 ? aiCost / aiWorks : 0,
    quality: effortSum > 0 ? qualitySum / effortSum : 1,
    elapsedMinutes,
    completed,
  };
}

/** 会社全体のスコア（複数の案件と、案件をまたぐ固定費）。金額は円、時間はゲーム内の分 */
export interface CompanyScore {
  /** 納品した案件の数 */
  readonly delivered: number;
  /** 始めた案件の利益の合計（Harness 部品の導入コストを除く） */
  readonly projectProfit: number;
  /** Harness 部品の導入コストの合計（同時に進めた案件で重複して数えない） */
  readonly harnessCost: number;
  /** Seat の固定費（日割り） */
  readonly seatCost: number;
  /** 採用の契約金 */
  readonly hireCost: number;
  /** 待機中の社員の給与（日割り） */
  readonly idleCost: number;
  /** 会社の利益 = 案件の利益の合計 − 導入コスト − Seat の固定費 − 契約金 − 待機中の給与 */
  readonly profit: number;
  /** 人間の総稼働時間（分） */
  readonly humanMinutes: number;
  /** 会社の Profit / Person-Day（利益 ÷ 人間の総稼働の人日） */
  readonly profitPerPersonDay: number;
}

/**
 * 会社全体のスコア。案件ごとのスコア（scoreProject）を合計し、案件をまたぐ費用（Seat の固定費・採用の契約金・待機中の給与と、
 * 同時に進めた案件で重なって数えられうる Harness 部品の導入コスト）は会社として1回だけ引く
 */
export function scoreCompany(state: GameState): CompanyScore {
  let projectProfit = 0;
  let humanMinutes = 0;
  let delivered = 0;
  for (const projectId of Object.keys(state.projects)) {
    const s = scoreProject(state, projectId);
    if (!s) continue;
    projectProfit += s.profit + s.harnessCost;
    humanMinutes += s.humanMinutes;
    if (s.completed) delivered++;
  }
  const harnessCost = state.harnessLedger.reduce((sum, e) => sum + e.cost, 0);
  const profit = projectProfit - harnessCost - state.seatCost - state.hireCost - state.idleCost;
  return {
    delivered,
    projectProfit,
    harnessCost,
    seatCost: state.seatCost,
    hireCost: state.hireCost,
    idleCost: state.idleCost,
    profit,
    humanMinutes,
    profitPerPersonDay: perPersonDay(profit, humanMinutes),
  };
}
