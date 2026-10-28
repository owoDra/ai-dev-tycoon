import { balance } from '../content/balance';
import { getProject } from '../content/index';
import type { AssignModeId } from '../content/types';
import { businessDay } from './clock';
import { libraryUseSaving } from './library';
import { scoreProject } from './scoring';
import type { GameState, LedgerRun, ProjectRun } from './state';
import type { System } from './system';

/*
 * 累計の記録。長く遊ぶと納品した案件が増え続け、state の大きさと1ステップの処理時間（案件を数える処理）が伸びていく。
 * そこで納品から balance.archive.keepDays 営業日たった案件は state.projects から外し、会社のスコア・解放の条件・
 * 同業種の実績・Workflow の実績に要る数だけを LedgerRun に足す。直近の案件は画面で見せるため残す。
 */

/** 案件1件を記録に足す（終わった案件だけ。打ち切った案件は費用だけを数え、納品数・実績には数えない） */
export function addToLedger(ledger: LedgerRun, state: GameState, run: ProjectRun): LedgerRun {
  const score = scoreProject(state, run.projectId);
  if (!score || run.completedAt === null) return ledger;
  const def = getProject(run.projectId);
  const tasks = Object.values(run.tasks);
  const delivered = run.cancelled === null;
  const modeCompleted: Partial<Record<AssignModeId, number>> = { ...ledger.modeCompleted };
  for (const t of tasks) {
    if (t.status === 'done' && t.assignment) {
      modeCompleted[t.assignment.mode] = (modeCompleted[t.assignment.mode] ?? 0) + 1;
    }
  }
  const template = def.brief?.templateId ?? def.id;
  const industry = def.brief?.industry;
  const library = { ...ledger.library };
  for (const u of state.libraryUses) {
    if (u.projectId !== run.projectId) continue;
    const saving = libraryUseSaving(state, u);
    if (saving === null) continue;
    const prev = library[u.workflowId] ?? { uses: 0, savedHumanMinutes: 0 };
    library[u.workflowId] = { uses: prev.uses + 1, savedHumanMinutes: prev.savedHumanMinutes + saving };
  }
  return {
    delivered: ledger.delivered + (delivered ? 1 : 0),
    revenue: ledger.revenue + score.revenue,
    projectProfit: ledger.projectProfit + score.profit + score.harnessCost,
    humanMinutes: ledger.humanMinutes + score.humanMinutes,
    tasksCompleted: ledger.tasksCompleted + tasks.filter((t) => t.status === 'done').length,
    defectsEscaped: ledger.defectsEscaped + tasks.filter((t) => t.status === 'done' && t.escaped).length,
    modeCompleted,
    templates: !delivered || ledger.templates.includes(template) ? ledger.templates : [...ledger.templates, template],
    industries:
      !delivered || industry === undefined
        ? ledger.industries
        : { ...ledger.industries, [industry]: (ledger.industries[industry] ?? 0) + 1 },
    library,
  };
}

/** 記録に移す案件（納品から keepDays 営業日たった案件） */
export function archivable(state: GameState): string[] {
  const before = (businessDay(state.clock) - balance.archive.keepDays) * balance.time.minutesPerDay;
  return Object.values(state.projects)
    .filter((p) => p.completedAt !== null && p.completedAt < before)
    .map((p) => p.projectId);
}

/** 案件を記録に移す。案件・チームの割り当て・Workflow の適用の記録から外す */
export function archiveProjects(state: GameState, ids: readonly string[]): GameState {
  if (ids.length === 0) return state;
  const gone = new Set(ids);
  let ledger = state.ledger;
  for (const id of ids) {
    const run = state.projects[id];
    if (run) ledger = addToLedger(ledger, state, run);
  }
  const projects = Object.fromEntries(Object.entries(state.projects).filter(([id]) => !gone.has(id)));
  return {
    ...state,
    ledger,
    projects,
    teams: state.teams.map((t) =>
      t.projects.some((p) => gone.has(p)) ? { ...t, projects: t.projects.filter((p) => !gone.has(p)) } : t,
    ),
    libraryUses: state.libraryUses.filter((u) => !gone.has(u.projectId)),
  };
}

/** 営業日の始まりに、記録に移す案件を移す（案件ボードのある会社だけ。単発のプレイは案件を残す） */
export const archiveSystem: System = (state) => {
  if (state.board === null || state.clock % balance.time.minutesPerDay !== 0) return state;
  return archiveProjects(state, archivable(state));
};
