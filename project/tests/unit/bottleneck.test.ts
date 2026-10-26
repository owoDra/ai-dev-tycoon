import { describe, expect, it } from 'vitest';
import { bottleneckKey, bottleneckSystem, findBottleneck } from '../../src/core/bottleneck';
import { reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { createRngCursor } from '../../src/core/rng';
import { createInitialState, type GameState, updateTask } from '../../src/core/state';

const started = reduce(createInitialState('b'), { type: 'StartProject', projectId: 'ecRenewal' }).state;
const withLead = (s: GameState, taskId: string, work: number, review: number) =>
  updateTask(s, 'ecRenewal', taskId, (r) => ({ ...r, lead: { work, review } }));

describe('findBottleneck', () => {
  it('何も動いていなければ null', () => {
    expect(findBottleneck(createInitialState('b'))).toBeNull();
    expect(findBottleneck(started)).toBeNull();
  });

  it('リードタイムが最大の Task の工程を返す', () => {
    let s = withLead(started, 'implementation', 480, 0);
    s = withLead(s, 'qa', 180, 0);
    expect(findBottleneck(s)).toEqual({
      ref: { kind: 'stage', projectId: 'ecRenewal', taskId: 'implementation', stage: 'work' },
      minutes: 480,
    });
  });

  it('作業を短縮すると、レビューや次の工程へ移る（企画書20章）', () => {
    let s = withLead(started, 'implementation', 20, 120);
    s = withLead(s, 'qa', 180, 0);
    expect(findBottleneck(s)?.ref).toMatchObject({ taskId: 'qa', stage: 'work' });
    s = withLead(s, 'qa', 30, 0);
    expect(findBottleneck(s)?.ref).toMatchObject({ taskId: 'implementation', stage: 'review' });
  });

  it('待ち行列で待っている時間の合計が大きい人を返す', () => {
    const s: GameState = {
      ...withLead(started, 'implementation', 50, 0),
      clock: 100,
      humanQueues: {
        sato: [
          { projectId: 'ecRenewal', taskId: 'implementation', queuedAt: 0 },
          { projectId: 'ecRenewal', taskId: 'qa', queuedAt: 40 },
          { projectId: 'ecRenewal', taskId: 'release', queuedAt: 60 },
        ],
        suzuki: [{ projectId: 'ecRenewal', taskId: 'research', queuedAt: 0 }],
      },
    };
    // 先頭は処理中なので数えない：(100 - 40) + (100 - 60) = 100
    expect(findBottleneck(s)).toEqual({ ref: { kind: 'human', humanId: 'sato' }, minutes: 100 });
  });
});

describe('bottleneckSystem', () => {
  const run = (s: GameState) => {
    const events: GameEvent[] = [];
    const next = bottleneckSystem(s, { rng: createRngCursor(1), emit: (e) => events.push(e) });
    return { next, events };
  };

  it('ボトルネックが移ったときだけ BottleneckChanged を出す', () => {
    const a = run(withLead(started, 'implementation', 10, 0));
    expect(a.events).toEqual([{ type: 'BottleneckChanged', bottleneck: a.next.bottleneck }]);
    expect(bottleneckKey(a.next.bottleneck)).toBe('stage:ecRenewal/implementation/work');

    const same = run(withLead(a.next, 'implementation', 20, 0));
    expect(same.events).toEqual([]);

    const moved = run(withLead(withLead(same.next, 'implementation', 20, 0), 'qa', 30, 0));
    expect(moved.events).toHaveLength(1);
    expect(bottleneckKey(moved.next.bottleneck)).toBe('stage:ecRenewal/qa/work');
  });
});
