import { getAssignMode } from '../content/assignModes';
import { balance } from '../content/balance';
import { aiWorkers, content, getProject } from '../content/index';
import type { AssignModeId } from '../content/types';
import { autonomyOf } from '../core/autonomy';
import { calendarDay, minuteOfDay } from '../core/clock';
import { reduce } from '../core/commands';
import { contractOf } from '../core/contract';
import { expectTask } from '../core/expectation';
import {
  dailyCost,
  deadlineMinutes,
  escapedDefectCost,
  escapedFixMinutes,
  laborCost,
  monthlyPace,
  perPersonDay,
} from '../core/formulas';
import { type ProjectScore, scoreProject } from '../core/scoring';
import { createInitialState, type GameState } from '../core/state';
import { currentStep } from '../core/taskFlow';
import { teamMembers } from '../core/team';
import { MINUTES_PER_HOUR } from '../core/units';
import { ja } from '../i18n/ja';

/** 担当が決まっていない Task は、見込みの計算では人間が担当するものとみなす */
const FALLBACK_MODE: AssignModeId = 'human';

/** 1か月に人間1人が働く時間（h）。月の利益ペースの式の表示に使う */
export const MONTH_HOURS = (balance.score.workDaysPerMonth * balance.project.minutesPerPersonDay) / MINUTES_PER_HOUR;

/** 月の利益ペースの求め方（利益 ÷ 人間の時間 × 1か月の時間） */
export const paceFormula = (profit: number, humanMinutes: number) =>
  ja.hud.paceFormula(ja.funds.money(profit), (humanMinutes / MINUTES_PER_HOUR).toFixed(1), MONTH_HOURS);

/** 利益 / 人日 を「月○万円/人」（人間1人が1か月働いた場合の利益）で表す */
export const paceText = (profitPerPersonDay: number) => ja.hud.pace(ja.funds.money(monthlyPace(profitPerPersonDay)));

export interface HudView {
  /** Profit / Person-Day。納品前は見込み（projectedProfitPerPersonDay）、納品後は確定値（core の scoreProject と同じ） */
  readonly profitPerPersonDay: number;
  /** profitPerPersonDay・projectedProfit が見込みか（納品前） */
  readonly projected: boolean;
  /** この案件にここまで使った金額（円）。人件費・AI 費用・運営の費用・導入コスト・事故と見逃しの損害・期限切れの損失は評判と企業価値で受ける */
  readonly spent: number;
  /** 受注額（円）。納品すると売上になる */
  readonly revenue: number;
  /** 利益（円）。納品前は今の担当のまま最後まで進めた見込み、納品後は確定値 */
  readonly projectedProfit: number;
  /** 納期までの残り。超過していれば overdue（炎上中）で、days と time は超過分。strict は期限厳守の契約（切れたら打ち切り） */
  readonly remaining: {
    readonly days: number;
    readonly time: string;
    readonly overdue: boolean;
    readonly strict: boolean;
  };
  /** 今日の日付（1日目から）と時刻 */
  readonly today: { readonly day: number; readonly time: string };
  /** 作業中の人間の割合（0〜1） */
  readonly human: number;
  /** AI が関わる実行中の Task のうち、AI が作業している割合（0〜1） */
  readonly ai: number;
  readonly completed: boolean;
  /** AI Worker の Autonomy Streak（企画書23章）。HUD の小さなメーター */
  readonly streak: StreakView;
}

/** Autonomy Streak のメーター */
export interface StreakView {
  /** 今の Streak（分） */
  readonly minutes: number;
  /** 次の節目（分）。すべて越えていれば null */
  readonly next: number | null;
  /** 前の節目から次の節目までの進み具合（0〜1） */
  readonly progress: number;
  /** 越えた節目の数。1 以上で「燃え上がる」 */
  readonly level: number;
}

/** AI Worker の Autonomy Streak のメーター（AI Worker がいなければ 0 のまま） */
export function streakView(state: GameState, workerId: string = aiWorkers[0]?.id ?? ''): StreakView {
  const minutes = autonomyOf(state, workerId).streak;
  const thresholds = balance.autonomy.milestones;
  const level = thresholds.filter((t) => minutes >= t).length;
  const next = thresholds[level] ?? null;
  const prev = level > 0 ? (thresholds[level - 1] ?? 0) : 0;
  return { minutes, next, progress: next === null ? 1 : (minutes - prev) / (next - prev), level };
}

export const hhmm = (minutes: number) => {
  const m = Math.floor(minutes);
  return `${Math.floor(m / MINUTES_PER_HOUR)}:${String(m % MINUTES_PER_HOUR).padStart(2, '0')}`;
};

