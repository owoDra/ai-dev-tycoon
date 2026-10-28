import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getProject } from '../../src/content/index';
import {
  businessDay,
  calendarDay,
  dayPhase,
  humansAtWork,
  isWorkMinute,
  minuteOfDay,
  untilWork,
} from '../../src/core/clock';
import { reduce } from '../../src/core/commands';
import { createInitialState, type GameState } from '../../src/core/state';
import { awaitingAssignment, stalledProjects, step } from '../../src/core/step';

const DAY = balance.time.minutesPerDay;
const w = balance.time.workday;
const P = 'ecRenewal';

describe('24時間の時計（core/clock.ts）', () => {
  it('時計の 0 は1日目の始業。営業日は始業で、暦の日は 0:00 で切り替わる', () => {
    expect(minuteOfDay(0)).toBe(w.start);
    expect(businessDay(DAY - 1)).toBe(0);
    expect(businessDay(DAY)).toBe(1);
    expect(calendarDay(DAY - w.start - 1)).toBe(0);
    expect(calendarDay(DAY - w.start)).toBe(1);
  });

  it('勤務時間は始業から終業までで、昼休みを除く。1日の勤務時間は1人日の長さと同じ', () => {
    let worked = 0;
    for (let m = 0; m < DAY; m++) if (isWorkMinute(m)) worked++;
    expect(worked).toBe(balance.project.minutesPerPersonDay);
    expect(dayPhase(0)).toBe('work');
    expect(dayPhase(w.lunchStart - w.start)).toBe('lunch');
    expect(dayPhase(w.end - w.start)).toBe('night');
  });

  it('次に人間が働き始めるまでの分（勤務中は 0）', () => {
    expect(untilWork(0)).toBe(0);
    expect(untilWork(w.lunchStart - w.start)).toBe(w.lunchEnd - w.lunchStart);
    expect(untilWork(w.end - w.start)).toBe(DAY - (w.end - w.start));
    // システムは時計を進めてから適用するので、判定は直前の1分で行う
    expect(humansAtWork(balance.time.tickMinutes)).toBe(true);
    expect(humansAtWork(0)).toBe(false);
  });
});

/**
 * 終業の少し前に始め、全 Task を AI Worker に任せた案件。Agent Workflow なら前の Task が Agent Workflow のとき指示出しを省くので夜も続き、
 * AI だけ（指示出しあり）なら手元の工程を終えたら朝まで止まる
 */
function chained(mode: 'agentWorkflow' | 'ai'): GameState {
  const evening = { ...createInitialState('night'), clock: w.end - w.start - 10 };
  let s = reduce(evening, { type: 'StartProject', projectId: P }).state;
  for (const t of getProject(P).tasks) {
    s = reduce(s, { type: 'AssignTask', projectId: P, taskId: t.id, mode, workerId: 'agent' }).state;
  }
  return s;
}

const total = (s: GameState, key: 'humanMinutes' | 'aiMinutes') =>
  Object.values(s.projects[P]?.tasks ?? {}).reduce((sum, t) => sum + t[key], 0);

describe('夜（人間が帰った後）', () => {
  for (const mode of ['agentWorkflow', 'ai'] as const) {
    it(`人間は勤務時間の外は作業しない（${mode}）`, () => {
      let s = chained(mode);
      for (let i = 0; i < DAY * 2; i++) {
        const before = total(s, 'humanMinutes');
        s = step(s, balance.time.tickMinutes).state;
        if (!humansAtWork(s.clock)) expect(total(s, 'humanMinutes')).toBe(before);
      }
    });
  }

  it('Agent Workflow で続く Task は夜も AI が進め、指示出しの要るモードは夜に止まる', () => {
    const nightAi = (mode: 'agentWorkflow' | 'ai') => {
      let s = chained(mode);
      let night = 0;
      for (let i = 0; i < DAY * 2; i++) {
        const before = total(s, 'aiMinutes');
        s = step(s, balance.time.tickMinutes).state;
        if (!humansAtWork(s.clock)) night += total(s, 'aiMinutes') - before;
      }
      return night;
    };
    expect(nightAi('agentWorkflow')).toBeGreaterThan(nightAi('ai'));
  });
});

describe('担当待ち（どの案件も進められない間は時間を止める）', () => {
  it('進行中の案件があって、どの Task も動いていなければ担当待ち。担当を決めて動き出せば解ける', () => {
    expect(awaitingAssignment(createInitialState('wait'))).toBe(false);
    const started = reduce(createInitialState('wait'), { type: 'StartProject', projectId: P }).state;
    expect(awaitingAssignment(started)).toBe(true);
    const assigned = reduce(started, {
      type: 'AssignTask',
      projectId: P,
      taskId: 'hearing',
      mode: 'human',
      workerId: Object.keys(started.team)[0] ?? '',
    }).state;
    // 担当を決めた直後（次のステップで始まる）から、時間を進める
    expect(awaitingAssignment(assigned)).toBe(false);
    expect(awaitingAssignment(step(assigned, balance.time.tickMinutes).state)).toBe(false);
    // 前の Task が終わっていない後の Task だけに担当を決めても、進められないので担当待ちのまま
    const later = reduce(started, {
      type: 'AssignTask',
      projectId: P,
      taskId: 'requirements',
      mode: 'human',
      workerId: Object.keys(started.team)[0] ?? '',
    }).state;
    expect(awaitingAssignment(later)).toBe(true);
  });

  it('ほかの案件が動いていても、進められない案件（受注したばかりで担当が未定など）が1つあれば止める', () => {
    const started = reduce(createInitialState('wait'), { type: 'StartProject', projectId: P }).state;
    const running = reduce(started, {
      type: 'AssignTask',
      projectId: P,
      taskId: 'hearing',
      mode: 'human',
      workerId: Object.keys(started.team)[0] ?? '',
    }).state;
    expect(awaitingAssignment(running)).toBe(false);
    const both = reduce(running, { type: 'StartProject', projectId: 'tutorialLp' }).state;
    expect(Object.keys(both.projects)).toEqual([P, 'tutorialLp']);
    expect(stalledProjects(both)).toEqual(['tutorialLp']);
    expect(awaitingAssignment(both)).toBe(true);
    // 担当を決めて動き出せば解ける
    const resumed = reduce(both, {
      type: 'AssignTask',
      projectId: 'tutorialLp',
      taskId: 'wireframe',
      mode: 'ai',
      workerId: 'agent',
    }).state;
    expect(stalledProjects(resumed)).toEqual([]);
    expect(awaitingAssignment(resumed)).toBe(false);
  });
});
