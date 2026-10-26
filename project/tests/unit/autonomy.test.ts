import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { autonomyOf, autonomySummary, autonomySystem, intervene } from '../../src/core/autonomy';
import { reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { createRngCursor } from '../../src/core/rng';
import { createInitialState, type GameState, updateTask } from '../../src/core/state';
import { step } from '../../src/core/step';

const P = 'ecRenewal';
const AGENT = 'agent';

/** hearing を AI が作業中の state（工程はずっと AI の作業のまま） */
function aiWorking(): GameState {
  let s = reduce(createInitialState('auto'), { type: 'StartProject', projectId: P }).state;
  s = reduce(s, { type: 'AssignTask', projectId: P, taskId: 'hearing', mode: 'ai', workerId: AGENT }).state;
  return updateTask(s, P, 'hearing', (r) => ({ ...r, status: 'running', stepIndex: 1, phase: 'work', remaining: 1e9 }));
}

function tick(s: GameState, n: number): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let state = s;
  const ctx = { rng: createRngCursor(1), emit: (e: GameEvent) => events.push(e) };
  for (let i = 0; i < n; i++) state = autonomySystem({ ...state, clock: state.clock + 1 }, ctx);
  return { state, events };
}

describe('Autonomy Streak（core/autonomy.ts）', () => {
  it('AI が処理している間だけ Streak が伸び、何も処理していなければ伸びない', () => {
    expect(autonomyOf(tick(createInitialState('auto'), 10).state, AGENT).streak).toBe(0);
    expect(autonomyOf(tick(aiWorking(), 10).state, AGENT).streak).toBe(10);
  });

  it('人間が介入すると Streak がリセットされ、介入間隔として記録される', () => {
    let s = tick(aiWorking(), 12).state;
    s = intervene(s, AGENT);
    expect(autonomyOf(s, AGENT).streak).toBe(0);
    s = intervene(tick(s, 30).state, AGENT);
    expect(autonomySummary(s, AGENT)).toEqual({ average: 21, longest: 30, current: 0 });
    // AI が何も処理していないうちの介入（指示出しの直後の確認など）は間隔に数えない
    expect(autonomyOf(intervene(s, AGENT), AGENT).intervals).toBe(2);
  });

  it('しきい値を超えるとイベントが1回だけ出て、リセット後にまた超えると再び出る', () => {
    const [first, second] = balance.autonomy.milestones;
    if (first === undefined || second === undefined) throw new Error('しきい値が足りない');
    const milestones = (events: readonly GameEvent[]) => events.filter((e) => e.type === 'AutonomyMilestone');

    const a = tick(aiWorking(), first + 5);
    expect(milestones(a.events)).toEqual([{ type: 'AutonomyMilestone', workerId: AGENT, minutes: first }]);
    const b = tick(a.state, second - first - 5);
    expect(milestones(b.events)).toEqual([{ type: 'AutonomyMilestone', workerId: AGENT, minutes: second }]);
    expect(milestones(tick(b.state, 1).events)).toEqual([]);

    const c = tick(intervene(b.state, AGENT), first);
    expect(milestones(c.events)).toEqual([{ type: 'AutonomyMilestone', workerId: AGENT, minutes: first }]);
  });

  it('ゲームの中では、AI → 人間レビューのレビューが始まると Streak が途切れる', () => {
    let s = reduce(createInitialState('auto'), { type: 'StartProject', projectId: P }).state;
    s = reduce(s, {
      type: 'AssignTask',
      projectId: P,
      taskId: 'hearing',
      mode: 'aiThenHumanReview',
      workerId: AGENT,
    }).state;
    let longest = 0;
    let sawReset = false;
    for (let i = 0; i < 400 && s.projects[P]?.tasks.hearing?.status !== 'done'; i++) {
      const before = autonomyOf(s, AGENT).streak;
      s = step(s, 1).state;
      longest = Math.max(longest, before);
      if (before > 0 && autonomyOf(s, AGENT).streak === 0) sawReset = true;
    }
    expect(longest).toBeGreaterThan(0);
    expect(sawReset).toBe(true);
    expect(autonomyOf(s, AGENT).intervals).toBeGreaterThanOrEqual(1);
  });
});
