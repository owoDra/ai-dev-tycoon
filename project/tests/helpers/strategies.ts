import { getProject, humans } from '../../src/content/index';
import type { AssignModeId, TaskDef } from '../../src/content/types';
import { type Command, reduce } from '../../src/core/commands';
import { deadlineMinutes } from '../../src/core/formulas';
import { type ProjectScore, scoreProject } from '../../src/core/scoring';
import { createInitialState, type GameState } from '../../src/core/state';
import { type HeadlessResult, runHeadless } from './headless';

/** 戦略 Bot。state を見て Command の列を返す */
export type Strategy = (state: GameState) => Command[];

const AI_WORKER = 'agent';
/** smart が AI に任せる AI 適性の下限 */
const SMART_APTITUDE = 0.6;

/** まだ担当が決まっていない Task に、decide が返すモードを割り当てる。人間は定義順に交互に指名する */
function assignAll(projectId: string, decide: (task: TaskDef) => AssignModeId): Strategy {
  return (state) => {
    const run = state.projects[projectId];
    if (!run) return [];
    return getProject(projectId)
      .tasks.filter((t) => run.tasks[t.id]?.assignment === null)
      .map((task, i) => {
        const mode = decide(task);
        const human = humans[i % humans.length]?.id ?? '';
        return { type: 'AssignTask', projectId, taskId: task.id, mode, workerId: mode === 'human' ? human : AI_WORKER };
      });
  };
}

export const strategies = {
  allHuman: (projectId: string) => assignAll(projectId, () => 'human'),
  allAiNoReview: (projectId: string) => assignAll(projectId, () => 'ai'),
  aiWithReview: (projectId: string) => assignAll(projectId, () => 'aiThenHumanReview'),
  /** AI 適性の高い Task だけ AI に任せてレビューし、残りは人間 */
  smart: (projectId: string) =>
    assignAll(projectId, (t) => (t.aiAptitude >= SMART_APTITUDE ? 'aiThenHumanReview' : 'human')),
} satisfies Record<string, (projectId: string) => Strategy>;

export type StrategyName = keyof typeof strategies;

export interface PlayResult extends HeadlessResult {
  readonly score: ProjectScore;
}

/**
 * 案件を開始し、戦略が返した Command を開始時点で適用して、納期の until 倍まで runHeadless で進める。
 */
export function playProject(projectId: string, strategy: Strategy, seed: string, untilDeadlines = 4): PlayResult {
  const start: Command = { type: 'StartProject', projectId };
  const started = reduce(createInitialState(seed), start).state;
  const commands = [start, ...strategy(started)].map((command) => ({ at: 0, command }));
  const result = runHeadless({ seed, commands, until: deadlineMinutes(getProject(projectId)) * untilDeadlines });
  const score = scoreProject(result.state, projectId);
  if (!score) throw new Error(`案件 ${projectId} が開始されていない`);
  return { ...result, score };
}
