import { getAssignMode } from '../content/assignModes';
import { balance } from '../content/balance';
import { content, getModel, getProject, humans } from '../content/index';
import type { AssignModeId } from '../content/types';
import { reduce } from '../core/commands';
import {
  aiCost,
  deadlineMinutes,
  escapedDefectCost,
  escapedFixMinutes,
  expectedHumanMinutes,
  laborCost,
  stepMinutes,
  successProbability,
} from '../core/formulas';
import { type ProjectScore, scoreProject } from '../core/scoring';
import { createInitialState, type GameState } from '../core/state';
import { currentStep } from '../core/taskFlow';
import { MINUTES_PER_HOUR } from '../core/units';

/** 担当が決まっていない Task は、見込みの計算では人間が担当するものとみなす */
const FALLBACK_MODE: AssignModeId = 'human';

/** 営業日の始業時刻（ゲーム内の分、0:00 から）。1営業日（balance.project.minutesPerBusinessDay）をこの時刻から数える */
export const WORKDAY_START_MINUTES = 9 * MINUTES_PER_HOUR;

export interface HudView {
  /** Profit / Human Hour。納品前は見込み（projectedProfitPerHumanHour）、納品後は確定値（core の scoreProject と同じ） */
  readonly profitPerHumanHour: number;
  /** profitPerHumanHour が見込みか（納品前） */
  readonly projected: boolean;
  /** 納期までの残り。超過していれば overdue で、days と time は超過分 */
  readonly remaining: { readonly days: number; readonly time: string; readonly overdue: boolean };
  /** 今日が案件の何営業日目か（1から）と時刻 */
  readonly today: { readonly day: number; readonly time: string };
  /** 作業中の人間の割合（0〜1） */
  readonly human: number;
  /** AI が関わる実行中の Task のうち、AI が作業している割合（0〜1） */
  readonly ai: number;
  readonly completed: boolean;
}

const hhmm = (minutes: number) => {
  const m = Math.floor(minutes);
  return `${Math.floor(m / MINUTES_PER_HOUR)}:${String(m % MINUTES_PER_HOUR).padStart(2, '0')}`;
};

/** HUD に常時表示する値（純粋関数）。案件が始まっていなければ null */
export function hudView(state: GameState, projectId: string): HudView | null {
  const run = state.projects[projectId];
  const score = scoreProject(state, projectId);
  if (!run || !score) return null;
  const def = getProject(projectId);
  const perDay = balance.project.minutesPerBusinessDay;

  const profitPerHumanHour = score.completed
    ? score.profitPerHumanHour
    : projectedProfitPerHumanHour(state, projectId, score);

  const elapsed = score.elapsedMinutes;
  const left = deadlineMinutes(def) - elapsed;
  const span = Math.abs(left);

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
    profitPerHumanHour,
    projected: !score.completed,
    remaining: { days: Math.floor(span / perDay), time: hhmm(span % perDay), overdue: left < 0 },
    today: { day: Math.floor(elapsed / perDay) + 1, time: hhmm(WORKDAY_START_MINUTES + (elapsed % perDay)) },
    human: humans.length > 0 ? humanBusy / humans.length : 0,
    ai: aiTasks > 0 ? aiBusy / aiTasks : 0,
    completed: score.completed,
  };
}

/**
 * 納品したときの Profit / Human Hour の見込み。今の担当のまま最後まで進めたと考え、
 * 完了した Task は実績、残りの Task は期待値（人間の工程の時間・AI の作業時間・レビューがなければ見逃しの損害と修正時間）で数える。
 * 担当が決まっていない Task は人間が担当するものとみなすので、AI に任せると見込みがすぐに動く。
 * 人間の時給はメンバーの平均、AI は最初の AI Worker の Model で見積もる。遅延損失はここまでの分だけを入れる
 */
export function projectedProfitPerHumanHour(state: GameState, projectId: string, score: ProjectScore): number {
  const def = getProject(projectId);
  const run = state.projects[projectId];
  const ai = content.workers.find((w) => w.kind === 'ai');
  if (!run || !ai || humans.length === 0) return 0;
  const model = getModel(ai.modelId);
  const wage = humans.reduce((sum, h) => sum + h.hourlyWage, 0) / humans.length;
  const skill = humans.reduce((sum, h) => sum + h.skill, 0) / humans.length;

  let human = score.aftercareMinutes;
  let cost = score.reworkCost + score.delayLoss;
  for (const task of def.tasks) {
    const t = run.tasks[task.id];
    if (!t) continue;
    if (t.status === 'done') {
      human += t.humanMinutes;
      cost += t.laborCost + t.aiCost;
      continue;
    }
    const mode = getAssignMode(t.assignment?.mode ?? FALLBACK_MODE);
    const expHuman = expectedHumanMinutes(task, mode, skill, model);
    const expAi = mode.steps
      .filter((s) => s.actor === 'ai')
      .reduce((sum, s) => sum + stepMinutes(task, s, { kind: 'ai', model }), 0);
    let pOk = 1;
    for (const s of mode.steps) {
      if (s.phase === 'work')
        pOk *= successProbability(task, s.actor === 'ai' ? { kind: 'ai', model } : { kind: 'human', skill });
    }
    const pEscape = mode.steps.some((s) => s.phase === 'review') ? 0 : 1 - pOk;
    const fix = pEscape * escapedFixMinutes(task);
    human += Math.max(t.humanMinutes, expHuman) + fix;
    cost +=
      Math.max(t.laborCost, laborCost(expHuman, wage)) +
      Math.max(t.aiCost, aiCost(expAi, model)) +
      pEscape * escapedDefectCost(task) +
      laborCost(fix, balance.score.escapedFixHourlyWage);
  }
  const hours = human / MINUTES_PER_HOUR;
  return hours > 0 ? (def.revenue - cost) / hours : 0;
}

/**
 * 案件を人間だけで進めた場合の Profit / Human Hour の見込み（開始直後の HUD と同じ値）。
 * 結果画面で「人間だけの見込み → 結果」の伸びを示すのに使う
 */
export function baselineProfitPerHumanHour(projectId: string): number {
  const state = reduce(createInitialState(projectId), { type: 'StartProject', projectId }).state;
  const score = scoreProject(state, projectId);
  return score ? projectedProfitPerHumanHour(state, projectId, score) : 0;
}
