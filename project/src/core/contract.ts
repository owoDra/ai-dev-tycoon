import { balance } from '../content/balance';
import { getProject } from '../content/index';
import type { ContractKind } from '../content/types';
import type { GameEvent } from './events';
import type { CancelReason, GameState, ProjectRun } from './state';
import type { System } from './system';

/*
 * 案件の契約と期限（企画書の「納期」）。期限は受注した時刻から deadlineDays 営業日後。
 * - 期限厳守（strict）：期限が切れたらその場で打ち切る。入金はない（かかった費用は戻らない）
 * - 炎上しても続行（lenient）：期限が切れたら炎上案件になり、作業を続ける。納品すれば元の売上が入るが、延びた日数の人件費は自腹
 * 期限切れのたびに評判と企業価値が下がる。会社側から打ち切ることもでき、そのときは期限切れより大きく下がる（balance.contract）。
 */

/** 案件の契約（定義になければ炎上しても続行） */
export const contractOf = (projectId: string): ContractKind => getProject(projectId).contract ?? 'lenient';

/** 期限（ゲーム内時刻、分） */
export const deadlineAt = (run: ProjectRun) => run.startedAt + run.deadlineDays * balance.time.minutesPerDay;

/** 納品した案件か（打ち切った案件は終わっているが、納品していない） */
export const isDelivered = (run: ProjectRun) => run.completedAt !== null && run.cancelled === null;

/** 評判と企業価値を下げる。amount は下げる理由ごとの係数を掛ける元（売上） */
function blame(
  state: GameState,
  projectId: string,
  kind: 'burning' | CancelReason,
  emit: (e: GameEvent) => void,
): GameState {
  const c = balance.contract;
  const r = balance.reputation;
  const revenue = state.projects[projectId]?.revenue ?? 0;
  const reputation = Math.max(r.min, state.reputation - c.reputation[kind]);
  if (state.board) emit({ type: 'ReputationChanged', projectId, delta: reputation - state.reputation, reputation });
  return {
    ...state,
    reputation: state.board ? reputation : state.reputation,
    valuationHit: state.valuationHit + revenue * c.valuation[kind],
  };
}

/**
 * 案件を打ち切る。担当している人間の仕事から外し、終わっていない Task は止める（completedAt に打ち切った時刻を入れる）。
 * 始めていない・終わった案件なら何もしない
 */
export function cancelProject(
  state: GameState,
  projectId: string,
  reason: CancelReason,
  emit: (e: GameEvent) => void,
): GameState {
  const run = state.projects[projectId];
  if (!run || run.completedAt !== null) return state;
  const humanQueues = Object.fromEntries(
    Object.entries(state.humanQueues).map(([id, queue]) => [id, queue.filter((q) => q.projectId !== projectId)]),
  );
  const cancelled: ProjectRun = { ...run, completedAt: state.clock, cancelled: reason };
  emit({ type: 'ProjectCancelled', projectId, reason });
  return blame(
    { ...state, humanQueues, projects: { ...state.projects, [projectId]: cancelled } },
    projectId,
    reason,
    emit,
  );
}

/**
 * 期限を見張る。期限を過ぎた案件は、期限厳守なら打ち切り、そうでなければ炎上させる（どちらも1回だけ）。
 * 営業日が変わったら、失った企業価値を少し戻す
 */
export const contractSystem: System = (state, ctx) => {
  let next = state;
  if (state.clock % balance.time.minutesPerDay === 0 && state.valuationHit > 0) {
    const hit = state.valuationHit * (1 - balance.contract.recovery);
    next = { ...next, valuationHit: hit < 1 ? 0 : hit };
  }
  for (const run of Object.values(state.projects)) {
    if (run.completedAt !== null || run.burningAt !== null || state.clock < deadlineAt(run)) continue;
    if (contractOf(run.projectId) === 'strict') {
      next = cancelProject(next, run.projectId, 'expired', ctx.emit);
      continue;
    }
    const burning: ProjectRun = { ...run, burningAt: state.clock };
    ctx.emit({ type: 'ProjectBurning', projectId: run.projectId });
    next = blame(
      { ...next, projects: { ...next.projects, [run.projectId]: burning } },
      run.projectId,
      'burning',
      ctx.emit,
    );
  }
  return next;
};
