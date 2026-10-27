import { content, getProject } from '../../src/content/index';
import { libraryPresets } from '../../src/content/library';
import type { AssignModeId, LibraryWorkflowDef } from '../../src/content/types';
import { type Command, reduce } from '../../src/core/commands';
import { deadlineMinutes } from '../../src/core/formulas';
import { type ProjectScore, scoreProject } from '../../src/core/scoring';
import { createInitialState } from '../../src/core/state';
import { averageOver } from './compare';
import { FULL_TEAM } from './concurrent';
import { runHeadless } from './headless';
import { type Strategy, strategies } from './strategies';

/*
 * 全案件 × 全戦略の対戦表（tools/balance-report.ts と tests/balance/no-dominant.test.ts）。
 * 戦略は、担当の決め方の Bot（helpers/strategies.ts）と、Workflow Library の同梱プリセットを全 Task にそのまま
 * 適用する「1つの構成をコピーする」戦略。全社員がそろった会社で案件を1件だけ進め、納期の4倍まで待つ。
 * 構成（Model・部品・資料の渡し方）だけを比べるときは、担当モードをそろえた configStrategies を使う。
 */

const AGENT = 'agent';
const ROUTER = 'contextRouter';

/** 同梱プリセットを、案件のすべての Task に適用する（同じ構成のコピー） */
function copyPreset(workflowId: string): (projectId: string) => Strategy {
  return (projectId) => () =>
    getProject(projectId).tasks.map(
      (t): Command => ({ type: 'ApplyLibraryWorkflow', projectId, taskId: t.id, workflowId, workerId: AGENT }),
    );
}

/**
 * 同梱プリセットの構成（Model・部品・資料の渡し方）だけを AI Worker に揃え、すべての Task を同じ mode で任せる。
 * 担当モードをそろえて、構成の違いだけを比べるのに使う
 */
export function presetConfig(w: LibraryWorkflowDef, mode: AssignModeId): (projectId: string) => Strategy {
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

/** 担当モードをそろえた、同梱プリセットの構成ごとの戦略（キーはプリセットの id） */
export const configStrategies = (mode: AssignModeId): Readonly<Record<string, (projectId: string) => Strategy>> =>
  Object.fromEntries(libraryPresets.map((w) => [w.id, presetConfig(w, mode)]));

export const matrixStrategies: Readonly<Record<string, (projectId: string) => Strategy>> = {
  ...strategies,
  ...Object.fromEntries(libraryPresets.map((w) => [w.id, copyPreset(w.id)])),
};

export const matrixProjects: readonly string[] = content.projects.map((p) => p.id);

/** 対戦表の1マス（seed 平均） */
export interface MatrixCell {
  readonly profitPerHumanHour: number;
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
      profitPerHumanHour: s.profitPerHumanHour,
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

/** 案件ごとに Profit / Human Hour が最も高い戦略 */
export function bestStrategy(row: Readonly<Record<string, MatrixCell>>): string {
  const [best] = Object.entries(row).sort(([, a], [, b]) => b.profitPerHumanHour - a.profitPerHumanHour);
  if (!best) throw new Error('戦略がない');
  return best[0];
}
