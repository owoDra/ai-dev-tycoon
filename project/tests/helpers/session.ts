import { getProject } from '../../src/content/index';
import { postInquiries } from '../../src/core/board';
import { type Command, reduce } from '../../src/core/commands';
import { createInitialState, createProjectRun, type GameState } from '../../src/core/state';

export const SESSION_PROJECT = 'tutorialLp';

/**
 * チュートリアルなしで始めた会社（最初の社員は seed から生成した平均的な2人）が、最初の案件（小さなLP制作）を
 * コンペで受注した state（その日のほかの引き合いは見送った）。Task の一部（unassigned 件を残して）を人間に任せる
 */
export function campaignInProgress(seed = 'session', unassigned = 0): GameState {
  const fresh = createInitialState(seed, { board: true, talent: true, tutorial: false });
  // 最初の営業日の引き合いを届ける（Command の適用後と同じ判定。状態を変えない Command では判定が走らないので直接呼ぶ）
  let s = postInquiries(fresh, () => {});
  const board = s.board ? { ...s.board, inquiries: [] } : null;
  s = { ...s, board, projects: { [SESSION_PROJECT]: createProjectRun(SESSION_PROJECT, s.clock) } };
  const human = Object.keys(s.team)[0] ?? '';
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
