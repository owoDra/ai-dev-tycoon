import { describe, expect, it } from 'vitest';
import { fxTable } from '../../src/content/fx';
import { worldLooks } from '../../src/content/look/world';
import { musicMomentum } from '../../src/content/music';
import { eventSfx } from '../../src/content/sfx';
import { reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { createInitialState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { ja } from '../../src/i18n/ja';
import { momentumInput, runningTasks } from '../../src/view/audio';
import { worldView } from '../../src/view/world';

const P = 'ecRenewal';

/** 企画書46章：音は補助。ミュートしても、音が伝えていることはすべて画面にも出ている */
describe('音だけで情報を伝えない', () => {
  it.each(fxTable.filter((d) => d.sfx.length > 0).map((d) => [d.id, d] as const))(
    '演出 %s の効果音には、通常時も reduced-motion 時も画面上の表示がある',
    (_id, def) => {
      expect(def.parts.length).toBeGreaterThan(0);
      expect(def.reducedAlternative.length).toBeGreaterThan(0);
      if (def.label) expect(ja.fx.labels[def.label.key]).not.toBe('');
    },
  );

  it('Task の開始の音（eventSfx.TaskStarted）は、島の「作業中」の表示と一緒に鳴る', () => {
    expect(eventSfx.TaskStarted).toBe('taskStart');
    let state = reduce(createInitialState('audio'), { type: 'StartProject', projectId: P }).state;
    const first = worldView(state, P, worldLooks.standard).islands[0];
    if (!first) throw new Error('島がない');
    const t = reduce(state, { type: 'AssignTask', projectId: P, taskId: first.taskId, mode: 'ai', workerId: 'agent' });
    state = t.state;
    const events: GameEvent[] = [...t.events];
    for (let i = 0; i < 4; i++) {
      const s = step(state, 1);
      state = s.state;
      events.push(...s.events);
    }
    const started = events.filter((e) => e.type === 'TaskStarted');
    expect(started.length).toBeGreaterThan(0);
    const vm = worldView(state, P, worldLooks.standard);
    for (const e of started) {
      if (e.type !== 'TaskStarted') continue;
      expect(vm.islands.find((i) => i.taskId === e.taskId)?.status).toBe('running');
      expect(ja.project.status.running).not.toBe('');
    }
    expect(runningTasks(state, P)).toBeGreaterThan(0);
  });
});

describe('BGM の勢いの入力', () => {
  it('作業中の Task・コンボ・窓の中の完了だけを数える', () => {
    const state = reduce(createInitialState('m'), { type: 'StartProject', projectId: P }).state;
    const w = musicMomentum.recentWindowMs;
    expect(momentumInput(state, P, 3, [0, w - 10, w + 5000], w + 5000, w)).toEqual({
      running: 0,
      combo: 3,
      recent: 2,
    });
    expect(runningTasks(state, 'nope')).toBe(0);
  });
});
