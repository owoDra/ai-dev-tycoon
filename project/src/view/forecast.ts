import { getAssignMode, primaryActor } from '../content/assignModes';
import { content, getProject } from '../content/index';
import type { AssignModeId } from '../content/types';
import { reduce } from '../core/commands';
import { averageSkill, expectTask } from '../core/expectation';
import { deadlineMinutes } from '../core/formulas';
import { appraiseMode } from '../core/manager';
import { hashSeed } from '../core/rng';
import {
  createHumanQueues,
  createProjectRun,
  createTaskRun,
  type GameState,
  type ProjectRun,
  type TaskRun,
} from '../core/state';
import { step } from '../core/step';
import { isUnlocked } from '../core/unlocks';
import { defaultWorkerFor } from './project';

/** 担当を変えたときの見込み（1つの Task だけの値） */
export interface ForecastMetrics {
  /** 人間が作業する時間（分）。指示出し・レビュー・手戻りを含む */
  readonly humanMinutes: number;
  /** AI の費用（円） */
  readonly aiCost: number;
  /** 完了時の品質の期待値（0〜1）。失敗を見逃すと下がる */
  readonly quality: number;
}

export interface AssignForecast {
  /** 今の担当での見込み。担当が決まっていなければ null */
  readonly before: ForecastMetrics | null;
  readonly after: ForecastMetrics;
}

/**
 * 見込みを出すためにシミュレーションする回数。成功・失敗は乱数で決まるので、seed を変えて平均する。
 * 結果は seed から決まるので、同じ条件なら何度呼んでも同じ見込みになる
 */
const SAMPLES = 16;
/** 1回のシミュレーションで一度に進める時間（分）。完了したらそこで打ち切る */
const CHUNK_MINUTES = 30;

const cache = new Map<string, ForecastMetrics>();

/**
 * Task をそのモードで担当させたときの人間時間・AI 費用・品質の見込み（core のヘッドレス実行）。
 * 今の案件の進み具合からは切り離し、「前の Task が今の担当のまま終わった直後に、この Task だけを処理する」
 * 短いシミュレーションを seed を変えて SAMPLES 回行い、平均する。人の待ち時間は含めない（待ちはボトルネックで見せる）。
 * 前の Task の担当は Agent Workflow の連鎖（指示出しの省略）に効くので引き継ぐ。AI Worker の Session と事件もそのまま引き継ぐ。
 */
