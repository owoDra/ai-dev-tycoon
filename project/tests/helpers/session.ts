import { getProject } from '../../src/content/index';
import { type Command, reduce } from '../../src/core/commands';
import { createInitialState, type GameState } from '../../src/core/state';

export const SESSION_PROJECT = 'tutorialLp';

/**
 * チュートリアルを飛ばしたキャンペーンで最初の案件を受注し、Task の一部（skip 件を残して）を人間に任せた state
 */
export function campaignInProgress(seed = 'session', unassigned = 0): GameState {
  let s = reduce(createInitialState(seed, { campaign: true }), { type: 'SkipTutorial' }).state;
  s = reduce(s, { type: 'StartProject', projectId: SESSION_PROJECT }).state;
  const tasks = getProject(SESSION_PROJECT).tasks;
  tasks.slice(0, tasks.length - unassigned).forEach((t, i) => {
    const command: Command = {
      type: 'AssignTask',
      projectId: SESSION_PROJECT,
      taskId: t.id,
      mode: i % 2 === 0 ? 'aiThenHumanReview' : 'human',
      workerId: i % 2 === 0 ? 'agent' : 'sato',
    };
    s = reduce(s, command).state;
  });
  return s;
}
