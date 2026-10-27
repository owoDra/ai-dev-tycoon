import { balance } from '../content/balance';
import type { AutonomyRun, GameState } from './state';
import type { System, SystemContext } from './system';
import { isAiWorking } from './taskFlow';
import { usageSpeed } from './team';

/*
 * Autonomy（企画書23章「Human-Free Time」）。人間が介入せずに AI が処理を続けた時間を Streak として数える。
 * Streak は、AI Worker がどれかの仕事を処理している間だけ伸び（人間の手が空くのを待っている間は伸びも途切れもしない）、
 * 人間の指示出し・確認・手戻りが入ると途切れる。途切れた Streak が「人間の介入間隔」になる。
 */

export const EMPTY_AUTONOMY: AutonomyRun = { streak: 0, milestones: 0, intervals: 0, intervalTotal: 0, longest: 0 };

export function autonomyOf(state: GameState, workerId: string): AutonomyRun {
  return state.autonomy[workerId] ?? EMPTY_AUTONOMY;
}

function setAutonomy(state: GameState, workerId: string, run: AutonomyRun): GameState {
  return { ...state, autonomy: { ...state.autonomy, [workerId]: run } };
}

/** 人間の介入間隔の要約（分） */
export interface AutonomySummary {
  /** 平均。介入がまだなければ今の Streak */
  readonly average: number;
  /** 最長（今の Streak を含む） */
  readonly longest: number;
  readonly current: number;
}

export function autonomySummary(state: GameState, workerId: string): AutonomySummary {
  const a = autonomyOf(state, workerId);
  return {
    average: a.intervals > 0 ? a.intervalTotal / a.intervals : a.streak,
    longest: a.longest,
    current: a.streak,
  };
}

/**
 * 人間が AI Worker の仕事に介入した（指示出し・確認・手戻りの工程に入った）。Streak を介入間隔として記録し、0 に戻す。
 * AI がまだ何も処理していなければ（指示出しの直後の確認など）、間隔としては数えない
 */
export function intervene(state: GameState, workerId: string): GameState {
  const a = autonomyOf(state, workerId);
  if (a.streak <= 0) return a.milestones === 0 ? state : setAutonomy(state, workerId, { ...a, milestones: 0 });
  return setAutonomy(state, workerId, {
    streak: 0,
    milestones: 0,
    intervals: a.intervals + 1,
    intervalTotal: a.intervalTotal + a.streak,
    longest: Math.max(a.longest, a.streak),
  });
}

/** AI Worker がどれかの仕事を処理しているか */
function isWorking(state: GameState, workerId: string): boolean {
  for (const project of Object.values(state.projects)) {
    if (project.completedAt !== null) continue;
    for (const run of Object.values(project.tasks)) {
      if (run.assignment?.workerId === workerId && isAiWorking(run)) return true;
    }
  }
  return false;
}

/** Streak を1ステップ分伸ばし、しきい値を越えたら AutonomyMilestone を出す（同じ Streak で同じしきい値は1回だけ） */
function advance(state: GameState, workerId: string, ctx: SystemContext): GameState {
  const a = autonomyOf(state, workerId);
  // Seat の使用量の上限で遅くなっている間は、進んだ分だけを数える（遅いほど Streak が伸びる、にしない）
  const streak = a.streak + balance.time.tickMinutes * usageSpeed(state, workerId);
  const thresholds = balance.autonomy.milestones;
  let milestones = a.milestones;
  for (let t = thresholds[milestones]; t !== undefined && streak >= t; t = thresholds[++milestones]) {
    ctx.emit({ type: 'AutonomyMilestone', workerId, minutes: t });
  }
  return setAutonomy(state, workerId, { ...a, streak, milestones, longest: Math.max(a.longest, streak) });
}

/** AI Worker が仕事を処理している間、Streak を伸ばす */
export const autonomySystem: System = (state, ctx) => {
  let next = state;
  for (const id of state.agents) {
    if (isWorking(next, id)) next = advance(next, id, ctx);
  }
  return next;
};
