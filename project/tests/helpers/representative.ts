import { balance } from '../../src/content/balance';
import { getHuman, getProject } from '../../src/content/index';
import { tutorialScript } from '../../src/content/tutorial';
import type { AssignModeId, FeatureId, TaskDef } from '../../src/content/types';
import { archiveSystem } from '../../src/core/archive';
import { activeProjects } from '../../src/core/board';
import { type Command, reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { createInitialState, createProjectRun, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { defaultSystems } from '../../src/core/system';
import { humanSpeed, teamMembers } from '../../src/core/team';
import { currentTutorialStep } from '../../src/core/tutorial';
import { isUnlocked } from '../../src/core/unlocks';
import { representativeProject } from './generated';

/*
 * チュートリアルから、固定 seed で生成した代表的な案件群を受注していく流れ（以前のキャンペーン）を遊ぶ戦略 Bot（画面なし）。
 * 案件ボードのある会社で始め、チュートリアルを納品したら、以前のキャンペーンの段階と同じ順と条件で代表的な案件を受注したことにする
 * （コンペの勝敗は tests/balance/bidding.test.ts で確かめる。ここでは決まった仕事量の進め方を比べる）。
 * 時間はプレイヤーが進めるまで止まっているので、受注した案件を読んで担当を決める間は時計が進まない（その場で決める）。
 */

/** 代表的な案件群の段階。前の段階の後、条件を満たすと受注する */
interface Stage {
  readonly projects: readonly string[];
  readonly when: (state: GameState) => boolean;
}

const done = (state: GameState, id: string) => (state.projects[id]?.completedAt ?? null) !== null;
const EC = representativeProject('ecRenewal');
const PAYMENT = representativeProject('paymentFix');
const SITE = representativeProject('corporateSite');
const SAAS = representativeProject('saasFeature');
const STAGES: readonly Stage[] = [
  { projects: [EC], when: (s) => done(s, tutorialScript.projectId) },
  { projects: [PAYMENT], when: (s) => done(s, EC) },
  { projects: [SITE], when: (s) => done(s, PAYMENT) },
  // コーポレートサイトのサイトマップができたら、SaaS 機能を受注する（初めての同時進行）
  { projects: [SAAS], when: (s) => s.projects[SITE]?.tasks.sitemap?.status === 'done' },
  {
    projects: [representativeProject('internalTool'), representativeProject('promoLp')],
    when: (s) => Object.values(s.projects).filter((p) => p.completedAt !== null).length >= 5,
  },
];

/** 代表的な案件群（チュートリアルを除く、受注する順） */
export const representativeRun: readonly string[] = STAGES.flatMap((s) => s.projects);

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

/** smart に加えて、Seat の購入が解放されたら Premium を1枚買い足す */
export const smartSeatPolicy: CampaignPolicy = {
  ...smartPolicy,
  setup: (state) =>
    isUnlocked(state, 'team') ? [{ type: 'SetSeats', seat: 'premium', count: 1 } satisfies Command] : [],
};

/** smart に加えて、採用が解放されたら人員が size 人になるまで、その日の候補で一番速い人を採用する */
export function smartHirePolicy(size: number): CampaignPolicy {
  return {
    ...smartPolicy,
    setup: (state) => {
      if (!isUnlocked(state, 'hire') || Object.keys(state.team).length >= size) return [];
      const best = [...state.market.candidates].sort((a, b) => getHuman(b).skill - getHuman(a).skill)[0];
      return best ? [{ type: 'Hire', staffId: best } satisfies Command] : [];
    },
  };
}

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
      const h = s.highlight;
      const highlighted = h?.kind === 'task' && h.taskId === a.taskId ? h.mode : undefined;
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
  /** 打ち切るゲーム内時刻（分） */
  readonly limitMinutes: number;
  /**
   * 最初から解放済みにする機能。採用や Seat の変更のような経営判断の手応えを、解放の時期（tests/unit/unlocks.test.ts）と
   * 切り離して比べるときに使う（比べる両方に同じものを渡す）
   */
  readonly unlocked?: readonly FeatureId[];
}

export interface CampaignResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  /** チュートリアルと代表的な案件群をすべて納品したゲーム内時刻（分）。打ち切ったら null */
  readonly clearedAt: number | null;
  /** すべて納品するまでに進めた営業日の数（「次の日へ」を押す回数の目安）。打ち切ったら null */
  readonly clearedDays: number | null;
}

/**
 * 最後に案件ごとの結果（state.projects）を調べるので、納品した案件を累計の記録（core/archive.ts）に移さずに進める。
 * 記録に移すのは数え方の違いだけで、進み方は変わらない
 */
const SYSTEMS = defaultSystems.filter((s) => s !== archiveSystem);

/** チュートリアルから代表的な案件群の納品までを遊ぶ。1分ずつ進め、判断が要るところでその場で Command を出す */
export function playCampaign(options: CampaignOptions): CampaignResult {
  const initial = createInitialState(options.seed ?? tutorialScript.seed, { board: true });
  let state: GameState = { ...initial, unlocked: [...initial.unlocked, ...(options.unlocked ?? [])] };
  const events: GameEvent[] = [];
  const apply = (commands: readonly Command[]) => {
    for (const c of commands) {
      const r = reduce(state, c);
      state = r.state;
      events.push(...r.events);
    }
  };
  // 時間はプレイヤーが進めるまで止まっているので、考える時間はゲーム内の時間を使わない（届いた依頼はその場で受注し、担当を決める）
  const offered = new Set<string>();
  let reached = 0;
  const all = [tutorialScript.projectId, ...representativeRun];
  apply([{ type: 'StartProject', projectId: tutorialScript.projectId }]);

  while (!all.every((id) => done(state, id)) && state.clock < options.limitMinutes) {
    while (reached < STAGES.length && STAGES[reached]?.when(state)) {
      for (const id of STAGES[reached]?.projects ?? []) offered.add(id);
      reached++;
    }
    for (const id of offered) {
      if (state.projects[id]) continue;
      state = { ...state, projects: { ...state.projects, [id]: createProjectRun(id, state.clock) } };
      apply([...(options.policy.setup?.(state) ?? []), ...assignProject(state, id, options.policy)]);
    }
    if (state.tutorial) apply(tutorialCommands(state));
    else {
      // チュートリアルの後に始めた案件や、途中で解放された担当で、まだ決めていない Task を決める
      for (const id of activeProjects(state)) apply(assignProject(state, id, options.policy));
    }
    const r = step(state, balance.time.tickMinutes, SYSTEMS);
    state = r.state;
    events.push(...r.events);
  }
  const cleared = all.every((id) => done(state, id));
  return {
    state,
    events,
    clearedAt: cleared ? state.clock : null,
    clearedDays: cleared ? Math.ceil(state.clock / balance.time.minutesPerDay) : null,
  };
}
