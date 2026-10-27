import { getAssignMode } from '../content/assignModes';
import { getHarnessPart, getProject, humans } from '../content/index';
import type { AssignModeId, ContextFeed, Stage } from '../content/types';
import { expectedImpact } from '../core/attribution';
import { stageTimes } from '../core/bottleneck';
import { reduce } from '../core/commands';
import { getSession } from '../core/context';
import { averageSkill } from '../core/expectation';
import { harnessOf } from '../core/harness';
import { type ProjectScore, scoreProject } from '../core/scoring';
import { createInitialState, type GameState } from '../core/state';
import { ja } from '../i18n/ja';
import { bottleneckName } from './bottleneck';
import { baselineProfitPerHumanHour } from './hud';
import { type Rank, rankOf } from './rank';

/*
 * 結果画面（企画書40章・59章）の ViewModel。大きな数字1つと主要3指標を先に、分析は段階的に開示する。
 */

/** 主要3指標の Before（人間だけで進めた場合の見込み）→ After（今回の結果） */
export interface ResultMetric {
  readonly key: 'humanTime' | 'aiCost' | 'quality';
  readonly before: number;
  readonly after: number;
  /** 減るほど良い指標か */
  readonly lowerIsBetter: boolean;
}

/** 工程別の時間の1行（第4段） */
export interface StageTimeRow {
  readonly key: string;
  readonly name: string;
  readonly stage: Stage;
  readonly minutes: number;
}

/** 人間の介入の時系列の1件（第4段）。位置は案件の経過時間に対する割合（0〜1） */
export interface InterventionMark {
  readonly taskId: string;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly interventions: number;
}

/** AI コストの内訳の1行（第4段） */
export interface CostRow {
  readonly key: string;
  readonly label: string;
  readonly yen: number;
}

export interface ResultView {
  readonly score: ProjectScore;
  /** 人間だけで進めた場合の Profit / Human Hour の見込み */
  readonly baseline: number;
  /** baseline に対する倍率。基準がなければ null */
  readonly vsBaseline: number | null;
  /** キャンペーンで直前に納品した案件と比べた倍率 */
  readonly previous: { readonly name: string; readonly ratio: number } | null;
  readonly rank: Rank;
  readonly metrics: readonly ResultMetric[];
  readonly stages: readonly StageTimeRow[];
  readonly timeline: readonly InterventionMark[];
  readonly costs: readonly CostRow[];
}

/** 案件を人間だけで進めた場合の人間時間・品質の見込み（AI コストは 0） */
export function humanOnlyMetrics(projectId: string): { readonly humanMinutes: number; readonly quality: number } {
  const state = reduce(createInitialState(projectId), { type: 'StartProject', projectId }).state;
  const mode = getAssignMode('human');
  const skill = averageSkill();
  const humanId = humans[0]?.id ?? '';
  const tasks = getProject(projectId).tasks;
  const effortSum = tasks.reduce((sum, t) => sum + t.effort, 0);
  let humanMinutes = 0;
  let quality = 0;
  for (const task of tasks) {
    const e = expectedImpact(state, projectId, task, mode, humanId, skill);
    humanMinutes += e.humanMinutes;
    quality += effortSum > 0 ? (e.quality * task.effort) / effortSum : 0;
  }
  return { humanMinutes, quality };
}

/** 直前に納品した案件（キャンペーン）。なければ null */
function previousDelivered(state: GameState, projectId: string): string | null {
  const at = state.projects[projectId]?.completedAt ?? null;
  if (at === null) return null;
  let best: string | null = null;
  let bestAt = Number.NEGATIVE_INFINITY;
  for (const [id, run] of Object.entries(state.projects)) {
    if (id === projectId || run.completedAt === null || run.completedAt > at) continue;
    if (run.completedAt > bestAt) {
      best = id;
      bestAt = run.completedAt;
    }
  }
  return best;
}

