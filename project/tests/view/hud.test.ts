import { describe, expect, it } from 'vitest';
import { getProject } from '../../src/content/index';
import { reduce } from '../../src/core/commands';
import { createInitialState } from '../../src/core/state';
import { hudView } from '../../src/view/hud';
import { runHeadless } from '../helpers/headless';
import { playProject, strategies } from '../helpers/strategies';

const P = 'ecRenewal';

describe('hudView', () => {
  it('未開始なら null、開始直後は納期まで丸ごと残り、1日目の始業時刻', () => {
    expect(hudView(createInitialState('hud'), P)).toBeNull();
    const s = reduce(createInitialState('hud'), { type: 'StartProject', projectId: P }).state;
    const hud = hudView(s, P);
    expect(hud?.remaining).toEqual({ days: getProject(P).deadlineDays, time: '0:00', overdue: false });
    expect(hud?.today).toEqual({ day: 1, time: '9:00' });
    expect(hud?.projected).toBe(true);
  });

  it('見込みは担当で動く：実装を AI に任せてレビューすると、全部人間のときより上がる', () => {
    const s = reduce(createInitialState('hud'), { type: 'StartProject', projectId: P }).state;
    const allHuman = hudView(s, P)?.profitPerHumanHour ?? 0;
    const withAi = reduce(s, {
      type: 'AssignTask',
      projectId: P,
      taskId: 'implementation',
      mode: 'aiThenHumanReview',
      workerId: 'agent',
    }).state;
    expect(allHuman).toBeGreaterThan(0);
    expect(hudView(withAi, P)?.profitPerHumanHour ?? 0).toBeGreaterThan(allHuman);
  });

  it('納品前は売上を入れた見込みを出し、納品後は確定値になる', () => {
    const commands = [
      { type: 'StartProject', projectId: P } as const,
      { type: 'AssignTask', projectId: P, taskId: 'hearing', mode: 'human', workerId: 'sato' } as const,
    ];
    const { state } = runHeadless({
      seed: 'hud',
      commands: commands.map((command) => ({ at: 0, command })),
      until: 30,
    });
    const hud = hudView(state, P);
    expect(hud?.projected).toBe(true);
    expect(hud?.profitPerHumanHour).toBeGreaterThan(0);
    expect(hud?.human).toBeGreaterThan(0);

    const done = playProject(P, strategies.smart(P), 'hud');
    const final = hudView(done.state, P);
    expect(final?.projected).toBe(false);
    expect(final?.profitPerHumanHour).toBeCloseTo(done.score.profitPerHumanHour);
  });
});