export function forecastTask(state: GameState, projectId: string, taskId: string, mode: AssignModeId): ForecastMetrics {
  const def = getProject(projectId);
  const task = def.tasks.find((t) => t.id === taskId);
  const run = state.projects[projectId];
  if (!task) throw new Error(`未定義の Task: ${projectId}/${taskId}`);
  const depModes = task.deps.map((d) => run?.tasks[d]?.assignment?.mode ?? '');
  // Context（Session と事件）は AI の作業に効くので、見込みの前提に含める
  const context = JSON.stringify([state.sessions, state.incidents]);
  const key = `${state.seed}|${projectId}|${taskId}|${mode}|${depModes.join(',')}|${context}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const workerId = content.workers.find((w) => w.kind === primaryActor(getAssignMode(mode)))?.id ?? '';
  let humanMinutes = 0;
  let aiCost = 0;
  let quality = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const result = simulateTaskAlone(state, projectId, taskId, mode, workerId, `${state.seed}/forecast/${i}`);
    humanMinutes += result?.humanMinutes ?? 0;
    aiCost += result?.aiCost ?? 0;
    quality += result?.quality ?? 0;
  }
  const metrics = { humanMinutes: humanMinutes / SAMPLES, aiCost: aiCost / SAMPLES, quality: quality / SAMPLES };
  cache.set(key, metrics);
  return metrics;
}

/**
 * 前の Task が今の担当のまま終わった直後に、この Task だけを mode と workerId で処理する短いシミュレーション（core のヘッドレス実行）。
 * 乱数は rngSeed から始める。AI Worker の Harness・Session と事件は state のものを使う。納期までに終わった Task の状態を返す
 */
export function simulateTaskAlone(
  state: GameState,
  projectId: string,
  taskId: string,
  mode: AssignModeId,
  workerId: string,
  rngSeed: string,
): TaskRun | undefined {
  const def = getProject(projectId);
  const task = def.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`未定義の Task: ${projectId}/${taskId}`);
  const run = state.projects[projectId];
  const tasks: ProjectRun['tasks'] = Object.fromEntries(
    def.tasks.map((t) => {
      const fresh = createTaskRun();
      if (!task.deps.includes(t.id)) return [t.id, fresh];
      // 前の Task は完了済み（担当は今のまま）として扱う
      const done: TaskRun = {
        ...fresh,
        assignment: run?.tasks[t.id]?.assignment ?? null,
        status: 'done',
        quality: 1,
        completedAt: 0,
      };
      return [t.id, done];
    }),
  );
  let s: GameState = {
    ...state,
    rng: hashSeed(rngSeed),
    clock: 0,
    carryMinutes: 0,
    projects: {
      [projectId]: {
        ...(state.projects[projectId] ?? createProjectRun(projectId, 0)),
        startedAt: 0,
        completedAt: null,
        tasks,
      },
    },
    humanQueues: createHumanQueues(),
    bottleneck: null,
    pendingEvents: [],
  };
  s = reduce(s, { type: 'AssignTask', projectId, taskId, mode, workerId }).state;
  const horizon = deadlineMinutes(def);
  while (s.clock < horizon && s.projects[projectId]?.tasks[taskId]?.status !== 'done') {
    s = step(s, CHUNK_MINUTES).state;
  }
  return s.projects[projectId]?.tasks[taskId];
}

/** 担当変更のプレビュー：今の担当（Before）と、選ぼうとしているモード（After）の見込み */
export function forecastAssign(
  state: GameState,
  projectId: string,
  taskId: string,
  mode: AssignModeId,
): AssignForecast {
  const current = state.projects[projectId]?.tasks[taskId]?.assignment?.mode;
  return {
    before: current ? forecastTask(state, projectId, taskId, current) : null,
    after: forecastTask(state, projectId, taskId, mode),
  };
}

/** 担当カードに出す3本のバー（0〜1。比べるモードの中での相対値） */
export interface ModeBars {
  /** 速さ（人間と AI の時間の合計が短いほど長い） */
  readonly speed: number;
  /** 品質（失敗を見逃す確率が低いほど長い） */
  readonly quality: number;
  /** 人の手間（人間の時間が長いほど長い） */
  readonly effort: number;
}

export interface ModeComparison {
  readonly bars: Readonly<Partial<Record<AssignModeId, ModeBars>>>;
  /** おすすめのモード（人間 PM と同じ見積もりで最も良いもの）。チュートリアル中と、Harness の解放の後（自分で考える段階）は出さない */
  readonly recommended: AssignModeId | null;
}

/** バーの最短の長さ（一番悪いモードでも、バーがあることは見えるようにする） */
const BAR_FLOOR = 0.15;

/**
 * 担当カードの比べ方（Phase 41）。数字の予測（forecastAssign）は選んでいるカードだけに出し、カードにはモードどうしの違いを
 * 速さ・品質・人の手間の3本のバーで出す。見込みは core/expectation.ts、おすすめは管理者の判断（core/manager.ts の appraiseMode）と同じ式で決める
 */
export function compareModes(
  state: GameState,
  projectId: string,
  taskId: string,
  modes: readonly AssignModeId[],
): ModeComparison {
  const task = getProject(projectId).tasks.find((t) => t.id === taskId);
  if (!task || modes.length === 0) return { bars: {}, recommended: null };
  const rows = modes.map((id) => {
    const mode = getAssignMode(id);
    const e = expectTask(state, projectId, task, mode, defaultWorkerFor(id, state, projectId), averageSkill());
    return { id, e, value: appraiseMode(state, { kind: 'human', staffId: '' }, projectId, task, id, e) };
  });
  const minTime = Math.min(...rows.map((r) => r.e.humanMinutes + r.e.aiMinutes));
  const maxEscape = Math.max(...rows.map((r) => r.e.pEscape), 0.01);
  const maxHuman = Math.max(...rows.map((r) => r.e.humanMinutes), 1);
  const scale = (v: number) => BAR_FLOOR + (1 - BAR_FLOOR) * Math.max(0, Math.min(1, v));
  const bars: Partial<Record<AssignModeId, ModeBars>> = {};
  for (const r of rows) {
    bars[r.id] = {
      speed: scale(minTime / Math.max(1, r.e.humanMinutes + r.e.aiMinutes)),
      quality: scale(1 - r.e.pEscape / maxEscape),
      effort: scale(r.e.humanMinutes / maxHuman),
    };
  }
  const best = rows.reduce((a, b) => (b.value > a.value ? b : a));
  // チュートリアルは台本の任せ方を順に試すので、おすすめを出さない
  return { bars, recommended: state.tutorial || isUnlocked(state, 'harness') ? null : best.id };
}
