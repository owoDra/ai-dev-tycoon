import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getProject } from '../../src/content/index';
import { reduce } from '../../src/core/commands';
import { deadlineAt } from '../../src/core/contract';
import { multitaskShare } from '../../src/core/formulas';
import { createInitialState, createProjectRun, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { ganttView, staffRoster } from '../../src/view/overview';

const DAY = balance.time.minutesPerDay;
const P = 'ecRenewal';

/** 創業メンバー2人の会社で案件を始め、hearing を sato に任せた状態 */
function started(): GameState {
  const s = reduce(createInitialState('overview'), { type: 'StartProject', projectId: P }).state;
  return reduce(s, { type: 'AssignTask', projectId: P, taskId: 'hearing', mode: 'human', workerId: 'sato' }).state;
}

describe('社員の勤務状態（staffRoster）', () => {
  it('担当がなければ手が空いている、1件なら作業中、2件以上なら掛け持ち（1件ずつの速さを添える）', () => {
    const idle = staffRoster(createInitialState('overview'));
    expect(idle.map((s) => s.status)).toEqual(['idle', 'idle']);
    const working = staffRoster(step(started(), 10).state);
    expect(working.find((s) => s.id === 'sato')).toMatchObject({ status: 'working', share: 1 });
    expect(working[0]?.id).toBe('sato');
    expect(working[0]?.tasks[0]).toMatchObject({ project: getProject(P).name, stage: 'work' });
    const s = started();
    const multi = {
      ...s,
      humanQueues: {
        ...s.humanQueues,
        sato: [
          { projectId: P, taskId: 'hearing', queuedAt: 0 },
          { projectId: P, taskId: 'requirements', queuedAt: 0 },
        ],
      },
    };
    expect(staffRoster(multi)[0]).toMatchObject({ id: 'sato', status: 'multitask', share: multitaskShare(2) });
  });
});

describe('案件のガントチャート（ganttView）', () => {
  it('進行中の案件を、受注した日から期限までの帯と、終わった Task の割合で出す。Task は始めた日から今日（終わった日）まで', () => {
    const s = step(started(), DAY / 2).state;
    const g = ganttView(s);
    const row = g.rows[0];
    expect(row).toMatchObject({ projectId: P, state: 'running', start: 0, end: null, contract: 'lenient' });
    expect(row?.deadline).toBe(deadlineAt(s.projects[P] ?? createProjectRun(P, 0)) / DAY);
    expect(g.today).toBe(0.5);
    expect(g.from).toBe(0);
    expect(g.to).toBeGreaterThanOrEqual(row?.deadline ?? 0);
    const hearing = row?.tasks.find((t) => t.taskId === 'hearing');
    expect(hearing?.start).toBeCloseTo(0, 2);
    expect(hearing?.end).toBeGreaterThan(0);
    expect(row?.tasks.find((t) => t.taskId === 'qa')).toMatchObject({ status: 'waiting', start: null });
  });

  it('期限まで1日を切ると「期限間近」、期限を過ぎて炎上すると「炎上中」、打ち切ると「打ち切り」になる', () => {
    const s = started();
    const run = s.projects[P] ?? createProjectRun(P, 0);
    expect(ganttView({ ...s, clock: deadlineAt(run) - DAY / 2 }).rows[0]?.state).toBe('risk');
    const burning = { ...s, projects: { [P]: { ...run, burningAt: deadlineAt(run) } } };
    expect(ganttView({ ...burning, clock: deadlineAt(run) + 1 }).rows[0]?.state).toBe('burning');
    const cancelled = { ...s, projects: { [P]: { ...run, completedAt: 10, cancelled: 'cancelled' as const } } };
    expect(ganttView(cancelled).rows[0]?.state).toBe('cancelled');
    // 終わってから日のたった案件は出さない
    expect(ganttView({ ...cancelled, clock: DAY * 10 }).rows).toEqual([]);
  });
});
