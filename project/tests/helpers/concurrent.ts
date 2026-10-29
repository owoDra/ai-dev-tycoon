import { getProject } from '../../src/content/index';
import { staff } from '../../src/content/staff';
import type { AssignModeId, SeatId, TaskDef } from '../../src/content/types';
import { type Command, reduce } from '../../src/core/commands';
import { deadlineMinutes } from '../../src/core/formulas';
import { type CompanyScore, scoreCompany } from '../../src/core/scoring';
import { createInitialState } from '../../src/core/state';
import { representativeProject } from './generated';
import { runHeadless } from './headless';

/**
 * 短納期の2件の同時進行（以前のキャンペーンの最後の段階）。固定 seed で生成した社内ツールの改修とキャンペーンLP制作の型の案件
 */
export const RUSH = [representativeProject('internalTool'), representativeProject('promoLp')];
export const FULL_TEAM = staff.map((h) => h.id);
const AGENT = 'agent';

export interface ConcurrentPlan {
  /** Task の担当モード */
  readonly mode: (task: TaskDef) => AssignModeId;
  /** 会社の Seat の枚数（載っていない種類は始めたときの枚数のまま） */
  readonly seats?: Partial<Readonly<Record<SeatId, number>>>;
  /** AI Worker に装着する Harness 部品 */
  readonly parts?: readonly string[];
}

export interface ConcurrentResult extends CompanyScore {
  /** すべての案件を納品したゲーム内時刻（分） */
  readonly finishedAt: number;
}

/**
 * 全社員で複数の案件を同時に始め、計画どおりに担当・Seat・Harness を決めて、最も長い納期の4倍まで進める。
 * 人間だけの Task は社員を定義順に交互に指名する
 */
export function playConcurrent(
  seed: string,
  plan: ConcurrentPlan,
  projects: readonly string[] = RUSH,
): ConcurrentResult {
  const commands: Command[] = projects.map((projectId) => ({ type: 'StartProject', projectId }));
  for (const [seat, count] of Object.entries(plan.seats ?? {}) as [SeatId, number][]) {
    commands.push({ type: 'SetSeats', seat, count });
  }
  for (const partId of plan.parts ?? []) commands.push({ type: 'EquipPart', workerId: AGENT, partId });
  let i = 0;
  for (const projectId of projects) {
    for (const task of getProject(projectId).tasks) {
      const mode = plan.mode(task);
      const workerId = mode === 'human' ? (FULL_TEAM[i++ % FULL_TEAM.length] ?? '') : AGENT;
      commands.push({ type: 'AssignTask', projectId, taskId: task.id, mode, workerId });
    }
  }
  const initial = commands.reduce((s, c) => reduce(s, c).state, createInitialState(seed, { team: FULL_TEAM }));
  const until = Math.max(...projects.map((id) => deadlineMinutes(getProject(id)))) * 4;
  const { state } = runHeadless({ seed, initial, until });
  const finishedAt = Math.max(...projects.map((id) => state.projects[id]?.completedAt ?? Number.POSITIVE_INFINITY));
  return { ...scoreCompany(state), finishedAt };
}
