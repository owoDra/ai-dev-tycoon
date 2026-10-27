import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getProject } from '../../src/content/index';
import { type Command, reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { createInitialState } from '../../src/core/state';
import { runHeadless, type TimedCommand } from '../helpers/headless';
import { playProject, strategies } from '../helpers/strategies';
import { AVERAGE_TEAM } from '../helpers/talent';

const P = 'ecRenewal';
const start: Command = { type: 'StartProject', projectId: P };
const at0 = (commands: Command[]): TimedCommand[] => commands.map((command) => ({ at: 0, command }));
const assign = (taskId: string, mode: Extract<Command, { type: 'AssignTask' }>['mode'], workerId: string): Command => ({
  type: 'AssignTask',
  projectId: P,
  taskId,
  mode,
  workerId,
});
const ofType = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe('StartProject / AssignTask', () => {
  it('案件を開始すると全 Task が待機状態で並ぶ。二重開始・未定義の案件は無視する', () => {
    const s = reduce(createInitialState('c'), start).state;
    expect(Object.keys(s.projects[P]?.tasks ?? {})).toEqual([
      'hearing',
      'requirements',
      'uiDesign',
      'research',
      'implementation',
      'qa',
      'release',
    ]);
    expect(reduce(s, start).state).toBe(s);
    expect(reduce(s, { type: 'StartProject', projectId: 'nope' }).state).toBe(s);
  });

  it('モードと Worker の種類が合わない割り当ては無視する', () => {
    const s = reduce(createInitialState('c'), start).state;
    expect(reduce(s, assign('hearing', 'human', 'agent')).state).toBe(s);
    expect(reduce(s, assign('hearing', 'ai', 'sato')).state).toBe(s);
    expect(reduce(s, assign('nope', 'human', 'sato')).state).toBe(s);
    expect(reduce(s, assign('hearing', 'human', 'nobody')).state).toBe(s);
    const ok = reduce(s, assign('hearing', 'aiThenHumanReview', 'agent')).state;
    expect(ok.projects[P]?.tasks.hearing?.assignment).toEqual({ mode: 'aiThenHumanReview', workerId: 'agent' });
  });

  it('開始した Task の担当は変えられない', () => {
    const { state } = runHeadless({ seed: 'c', commands: at0([start, assign('hearing', 'human', 'sato')]), until: 5 });
    expect(state.projects[P]?.tasks.hearing?.status).toBe('running');
    expect(reduce(state, assign('hearing', 'human', 'suzuki')).state).toBe(state);
  });
});

describe('Task の進行', () => {
  it('依存が完了するまで始まらず、依存の順に開始・完了する', () => {
    const { events, state } = playProject(P, strategies.allHuman(P), 'flow');
    const started = ofType(events, 'TaskStarted').map((e) => e.taskId);
    expect(started.indexOf('hearing')).toBeLessThan(started.indexOf('requirements'));
    expect(started.indexOf('uiDesign')).toBeLessThan(started.indexOf('implementation'));
    const tasks = state.projects[P]?.tasks;
    // 実装は UI設計と競合調査の両方が終わった時点で始まる（並行作業の合流点）
    expect(tasks?.implementation?.startedAt).toBe(
      Math.max(tasks?.uiDesign?.completedAt ?? Infinity, tasks?.research?.completedAt ?? Infinity),
    );
    for (const task of getProject(P).tasks) {
      const ends = task.deps.map((d) => tasks?.[d]?.completedAt ?? Infinity);
      if (ends.length > 0) expect(tasks?.[task.id]?.startedAt).toBe(Math.max(...ends));
    }
    expect(started.at(-1)).toBe('release');
    expect(ofType(events, 'TaskCompleted')).toHaveLength(7);
    expect(ofType(events, 'ProjectCompleted')).toEqual([{ type: 'ProjectCompleted', projectId: P }]);
    expect(state.projects[P]?.completedAt).not.toBeNull();
  });

  // 所要時間を数値で確かめるので、速度がちょうど平均の2人で進める
  const [A, B] = AVERAGE_TEAM;
  // 時計の 0 は始業。昼休み（13:00〜14:00）は人間が手を止めるので、そこをまたぐ人間の作業はその分だけ遅く終わる
  const w = balance.time.workday;
  const lunchAt = w.lunchStart - w.start;
  const lunch = w.lunchEnd - w.lunchStart;
  const withLunch = (end: number) => (end > lunchAt ? end + lunch : end);
  const average = (seed: string) => createInitialState(seed, { team: AVERAGE_TEAM });

  it('依存が解決した Task は、前の担当者が誰でも同じ時刻に始まり、次のステップから進む', () => {
    const finish = (next: string) => {
      const cmds = at0([start, assign('hearing', 'human', A), assign('requirements', 'human', next)]);
      const t = runHeadless({ seed: 'u', initial: average('u'), commands: cmds, until: 400 }).state.projects[P]?.tasks;
      return [t?.requirements?.startedAt, t?.requirements?.completedAt];
    };
    expect(finish(A)).toEqual([90, withLunch(90 + 120)]);
    expect(finish(B)).toEqual([90, withLunch(90 + 120)]);
  });

  it('人間1人は同時に1件しか処理しない（同じ人に並べると直列になる）', () => {
    const solo = at0([
      start,
      assign('hearing', 'human', A),
      assign('requirements', 'human', A),
      assign('uiDesign', 'human', A),
      assign('research', 'human', A),
    ]);
    const split = at0([
      start,
      assign('hearing', 'human', A),
      assign('requirements', 'human', A),
      assign('uiDesign', 'human', A),
      assign('research', 'human', B),
    ]);
    const done = (cmds: TimedCommand[]) => {
      const t = runHeadless({ seed: 'q', initial: average('q'), commands: cmds, until: 2_000 }).state.projects[P]
        ?.tasks;
      return Math.max(t?.uiDesign?.completedAt ?? Infinity, t?.research?.completedAt ?? Infinity);
    };
    // 90 + 120 のあと、UI設計 150 と 競合調査 120 を1人なら直列、2人なら並列で処理する
    expect(done(solo)).toBe(withLunch(90 + 120 + 150 + 120));
    expect(done(split)).toBe(withLunch(90 + 120 + 150));
  });

  it('レビューがあれば失敗は発見されて手戻りになり、品質は落ちない', () => {
    for (let i = 0; i < 10; i++) {
      const { events, state } = playProject(P, strategies.aiWithReview(P), `review-${i}`);
      const failed = ofType(events, 'TaskFailed').length;
      expect(ofType(events, 'ReworkDetected')).toHaveLength(failed);
      for (const t of Object.values(state.projects[P]?.tasks ?? {})) {
        expect(t.quality).toBe(1);
        expect(t.reworks).toBe(t.failures);
      }
    }
  });

  it('レビューがなければ失敗は見逃され、その Task の品質が下がる', () => {
    let escaped = 0;
    for (let i = 0; i < 10; i++) {
      const { events, state } = playProject(P, strategies.allAiNoReview(P), `noreview-${i}`);
      expect(ofType(events, 'ReworkDetected')).toEqual([]);
      for (const e of ofType(events, 'TaskFailed')) {
        const t = state.projects[P]?.tasks[e.taskId];
        expect(t?.escaped).toBe(true);
        expect(t?.quality).toBeLessThan(1);
        escaped++;
      }
    }
    expect(escaped).toBeGreaterThan(0);
  });

  it('Agent Workflow は前の Task も Agent Workflow なら指示出しなしで続けて実行する', () => {
    const chain = (mode: 'ai' | 'agentWorkflow') =>
      at0([start, ...['hearing', 'requirements', 'uiDesign', 'research'].map((id) => assign(id, mode, 'agent'))]);
    const human = (cmds: TimedCommand[]) => {
      const t = runHeadless({ seed: 'wf', commands: cmds, until: 600 }).state.projects[P]?.tasks ?? {};
      return Object.values(t).reduce((sum, r) => sum + r.humanMinutes, 0);
    };
    // 指示出しは先頭の顧客要望整理だけになる
    expect(human(chain('agentWorkflow'))).toBeLessThan(human(chain('ai')));
    expect(human(chain('agentWorkflow'))).toBeGreaterThan(0);
  });

  it('AI は人間を待たずに作業し、AI の時間と費用が記録される', () => {
    const { state } = playProject(P, strategies.allAiNoReview(P), 'ai');
    const research = state.projects[P]?.tasks.research;
    expect(research?.aiMinutes).toBeGreaterThan(0);
    expect(research?.aiCost).toBeGreaterThan(0);
  });
});
