import { balance } from '../content/balance';
import { getProject } from '../content/index';
import { untilWork } from './clock';
import type { Transition } from './commands';
import type { GameEvent } from './events';
import { isBankrupt } from './funds';
import { createRngCursor } from './rng';
import type { GameState } from './state';
import { defaultSystems, type System } from './system';
import { isAiWorking } from './taskFlow';
import { projectDelegated } from './teams';

/** 実時間（秒）を、その速度でのゲーム内の分に換算する */
export function toGameMinutes(realSeconds: number, speed: number): number {
  return realSeconds * balance.time.minutesPerRealSecond * speed;
}

/** 人間が帰っていて（夜・昼休み）、AI もどの工程も処理していない。次の始業まで何も起きないので早送りしてよい */
export function idleHours(state: GameState): boolean {
  if (untilWork(state.clock) === 0) return false;
  for (const project of Object.values(state.projects)) {
    if (project.completedAt !== null) continue;
    for (const run of Object.values(project.tasks)) if (isAiWorking(run)) return false;
  }
  return true;
}

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

/**
 * 担当待ち。進められない案件が1つでもあれば、プレイヤーが担当を決めるまで時間を進めない
 * （ほかの案件が動いている間に、受注したばかりの案件や止まった案件の納期だけが減らないようにする）。
 * 案件がなければ（見積の結果待ちなど）止めない
 */
export function awaitingAssignment(state: GameState): boolean {
  return stalledProjects(state).length > 0;
}

/** 早送りを止めるゲーム内時刻。idleHours の間は次の始業まで。早送りしないときは null */
export function skipUntil(state: GameState): number | null {
  return idleHours(state) ? state.clock + untilWork(state.clock) : null;
}

/**
 * 実時間を進めるときの速度の倍率。ふだんは選んだ速度で、早送りの間（skipUntil）は balance.time.idleSkip まで上げる
 * （夜を待たせない。どの速度でも同じ速さで、始業へ進む）
 */
export function playSpeed(state: GameState): number {
  return skipUntil(state) !== null ? Math.max(state.speed, balance.time.idleSkip) : state.speed;
}

/**
 * ゲーム内時間を dtMinutes だけ進める。
 * 固定幅 `tickMinutes` ごとに時計を進めてシステムを順に適用し、端数は carryMinutes に持ち越す。
 * そのため dt をどう分割して渡しても、合計が同じなら結果は同じになる。一時停止中と倒産した会社は何もしない。
 * 倒産したステップでは、そこで止める（残りの時間は進めない）
 */
export function step(state: GameState, dtMinutes: number, systems: readonly System[] = defaultSystems): Transition {
  if (state.paused || isBankrupt(state) || !(dtMinutes > 0)) return { state, events: [] };
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
