import { companyTiers } from '../content/companyTiers';
import { getProject } from '../content/index';
import type { Condition } from '../content/types';
import { isDelivered } from './contract';
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
    // 記録に移した案件（core/archive.ts）の Task はどれも開始・完了している
    case 'tasksStarted':
      return state.ledger.tasksCompleted + count(state, (t) => t.status !== 'waiting') >= c.count;
    case 'tasksCompleted':
      return state.ledger.tasksCompleted + count(state, (t) => t.status === 'done') >= c.count;
    case 'defectsEscaped':
      return state.ledger.defectsEscaped + count(state, (t) => t.status === 'done' && t.escaped) >= c.count;
    case 'modeCompleted':
      return (
        (state.ledger.modeCompleted[c.mode] ?? 0) +
          count(state, (t) => t.status === 'done' && t.assignment?.mode === c.mode) >=
        c.count
      );
    case 'projectsCompleted':
      return state.ledger.delivered + Object.values(state.projects).filter(isDelivered).length >= c.count;
    case 'unlocked':
      return state.unlocked.includes(c.feature);
    case 'taskAssigned': {
      const a = state.projects[c.projectId]?.tasks[c.taskId]?.assignment;
      return a != null && (c.mode === undefined || a.mode === c.mode);
    }
    case 'taskCompleted':
      return state.projects[c.projectId]?.tasks[c.taskId]?.status === 'done';
    case 'projectCompleted': {
      const run = state.projects[c.projectId];
      return run !== undefined && isDelivered(run);
    }
    case 'templateCompleted':
      return (
        state.ledger.templates.includes(c.templateId) ||
        Object.values(state.projects).some(
          (p) =>
            isDelivered(p) &&
            (p.projectId === c.templateId || getProject(p.projectId).brief?.templateId === c.templateId),
        )
      );
    case 'contextStat':
      return state.contextStats[c.stat] >= c.count;
    case 'sessionAge':
      return Object.values(state.sessions).some((s) => s.age >= c.minutes);
    case 'tier': {
      const ids = companyTiers.map((t) => t.id);
      return ids.indexOf(state.tier) >= ids.indexOf(c.tier);
    }
    case 'partsOwned':
      return state.ownedParts.length >= c.count;
    case 'projectsStarted':
      return state.ledger.delivered + Object.keys(state.projects).length >= c.count;
    case 'usageCapped':
      return state.cappedDays >= c.count;
    case 'all':
      return c.of.every((x) => holds(state, x));
    case 'any':
      return c.of.some((x) => holds(state, x));
  }
}
