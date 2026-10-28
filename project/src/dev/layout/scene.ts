import { activeProjects, openInquiries } from '../../core/board';
import { reduce } from '../../core/commands';
import { createInitialState, type GameState } from '../../core/state';
import { step } from '../../core/step';

/** 1回に進める時間（分） */
const CHUNK = 30;
/** 受注を待つ上限（分） */
const LIMIT = 60 * 24 * 20;

/**
 * 画面構成の確認ページ（Phase 25）で見せる場面。チュートリアルなしで始めた会社が、届いた引き合いから
 * 案件を2つ受注し、最初の案件の担当を一部だけ決めて少し進めた状態（問題・タブ・会社の帯が出る）にする。決まった seed で毎回同じになる
 */
export function layoutScene(): { state: GameState; projectId: string | null } {
  let s = createInitialState('layout-check', { board: true, talent: true, tutorial: false });
  for (let t = 0; t < LIMIT && activeProjects(s).length < 2; t += CHUNK) {
    for (const projectId of openInquiries(s)) {
      s = reduce(s, { type: 'AcceptOrder', projectId }).state;
    }
    s = step(s, CHUNK).state;
  }
  const projectId = activeProjects(s)[0] ?? null;
  if (projectId) {
    const run = s.projects[projectId];
    const first = Object.keys(run?.tasks ?? {})[0];
    if (first) {
      s = reduce(s, { type: 'AssignTask', projectId, taskId: first, mode: 'ai', workerId: s.agents[0] ?? '' }).state;
    }
    s = step(s, 60).state;
  }
  return { state: s, projectId };
}
