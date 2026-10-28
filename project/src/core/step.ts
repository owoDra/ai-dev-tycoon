import { balance } from '../content/balance';
import { getProject } from '../content/index';
import { activeProjects, openInquiries, pendingBids } from './board';
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

/**
 * 見積の結果を待つだけの時間。チュートリアルを終えた会社で、進行中の案件がなく、見積を出した引き合いがあり、
 * まだ見積を出していない引き合い（プレイヤーが考えている途中のもの）がない
 */
export function waitingOnBids(state: GameState): boolean {
  return (
    state.board !== null &&
    state.tutorial === null &&
    activeProjects(state).length === 0 &&
    pendingBids(state).length > 0 &&
    openInquiries(state).length === 0
  );
}

/**
 * 早送りを止めるゲーム内時刻。早送りしないときは null。
 * idleHours の間は次の始業まで、waitingOnBids の間は最初の締切（結果が出る時刻）まで。両方なら早い方
 */
export function skipUntil(state: GameState): number | null {
  const stops: number[] = [];
  if (idleHours(state)) stops.push(state.clock + untilWork(state.clock));
  if (waitingOnBids(state)) {
    const closes = (state.board?.inquiries ?? []).filter((i) => i.bid !== null).map((i) => i.closesAt);
    stops.push(Math.min(...closes));
  }
  return stops.length > 0 ? Math.min(...stops) : null;
}

/**
 * 実時間を進めるときの速度の倍率。ふだんは選んだ速度で、早送りの間（skipUntil）は balance.time.idleSkip まで上げる
 * （夜や見積の結果を待たせない。どの速度でも同じ速さで、始業や締切へ進む）
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
