import type { Condition } from '../content/types';
import type { GameState, TaskRun } from './state';

function allTasks(state: GameState): TaskRun[] {
  return Object.values(state.projects).flatMap((p) => Object.values(p.tasks));
}

const count = (state: GameState, pred: (t: TaskRun) => boolean) => allTasks(state).filter(pred).length;

/** 条件（content/types.ts の Condition）を今の state で判定する。解放・用語・チュートリアルで共通に使う */
export function holds(state: GameState, c: Condition): boolean {
  switch (c.type) {
    case 'start':
      return true;
    case 'tasksStarted':
      return count(state, (t) => t.status !== 'waiting') >= c.count;
    case 'tasksCompleted':
      return count(state, (t) => t.status === 'done') >= c.count;
    case 'defectsEscaped':
      return count(state, (t) => t.status === 'done' && t.escaped) >= c.count;
    case 'modeCompleted':
      return count(state, (t) => t.status === 'done' && t.assignment?.mode === c.mode) >= c.count;
    case 'projectsCompleted':
      return Object.values(state.projects).filter((p) => p.completedAt !== null).length >= c.count;
    case 'unlocked':
      return state.unlocked.includes(c.feature);
    case 'taskAssigned': {
      const a = state.projects[c.projectId]?.tasks[c.taskId]?.assignment;
      return a != null && (c.mode === undefined || a.mode === c.mode);
    }
    case 'taskCompleted':
      return state.projects[c.projectId]?.tasks[c.taskId]?.status === 'done';
    case 'projectCompleted':
      return (state.projects[c.projectId]?.completedAt ?? null) !== null;
  }
}