/** 結果画面の ViewModel（純粋関数）。案件が始まっていなければ null */
export function resultView(state: GameState, projectId: string): ResultView | null {
  const score = scoreProject(state, projectId);
  const run = state.projects[projectId];
  if (!score || !run) return null;
  const def = getProject(projectId);
  const baseline = baselineProfitPerHumanHour(projectId);
  const prevId = previousDelivered(state, projectId);
  const prevScore = prevId ? scoreProject(state, prevId) : null;
  const human = humanOnlyMetrics(projectId);

  const elapsed = Math.max(1, score.elapsedMinutes);
  const timeline: InterventionMark[] = def.tasks.flatMap((task) => {
    const t = run.tasks[task.id];
    if (!t || t.startedAt === null || t.interventions === 0) return [];
    const end = t.completedAt ?? run.startedAt + elapsed;
    return [
      {
        taskId: task.id,
        name: task.name,
        start: (t.startedAt - run.startedAt) / elapsed,
        end: (end - run.startedAt) / elapsed,
        interventions: t.interventions,
      },
    ];
  });

  const costs: CostRow[] = def.tasks
    .map((task) => ({ key: task.id, label: task.name, yen: run.tasks[task.id]?.aiCost ?? 0 }))
    .filter((c) => c.yen > 0)
    .sort((a, b) => b.yen - a.yen);
  if (score.harnessCost > 0)
    costs.push({ key: 'harness', label: ja.screens.result.harnessCost, yen: score.harnessCost });

  return {
    score,
    baseline,
    vsBaseline: baseline > 0 && score.profitPerHumanHour > 0 ? score.profitPerHumanHour / baseline : null,
    previous:
      prevId && prevScore && prevScore.profitPerHumanHour > 0
        ? { name: getProject(prevId).name, ratio: score.profitPerHumanHour / prevScore.profitPerHumanHour }
        : null,
    rank: rankOf(score.profitPerHumanHour, baseline, score.completed),
    metrics: [
      { key: 'humanTime', before: human.humanMinutes, after: score.humanMinutes, lowerIsBetter: true },
      { key: 'aiCost', before: 0, after: score.aiCost, lowerIsBetter: true },
      { key: 'quality', before: human.quality, after: score.quality, lowerIsBetter: false },
    ],
    stages: stageTimes(state, projectId)
      .filter((s) => s.minutes > 0)
      .map((s) => ({
        key: `${s.ref.taskId}/${s.ref.stage}`,
        name: bottleneckName(s.ref),
        stage: s.ref.stage,
        minutes: s.minutes,
      })),
    timeline,
    costs,
  };
}

/** キャンペーンの歩みの1行（納品した順） */
export interface GrowthRow {
  readonly projectId: string;
  readonly name: string;
  readonly humanMinutes: number;
  /** 人間だけで進めた場合の見込みに対する、人間の時間の割合（案件の大きさをそろえて比べる） */
  readonly humanShare: number;
  readonly profitPerHumanHour: number;
}

/** キャンペーン全体の成長の推移：納品した案件を納品した順に、人間の時間の減少と Profit / Human Hour の上昇を並べる */
export function campaignGrowth(state: GameState): GrowthRow[] {
  return Object.entries(state.projects)
    .filter(([, run]) => run.completedAt !== null)
    .sort(([, a], [, b]) => (a.completedAt ?? 0) - (b.completedAt ?? 0))
    .flatMap(([projectId]) => {
      const score = scoreProject(state, projectId);
      if (!score) return [];
      const human = humanOnlyMetrics(projectId).humanMinutes;
      return [
        {
          projectId,
          name: getProject(projectId).name,
          humanMinutes: score.humanMinutes,
          humanShare: human > 0 ? score.humanMinutes / human : 1,
          profitPerHumanHour: score.profitPerHumanHour,
        },
      ];
    });
}

/**
 * 保存する Workflow の構成（Workflow Library への保存は Phase 16）。案件の Task ごとの担当モードと、AI Worker の Harness と資料の渡し方
 */
export interface WorkflowSnapshot {
  readonly projectId: string;
  readonly assignments: readonly {
    readonly taskId: string;
    readonly kind: string | null;
    readonly mode: AssignModeId;
  }[];
  readonly workers: readonly {
    readonly workerId: string;
    readonly modelId: string;
    readonly parts: readonly string[];
    readonly feed: ContextFeed;
  }[];
  /** 構成を使ったときの Profit / Human Hour */
  readonly profitPerHumanHour: number;
}

/** 案件の構成をデータとして書き出す（JSON にそのまま変換できる値だけ） */
export function workflowSnapshot(state: GameState, projectId: string): WorkflowSnapshot | null {
  const run = state.projects[projectId];
  const score = scoreProject(state, projectId);
  if (!run || !score) return null;
  const assignments = getProject(projectId).tasks.flatMap((task) => {
    const a = run.tasks[task.id]?.assignment;
    return a ? [{ taskId: task.id, kind: task.kind ?? null, mode: a.mode }] : [];
  });
  const workerIds = [
    ...new Set(Object.values(run.tasks).flatMap((t) => (t.setup && t.assignment ? [t.assignment.workerId] : []))),
  ];
  const workers = workerIds.map((workerId) => {
    const h = harnessOf(state, workerId);
    return {
      workerId,
      modelId: h.modelId,
      parts: h.parts.filter((id) => getHarnessPart(id).category !== 'contextRouter'),
      feed: getSession(state, workerId).feed,
    };
  });
  return { projectId, assignments, workers, profitPerHumanHour: score.profitPerHumanHour };
}