/** HUD に常時表示する値（純粋関数）。案件が始まっていなければ null */
export function hudView(state: GameState, projectId: string): HudView | null {
  const run = state.projects[projectId];
  const score = scoreProject(state, projectId);
  if (!run || !score) return null;
  const perDay = balance.time.minutesPerDay;

  const outlook = score.completed
    ? { profit: score.profit, humanMinutes: score.humanMinutes }
    : projectedOutlook(state, projectId, score);
  const profitPerPersonDay = score.completed
    ? score.profitPerPersonDay
    : perPersonDay(outlook.profit, outlook.humanMinutes);

  const elapsed = score.elapsedMinutes;
  const left = deadlineMinutes(run) - elapsed;
  const span = Math.abs(left);

  const humans = teamMembers(state);
  let humanBusy = 0;
  for (const h of humans) {
    const head = state.humanQueues[h.id]?.[0];
    if (head) humanBusy++;
  }
  let aiTasks = 0;
  let aiBusy = 0;
  for (const t of Object.values(run.tasks)) {
    if (t.status !== 'running' || !t.assignment) continue;
    if (!getAssignMode(t.assignment.mode).steps.some((s) => s.actor === 'ai')) continue;
    aiTasks++;
    if (t.phase !== 'rework' && currentStep(t)?.actor === 'ai') aiBusy++;
  }

  return {
    profitPerPersonDay,
    projected: !score.completed,
    spent: score.revenue - score.profit,
    revenue: run.revenue,
    projectedProfit: outlook.profit,
    remaining: {
      days: Math.floor(span / perDay),
      time: hhmm(span % perDay),
      overdue: left < 0,
      strict: contractOf(projectId) === 'strict',
    },
    today: { day: calendarDay(state.clock) + 1, time: hhmm(minuteOfDay(state.clock)) },
    human: humans.length > 0 ? humanBusy / humans.length : 0,
    ai: aiTasks > 0 ? aiBusy / aiTasks : 0,
    completed: score.completed,
    streak: streakView(state),
  };
}

/**
 * 納品したときの Profit / Person-Day の見込み。今の担当のまま最後まで進めたと考え、
 * 完了した Task は実績、残りの Task は期待値（人間の工程の時間・AI の作業時間・レビューがなければ見逃しの損害と修正時間）で数える。
 * 担当が決まっていない Task は人間が担当するものとみなすので、AI に任せると見込みがすぐに動く。
 * 人間の原価はメンバーの平均、AI は担当の AI Worker の Harness（Model と部品）で見積もる（core/expectation.ts）。遅延損失はここまでの分だけを入れる。
 * 資料のある案件では、AI の作業の成功確率・所要時間・費用に今の Context（Session と発生中の事件）の影響を入れる
 * （シミュレーションと同じ core/contextWork.ts の式。Session の履歴がこの先さらに溜まる分は入れない）
 */
export function projectedProfitPerPersonDay(state: GameState, projectId: string, score: ProjectScore): number {
  const { profit, humanMinutes } = projectedOutlook(state, projectId, score);
  return perPersonDay(profit, humanMinutes);
}

/** 納品したときの利益（円）と人間の総稼働（分）の見込み。数え方は projectedProfitPerPersonDay のとおり */
function projectedOutlook(
  state: GameState,
  projectId: string,
  score: ProjectScore,
): { readonly profit: number; readonly humanMinutes: number } {
  const def = getProject(projectId);
  const run = state.projects[projectId];
  const ai = content.workers.find((w) => w.kind === 'ai');
  const humans = teamMembers(state);
  if (!run || !ai || humans.length === 0) return { profit: 0, humanMinutes: 0 };
  const wage = humans.reduce((sum, h) => sum + dailyCost(h), 0) / humans.length;
  const skill = humans.reduce((sum, h) => sum + h.skill, 0) / humans.length;

  let human = score.aftercareMinutes;
  let cost = score.reworkCost + score.harnessCost + score.accidentCost;
  for (const task of def.tasks) {
    const t = run.tasks[task.id];
    if (!t) continue;
    if (t.status === 'done') {
      human += t.humanMinutes;
      cost += t.laborCost + t.aiCost;
      continue;
    }
    const mode = getAssignMode(t.assignment?.mode ?? FALLBACK_MODE);
    const workerId = t.assignment?.workerId ?? ai.id;
    const e = expectTask(state, projectId, task, mode, workerId, skill);
    const fix = e.pEscape * escapedFixMinutes(task);
    human += Math.max(t.humanMinutes, e.humanMinutes) + fix;
    cost +=
      Math.max(t.laborCost, laborCost(e.humanMinutes, wage)) +
      Math.max(t.aiCost, e.aiCost) +
      e.accidentCost +
      e.pEscape * escapedDefectCost(task) +
      laborCost(fix, balance.score.escapedFixDailyCost);
  }
  return { profit: run.revenue - cost, humanMinutes: human };
}

/**
 * 案件を人間だけで進めた場合の Profit / Person-Day の見込み（開始直後の HUD と同じ値）。
 * 結果画面で「人間だけの見込み → 結果」の伸びを示すのに使う
 */
export function baselineProfitPerPersonDay(projectId: string): number {
  const state = reduce(createInitialState(projectId), { type: 'StartProject', projectId }).state;
  const score = scoreProject(state, projectId);
  return score ? projectedProfitPerPersonDay(state, projectId, score) : 0;
}
