import { balance } from '../content/balance';
import { getHuman } from '../content/index';
import { humansAtWork } from './clock';
import { dailyCost, laborCost, multitaskShare } from './formulas';
import { type GameState, updateTask } from './state';
import type { System } from './system';
import { finishStep } from './taskFlow';
import { companyOpen } from './team';
import { managingNow } from './teams';

/**
 * 人間の担当している仕事（state.humanQueues）。人間は担当している工程をすべて同時に進めるが、掛け持ちするほど1件あたりの進み方が落ちる
 * （core/formulas.ts の multitaskShare）。工程を終えたら担当から外し、Task の次の工程へ進める。
 * 社員の給与は在籍しているだけでかかる：作業した人の分は担当している Task に等分して人件費に、担当がなく作業しなかった人の分は
 * 会社の待機中の給与（state.idleCost。会社が営業しているときだけ。core/team.ts の companyOpen）に計上する。
 * 案件を運営している人間 PM の給与は、案件の運営の費用（core/teams.ts の managementSystem）に計上する。
 * 人間は勤務時間（core/clock.ts）の外は帰っていて、作業も給与の計上もしない（工程は翌朝まで待つ）。
 */
export const humanQueueSystem: System = (state, ctx) => {
  if (!humansAtWork(state.clock)) return state;
  const tick = balance.time.tickMinutes;
  let next: GameState = state;
  if (companyOpen(state)) {
    const idle = Object.keys(state.team).filter(
      (id) => (state.humanQueues[id]?.length ?? 0) === 0 && !managingNow(state, id),
    );
    const cost = idle.reduce((sum, id) => sum + laborCost(tick, dailyCost(getHuman(id))), 0);
    if (cost > 0) next = { ...next, idleCost: next.idleCost + cost };
  }
  for (const humanId of Object.keys(state.humanQueues)) {
    const items = state.humanQueues[humanId] ?? [];
    if (items.length === 0) continue;
    const share = multitaskShare(items.length);
    const minutes = tick / items.length;
    const cost = laborCost(minutes, dailyCost(getHuman(humanId)));
    for (const { projectId, taskId } of items) {
      next = updateTask(next, projectId, taskId, (r) => ({
        ...r,
        remaining: r.remaining - tick * share,
        humanMinutes: r.humanMinutes + minutes,
        laborCost: r.laborCost + cost,
      }));
      if ((next.projects[projectId]?.tasks[taskId]?.remaining ?? 0) > 0) continue;
      const rest = (next.humanQueues[humanId] ?? []).filter((q) => q.projectId !== projectId || q.taskId !== taskId);
      next = { ...next, humanQueues: { ...next.humanQueues, [humanId]: rest } };
      next = finishStep(next, projectId, taskId, ctx);
    }
  }
  return next;
};
