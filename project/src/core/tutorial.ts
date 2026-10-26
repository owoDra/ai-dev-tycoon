import { tutorialScript } from '../content/tutorial';
import type { TutorialSay, TutorialSayId, TutorialStepDef } from '../content/types';
import type { Command } from './commands';
import { holds } from './conditions';
import type { GameEvent } from './events';
import type { GameState } from './state';

/** 今のチュートリアルのステップ。チュートリアル中でなければ null */
export function currentTutorialStep(state: GameState): TutorialStepDef | null {
  if (!state.tutorial) return null;
  return tutorialScript.steps[state.tutorial.step] ?? null;
}

/** 条件付きの文言を、今の state で1つに決める */
export function resolveSay(state: GameState, say: TutorialSay): TutorialSayId {
  if (typeof say === 'string') return say;
  return holds(state, say.if) ? say.yes : say.no;
}

/**
 * チュートリアル中にその Command を受け付けるか。チュートリアル中でなければ常に受け付ける。
 * 台本の alwaysAllowed（時間の操作・スキップなど）と、今のステップの allow に合う担当の決定だけを受け付ける。
 */
export function isAllowed(state: GameState, command: Command): boolean {
  const step = currentTutorialStep(state);
  if (!state.tutorial) return true;
  if ((tutorialScript.alwaysAllowed as readonly string[]).includes(command.type)) return true;
  if (command.type !== 'AssignTask' || command.projectId !== tutorialScript.projectId) return false;
  return (step?.allow ?? []).some((a) => a.taskId === command.taskId && a.modes.includes(command.mode));
}

/** チュートリアル中の AI の作業の成否（シナリオで決めたもの）。決めていなければ null（確率で決める） */
export function forcedAiOutcome(state: GameState, projectId: string, taskId: string): boolean | null {
  if (!state.tutorial || projectId !== tutorialScript.projectId) return null;
  return tutorialScript.forcedAiOutcomes[taskId] ?? null;
}

/**
 * チュートリアルを進める。次のステップの when を満たしていれば進め（一度に複数進むこともある）、
 * completeWhen を満たしたら終える。
 */
export function advanceTutorial(state: GameState, emit: (e: GameEvent) => void): GameState {
  if (!state.tutorial) return state;
  if (holds(state, tutorialScript.completeWhen)) {
    emit({ type: 'TutorialEnded', skipped: false });
    return { ...state, tutorial: null };
  }
  let step = state.tutorial.step;
  for (
    let next = tutorialScript.steps[step + 1];
    next && holds(state, next.when);
    next = tutorialScript.steps[step + 1]
  ) {
    step++;
    emit({ type: 'TutorialStepChanged', stepId: next.id });
  }
  return step === state.tutorial.step ? state : { ...state, tutorial: { step } };
}
