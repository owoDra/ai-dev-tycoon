import { getProject } from '../../src/content/index';
import { type Command, reduce } from '../../src/core/commands';
import { createInitialState, type GameState } from '../../src/core/state';

export const SESSION_PROJECT = 'tutorialLp';

/**
 * チュートリアルなしで始めたキャンペーン（最初の社員は seed から生成した平均的な2人）で最初の案件を受注し、
 * Task の一部（unassigned 件を残して）を人間に任せた state
 */
export function campaignInProgress(seed = 'session', unassigned = 0): GameState {
  let s = reduce(createInitialState(seed, { campaign: true, talent: true }), { type: 'SkipTutorial' }).state;
  const human = Object.keys(s.team)[0] ?? '';
  s = reduce(s, { type: 'StartProject', projectId: SESSION_PROJECT }).state;
  const tasks = getProject(SESSION_PROJECT).tasks;
  tasks.slice(0, tasks.length - unassigned).forEach((t, i) => {
    const command: Command = {
      type: 'AssignTask',
      projectId: SESSION_PROJECT,
      taskId: t.id,
      mode: i % 2 === 0 ? 'aiThenHumanReview' : 'human',
      workerId: i % 2 === 0 ? 'agent' : human,
    };
    s = reduce(s, command).state;
  });
  return s;
}
