import { balance } from '../content/balance';
import { getProject } from '../content/index';
import type { Transition } from './commands';
import type { GameEvent } from './events';
import { isBankrupt } from './funds';
import { createRngCursor } from './rng';
import type { GameState } from './state';
import { defaultSystems, type System } from './system';
import { projectDelegated } from './teams';

/**
 * 進められない案件（どの Task も動いておらず、次に始まる Task もない）。担当が決まっていない Task で止まっている。
 * 管理者に任せた案件は、管理者が次のステップで担当を決めるので含めない
 */
export function stalledProjects(state: GameState): string[] {
  return Object.values(state.projects)
    .filter((p) => p.completedAt === null && !projectDelegated(state, p.projectId))
    .filter((p) =>
      getProject(p.projectId).tasks.every((task) => {
        const run = p.tasks[task.id];
        if (run?.status === 'running') return false;
        // 担当が決まっていて前の Task が終わっていれば、次のステップで始まる
        const ready = run?.status === 'waiting' && run.assignment !== null;
        return !(ready && task.deps.every((d) => p.tasks[d]?.status === 'done'));
      }),
    )
    .map((p) => p.projectId);
}

/** 担当待ち。進められない案件が1つでもあるか（時間はプレイヤーが進めるので止めはしない。判断が要るかは core/turn.ts） */
export function awaitingAssignment(state: GameState): boolean {
  return stalledProjects(state).length > 0;
}

/**
 * ゲーム内時間を dtMinutes だけ進める。
 * 固定幅 `tickMinutes` ごとに時計を進めてシステムを順に適用し、端数は carryMinutes に持ち越す。
 * そのため dt をどう分割して渡しても、合計が同じなら結果は同じになる。倒産した会社は何もしない。
 * 倒産したステップでは、そこで止める（残りの時間は進めない）
 */
export function step(state: GameState, dtMinutes: number, systems: readonly System[] = defaultSystems): Transition {
  if (isBankrupt(state) || !(dtMinutes > 0)) return { state, events: [] };
  const tick = balance.time.tickMinutes;
  const events: GameEvent[] = [];
  const rng = createRngCursor(state.rng);
  const ctx = { rng, emit: (e: GameEvent) => events.push(e) };

  let s = state;
  let carry = state.carryMinutes + dtMinutes;
  while (carry >= tick && !isBankrupt(s)) {
    carry -= tick;
    s = { ...s, clock: s.clock + tick };
    for (const system of systems) s = system(s, ctx);
  }
  return { state: { ...s, rng: rng.state, carryMinutes: carry }, events };
}
