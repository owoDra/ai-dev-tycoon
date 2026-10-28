import { balance } from '../content/balance';
import { getProject } from '../content/index';
import { businessDay } from './clock';
import type { Transition } from './commands';
import type { GameEvent } from './events';
import { isBankrupt } from './funds';
import type { GameState } from './state';
import { step } from './step';
import type { System } from './system';
import { defaultSystems } from './system';
import { projectDelegated } from './teams';

/*
 * 時間はプレイヤーが進める。1回の操作で1営業日（始業から翌日の始業まで）進め、その中は今までどおり固定ステップで回す。
 * 「判断が必要になるまで進める」は1日ずつ進め、プレイヤーの判断が要る状態になった日の終わりで止まる。
 */

/** 次の営業日が始まるゲーム内時刻（分） */
export function nextDayStart(clock: number): number {
  return (businessDay(clock) + 1) * balance.time.minutesPerDay;
}

/** 今の営業日の終わりまで進める（日の途中から呼んでも、次の始業で止まる）。倒産したらそこで止まる */
export function advanceDay(state: GameState, systems: readonly System[] = defaultSystems): Transition {
  return step(state, nextDayStart(state.clock) - state.clock - state.carryMinutes, systems);
}

/**
 * 担当が決まっていない、始められる Task（前の Task が終わっている）がある案件。管理者に任せた案件は管理者が決めるので含めない
 */
export function unassignedProjects(state: GameState): string[] {
  return Object.values(state.projects)
    .filter((p) => p.completedAt === null && !projectDelegated(state, p.projectId))
    .filter((p) =>
      getProject(p.projectId).tasks.some((task) => {
        const run = p.tasks[task.id];
        return (
          run?.status === 'waiting' && run.assignment === null && task.deps.every((d) => p.tasks[d]?.status === 'done')
        );
      }),
    )
    .map((p) => p.projectId);
}

/** 起きたら「判断が必要になるまで進める」を止める出来事（結果を見て次の手を考える・答える必要があるもの） */
const decisionEvents: ReadonlySet<GameEvent['type']> = new Set<GameEvent['type']>([
  'ProjectCompleted',
  'ProjectBurning',
  'ProjectCancelled',
  'FeatureUnlocked',
  'FiscalClosed',
  'CompanyBankrupt',
  'CompanyPromoted',
  'IncidentStarted',
  'PoachOffered',
]);

/**
 * プレイヤーの判断が要るか。担当待ちの Task がある・進めている案件がない（受注を考える）・その日に判断の要る出来事が起きた
 */
export function decisionNeeded(state: GameState, events: readonly GameEvent[]): boolean {
  if (isBankrupt(state)) return true;
  if (!Object.values(state.projects).some((p) => p.completedAt === null)) return true;
  if (unassignedProjects(state).length > 0) return true;
  return events.some((e) => decisionEvents.has(e.type));
}

/**
 * 判断が必要になるまで1日ずつ進める。少なくとも1日は進め、balance.time.maxSkipDays 日で止まる
 */
export function advanceUntilDecision(state: GameState, systems: readonly System[] = defaultSystems): Transition {
  let s = state;
  const events: GameEvent[] = [];
  for (let day = 0; day < balance.time.maxSkipDays; day++) {
    const next = advanceDay(s, systems);
    s = next.state;
    events.push(...next.events);
    if (decisionNeeded(s, next.events)) break;
  }
  return { state: s, events };
}
