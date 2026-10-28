import { stageOfPhase } from '../content/assignModes';
import { balance } from '../content/balance';
import { getProject } from '../content/index';
import type { ContractKind, Stage } from '../content/types';
import { contractOf, deadlineAt } from '../core/contract';
import { multitaskShare } from '../core/formulas';
import type { GameState, ProjectRun } from '../core/state';
import { teamMembers } from '../core/team';
import { isManager, managingNow } from '../core/teams';

/*
 * 進み具合の一覧（Phase 36）：社員の勤務状態と、案件のガントチャート。どちらも state を読むだけ。
 * 日は「ゲーム開始からの営業日」（0 が1日目の始業）で、端数は営業日の途中を表す。
 */

const DAY = balance.time.minutesPerDay;
const day = (clock: number) => clock / DAY;

/**
 * 社員の勤務状態。idle：手が空いている / working：1件だけ担当 / multitask：掛け持ち（1件ずつ遅い）/ manager：人間 PM として運営中
 */
export type StaffStatus = 'idle' | 'working' | 'multitask' | 'manager';

export interface StaffRowView {
  readonly id: string;
  readonly name: string;
  readonly status: StaffStatus;
  /** 担当している工程（案件名と Task 名・工程の段階） */
  readonly tasks: readonly { readonly project: string; readonly task: string; readonly stage: Stage | null }[];
  /** 1件あたりの進み方（0〜1。core/formulas.ts の multitaskShare）。担当がなければ 1 */
  readonly share: number;
}

/** 社員全員の勤務状態（掛け持ちの多い順、同じなら社員の順） */
export function staffRoster(state: GameState): StaffRowView[] {
  return teamMembers(state)
    .map((h): StaffRowView => {
      const queue = state.humanQueues[h.id] ?? [];
      const tasks = queue.map((q) => {
        const def = getProject(q.projectId);
        const phase = state.projects[q.projectId]?.tasks[q.taskId]?.phase ?? null;
        return {
          project: def.name,
          task: def.tasks.find((t) => t.id === q.taskId)?.name ?? q.taskId,
          stage: phase ? stageOfPhase[phase] : null,
        };
      });
      const managing = isManager(state, h.id) && managingNow(state, h.id);
      const status: StaffStatus = managing
        ? 'manager'
        : queue.length === 0
          ? 'idle'
          : queue.length === 1
            ? 'working'
            : 'multitask';
      return { id: h.id, name: h.name, status, tasks, share: multitaskShare(queue.length) };
    })
    .sort((a, b) => b.tasks.length - a.tasks.length);
}

/**
 * 案件の状態。running：進行中 / risk：期限まで1日を切ったのに終わっていない / burning：炎上中 /
 * delivered：納品済み / cancelled：打ち切り
 */
export type GanttState = 'running' | 'risk' | 'burning' | 'delivered' | 'cancelled';

export interface GanttTaskView {
  readonly taskId: string;
  readonly name: string;
  readonly status: 'waiting' | 'running' | 'done';
  /** 始めた日と終わった日（終わっていなければ今日）。始めていなければ null */
  readonly start: number | null;
  readonly end: number | null;
}

export interface GanttRowView {
  readonly projectId: string;
  readonly name: string;
  readonly contract: ContractKind;
  readonly state: GanttState;
  /** 受注した日・期限の日・終わった日（終わっていなければ null） */
  readonly start: number;
  readonly deadline: number;
  readonly end: number | null;
  /** 完了した Task の割合（0〜1） */
  readonly progress: number;
  /** 期限までの残り（営業日。過ぎていれば負） */
  readonly daysLeft: number;
  readonly tasks: readonly GanttTaskView[];
}

export interface GanttView {
  /** 今の日 */
  readonly today: number;
  /** 表示する日の範囲（from は切り捨て、to は切り上げた営業日） */
  readonly from: number;
  readonly to: number;
  readonly rows: readonly GanttRowView[];
}

function ganttState(state: GameState, run: ProjectRun): GanttState {
  if (run.cancelled !== null) return 'cancelled';
  if (run.completedAt !== null) return 'delivered';
  if (run.burningAt !== null) return 'burning';
  return deadlineAt(run) - state.clock <= DAY ? 'risk' : 'running';
}

/**
 * 案件のガントチャート。進行中の案件（受注した順）と、直近 recentDays 営業日に終わった案件。
 * 横軸の範囲は、表示する案件の受注から期限・終わった日までと今日を含む
 */
export function ganttView(state: GameState, recentDays = 3): GanttView {
  const today = day(state.clock);
  const shown = Object.values(state.projects)
    .filter((p) => p.completedAt === null || day(p.completedAt) >= today - recentDays)
    .sort((a, b) => a.startedAt - b.startedAt);
  const rows = shown.map((run): GanttRowView => {
    const def = getProject(run.projectId);
    const tasks = def.tasks.map((t): GanttTaskView => {
      const r = run.tasks[t.id];
      const start = r?.startedAt ?? null;
      return {
        taskId: t.id,
        name: t.name,
        status: r?.status ?? 'waiting',
        start: start === null ? null : day(start),
        end: start === null ? null : day(r?.completedAt ?? state.clock),
      };
    });
    return {
      projectId: run.projectId,
      name: def.name,
      contract: contractOf(run.projectId),
      state: ganttState(state, run),
      start: day(run.startedAt),
      deadline: day(deadlineAt(run)),
      end: run.completedAt === null ? null : day(run.completedAt),
      progress: tasks.length > 0 ? tasks.filter((t) => t.status === 'done').length / tasks.length : 0,
      daysLeft: (deadlineAt(run) - state.clock) / DAY,
      tasks,
    };
  });
  const edges = rows.flatMap((r) => [r.start, r.deadline, r.end ?? r.start]);
  return {
    today,
    from: Math.floor(Math.min(today, ...edges)),
    to: Math.ceil(Math.max(today + 1, ...edges)),
    rows,
  };
}
