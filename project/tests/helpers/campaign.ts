import { balance } from '../../src/content/balance';
import { getProject } from '../../src/content/index';
import { tutorialScript } from '../../src/content/tutorial';
import type { AssignModeId, TaskDef } from '../../src/content/types';
import { activeProjects, offeredProjects } from '../../src/core/campaign';
import { type Command, reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { humanSpeed, teamMembers } from '../../src/core/team';
import { currentTutorialStep } from '../../src/core/tutorial';
import { isUnlocked } from '../../src/core/unlocks';

/*
 * キャンペーンを最初から最後まで遊ぶ戦略 Bot（画面なし）。プレイヤーと同じく1倍速のまま進め（早送りしない）、
 * 新しい依頼を読んで担当を決めるまでの時間（考える時間）も時計が進む。
 */

const AI_WORKER = 'agent';
/** smart 系の Bot が AI に任せる AI 適性の下限（tests/helpers/strategies.ts の smart と同じ） */
const SMART_APTITUDE = 0.6;

export interface CampaignPolicy {
  /** Task の担当モード（その時点で解放済みのモードだけを返す） */
  readonly mode: (state: GameState, task: TaskDef) => AssignModeId;
  /** 担当を決めるときに一緒に出す Command（Seat や Harness の設定）。毎回出してよい（変化がなければ無視される） */
  readonly setup?: (state: GameState) => Command[];
}

/** AI 適性の高い Task は「AI → 人間レビュー」、残りは得意な人（いなければ空いている人）に任せる */
export const smartPolicy: CampaignPolicy = {
  mode: (state, task) =>
    task.aiAptitude >= SMART_APTITUDE && isUnlocked(state, 'mode:aiThenHumanReview') ? 'aiThenHumanReview' : 'human',
};

/** smart に加えて、社員の画面が解放されたら AI Worker の運用者だけを Premium にする */
export const smartSeatPolicy: CampaignPolicy = {
  ...smartPolicy,
  setup: (state) =>
    isUnlocked(state, 'team') ? [{ type: 'SetSeat', staffId: 'suzuki', seat: 'premium' } satisfies Command] : [],
};

/** 人間だけで担う Task の担当者。得意分野の人を優先し、同じなら担当の少ない人 */
function pickHuman(state: GameState, task: TaskDef, load: Map<string, number>): string {
  const team = teamMembers(state);
  let best = team[0]?.id ?? '';
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const h of team) {
    const score = humanSpeed(h.id, task) - (load.get(h.id) ?? 0);
    if (score > bestScore) {
      best = h.id;
      bestScore = score;
    }
  }
  load.set(best, (load.get(best) ?? 0) + 1);
  return best;
}

/** 案件の担当が決まっていない Task をすべて決める */
function assignProject(state: GameState, projectId: string, policy: CampaignPolicy): Command[] {
  const run = state.projects[projectId];
  if (!run) return [];
  const load = new Map<string, number>();
  return getProject(projectId)
    .tasks.filter((t) => run.tasks[t.id]?.assignment === null)
    .map((task) => {
      const mode = policy.mode(state, task);
      const workerId = mode === 'human' ? pickHuman(state, task, load) : AI_WORKER;
      return { type: 'AssignTask', projectId, taskId: task.id, mode, workerId };
    });
}

/** チュートリアルの今のステップで許された担当を決める（照らしているモードがあればそれ） */
function tutorialCommands(state: GameState): Command[] {
  const s = currentTutorialStep(state);
  if (!s) return [];
  const run = state.projects[tutorialScript.projectId];
  return s.allow
    .filter((a) => run?.tasks[a.taskId]?.assignment === null)
    .map((a) => {
      const highlighted = s.highlight?.taskId === a.taskId ? s.highlight.mode : undefined;
      const mode = highlighted ?? a.modes.at(-1) ?? 'human';
      return {
        type: 'AssignTask',
        projectId: tutorialScript.projectId,
        taskId: a.taskId,
        mode,
        workerId: mode === 'human' ? 'sato' : AI_WORKER,
      };
    });
}

export interface CampaignOptions {
  readonly seed?: string;
  readonly policy: CampaignPolicy;
  /** 新しい依頼を読んで担当を決めるまでの実時間（秒） */
  readonly thinkSeconds: number;
  /** チュートリアルの吹き出しを読んで操作するまでの実時間（秒） */
  readonly tutorialThinkSeconds: number;
  /** 打ち切るゲーム内時刻（分） */
  readonly limitMinutes: number;
}

export interface CampaignResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  /** クリアしたゲーム内時刻（分）。打ち切ったら null */
  readonly clearedAt: number | null;
}

/** キャンペーンを最初から遊ぶ。1分ずつ進め、考える時間が過ぎたら Command を出す */
export function playCampaign(options: CampaignOptions): CampaignResult {
  const perSecond = balance.time.minutesPerRealSecond;
  let state = createInitialState(options.seed ?? tutorialScript.seed, { campaign: true });
  const events: GameEvent[] = [];
  const apply = (commands: readonly Command[]) => {
    for (const c of commands) {
      const r = reduce(state, c);
      state = r.state;
      events.push(...r.events);
    }
  };
  /** 依頼を受注する時刻と、チュートリアルの次の操作の時刻 */
  const acceptAt = new Map<string, number>();
  let tutorialAt = null as { readonly step: number; readonly at: number } | null;

  while (!state.campaign?.cleared && state.clock < options.limitMinutes) {
    for (const id of offeredProjects(state)) {
      if (!acceptAt.has(id)) acceptAt.set(id, state.clock + options.thinkSeconds * perSecond);
      if (state.clock < (acceptAt.get(id) ?? 0)) continue;
      apply([{ type: 'StartProject', projectId: id }]);
      if (!state.tutorial)
        apply([...(options.policy.setup?.(state) ?? []), ...assignProject(state, id, options.policy)]);
    }
    if (state.tutorial) {
      const current = state.tutorial.step;
      const planned =
        tutorialAt !== null && tutorialAt.step === current
          ? tutorialAt
          : { step: current, at: state.clock + options.tutorialThinkSeconds * perSecond };
      tutorialAt = planned;
      if (state.clock >= planned.at) apply(tutorialCommands(state));
    } else {
      // チュートリアルの後に始めた案件や、途中で解放された担当で、まだ決めていない Task を決める
      for (const id of activeProjects(state)) apply(assignProject(state, id, options.policy));
    }
    const r = step(state, balance.time.tickMinutes);
    state = r.state;
    events.push(...r.events);
  }
  const cleared = events.some((e) => e.type === 'CampaignCleared');
  return { state, events, clearedAt: cleared ? state.clock : null };
}
