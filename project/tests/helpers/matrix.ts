import { content, getProject } from '../../src/content/index';
import type { AssignModeId } from '../../src/content/types';
import { type Command, reduce } from '../../src/core/commands';
import { deadlineMinutes } from '../../src/core/formulas';
import type { WorkflowDraft } from '../../src/core/library';
import { type ProjectScore, scoreProject } from '../../src/core/scoring';
import { createInitialState } from '../../src/core/state';
import { averageOver } from './compare';
import { FULL_TEAM } from './concurrent';
import { runHeadless } from './headless';
import { type Strategy, strategies } from './strategies';
import { sampleWorkflows } from './workflows';

/*
 * 全案件 × 全戦略の対戦表（tools/balance-report.ts と tests/balance/no-dominant.test.ts）。
 * 戦略は、担当の決め方の Bot（helpers/strategies.ts）と、保存した Workflow（helpers/workflows.ts）を全 Task にそのまま
 * 適用する「1つの構成をコピーする」戦略。全社員がそろった会社で案件を1件だけ進め、納期の4倍まで待つ。
 * 構成（Model・部品・資料の渡し方）だけを比べるときは、担当モードをそろえた configStrategies を使う。
 */

const AGENT = 'agent';
const ROUTER = 'contextRouter';

/** Workflow を棚に保存して、案件のすべての Task に適用する（同じ構成のコピー）。まっさらな会社なので id は custom1 */
function copyWorkflow(workflow: WorkflowDraft): (projectId: string) => Strategy {
  return (projectId) => () => [
    { type: 'SaveLibraryWorkflow', workflow },
    ...getProject(projectId).tasks.map(
      (t): Command => ({
        type: 'ApplyLibraryWorkflow',
        projectId,
        taskId: t.id,
        workflowId: 'custom1',
        workerId: AGENT,
      }),
    ),
  ];
}

/**
 * Workflow の構成（Model・部品・資料の渡し方）だけを AI Worker に揃え、すべての Task を同じ mode で任せる。
 * 担当モードをそろえて、構成の違いだけを比べるのに使う
 */
export function workflowConfig(w: WorkflowDraft, mode: AssignModeId): (projectId: string) => Strategy {
  return (projectId) => () => [
    { type: 'SetModel', workerId: AGENT, modelId: w.modelId },
    ...[...w.parts, ...(w.context === 'router' ? [ROUTER] : [])].map(
      (partId): Command => ({ type: 'EquipPart', workerId: AGENT, partId }),
    ),
    ...(w.context === 'router'
      ? []
      : [{ type: 'SetContextFeed', workerId: AGENT, feed: { mode: w.context } } as const]),
    ...getProject(projectId).tasks.map(
      (t): Command => ({ type: 'AssignTask', projectId, taskId: t.id, mode, workerId: AGENT }),
    ),
  ];
}

/** 構成の比較でそろえる担当モード（AI が主に担当するモードのうち、レビューの方式が違う2つ） */
export const configModes: readonly AssignModeId[] = ['aiThenHumanReview', 'aiThenEval'];

/** 担当モードをそろえた、Workflow の構成ごとの戦略（キーは helpers/workflows.ts の名前） */
export const configStrategies = (mode: AssignModeId): Readonly<Record<string, (projectId: string) => Strategy>> =>
  Object.fromEntries(Object.entries(sampleWorkflows).map(([key, w]) => [key, workflowConfig(w, mode)]));

export const matrixStrategies: Readonly<Record<string, (projectId: string) => Strategy>> = {
  ...strategies,
  ...Object.fromEntries(Object.entries(sampleWorkflows).map(([key, w]) => [key, copyWorkflow(w)])),
};

export const matrixProjects: readonly string[] = content.projects.map((p) => p.id);

/** 対戦表の1マス（seed 平均） */
export interface MatrixCell {
  readonly profitPerPersonDay: number;
  readonly profit: number;
  readonly humanMinutes: number;
  /** 納品までの時間 ÷ 納期 */
  readonly deadlineRatio: number;
  readonly quality: number;
  readonly reworkRate: number;
  readonly accidents: number;
  /** 納品できた割合（0〜1） */
  readonly completed: number;
}

/** 全社員がそろった会社で案件を1件だけ始め、戦略の Command を開始時点で適用して、納期の4倍まで進める */
export function playMatrixCell(projectId: string, strategy: Strategy, seed: string): ProjectScore {
  const start: Command = { type: 'StartProject', projectId };
  const started = reduce(createInitialState(seed, { team: FULL_TEAM }), start).state;
  const commands = [start, ...strategy(started)].map((command) => ({ at: 0, command }));
  const initial = createInitialState(seed, { team: FULL_TEAM });
  const { state } = runHeadless({ seed, initial, commands, until: deadlineMinutes(getProject(projectId)) * 4 });
  const score = scoreProject(state, projectId);
  if (!score) throw new Error(`案件 ${projectId} が開始されていない`);
  return score;
}

export function matrixCell(
  projectId: string,
  make: (projectId: string) => Strategy,
  seedList: readonly string[],
): MatrixCell {
  const deadline = deadlineMinutes(getProject(projectId));
  return averageOver(seedList, (seed): MatrixCell => {
    const s = playMatrixCell(projectId, make(projectId), seed);
    return {
      profitPerPersonDay: s.profitPerPersonDay,
      profit: s.profit,
      humanMinutes: s.humanMinutes,
      deadlineRatio: s.elapsedMinutes / deadline,
      quality: s.quality,
      reworkRate: s.reworkRate,
      accidents: s.accidents,
      completed: s.completed ? 1 : 0,
    };
  });
}

/** 案件ごと・戦略ごとのマス */
export type Matrix = Readonly<Record<string, Readonly<Record<string, MatrixCell>>>>;

export function buildMatrix(
  seedList: readonly string[],
  strategySet: Readonly<Record<string, (projectId: string) => Strategy>> = matrixStrategies,
  projects: readonly string[] = matrixProjects,
): Matrix {
  const names = Object.entries(strategySet);
  return Object.fromEntries(
    projects.map((p) => [p, Object.fromEntries(names.map(([name, make]) => [name, matrixCell(p, make, seedList)]))]),
  );
}

/** 案件ごとに Profit / Person-Day が最も高い戦略 */
export function bestStrategy(row: Readonly<Record<string, MatrixCell>>): string {
  const [best] = Object.entries(row).sort(([, a], [, b]) => b.profitPerPersonDay - a.profitPerPersonDay);
  if (!best) throw new Error('戦略がない');
  return best[0];
}
