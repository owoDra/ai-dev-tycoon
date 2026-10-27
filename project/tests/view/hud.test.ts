import { describe, expect, it } from 'vitest';
import { getProject } from '../../src/content/index';
import { reduce } from '../../src/core/commands';
import { getSession } from '../../src/core/context';
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
    const allHuman = hudView(s, P)?.profitPerPersonDay ?? 0;
    const withAi = reduce(s, {
      type: 'AssignTask',
      projectId: P,
      taskId: 'implementation',
      mode: 'aiThenHumanReview',
      workerId: 'agent',
    }).state;
    expect(allHuman).toBeGreaterThan(0);
    expect(hudView(withAi, P)?.profitPerPersonDay ?? 0).toBeGreaterThan(allHuman);
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
    expect(hud?.profitPerPersonDay).toBeGreaterThan(0);
    expect(hud?.human).toBeGreaterThan(0);

    const done = playProject(P, strategies.smart(P), 'hud');
    const final = hudView(done.state, P);
    expect(final?.projected).toBe(false);
    expect(final?.profitPerPersonDay).toBeCloseTo(done.score.profitPerPersonDay);
  });
});

describe('見込みと Context（決済画面の修正）', () => {
  const PF = 'paymentFix';
  const assigned = () => {
    let s = reduce(createInitialState('hud-ctx'), { type: 'StartProject', projectId: PF }).state;
    for (const c of strategies.aiWithReview(PF)(s)) s = reduce(s, c).state;
    return s;
  };
  const projected = (s: ReturnType<typeof assigned>) => hudView(s, PF)?.profitPerPersonDay ?? 0;

  it('資料の渡し方で見込みが動く：「必要な資料だけ」は「すべての資料」より高い', () => {
    const all = assigned();
    const needed = reduce(all, { type: 'SetContextFeed', workerId: 'agent', feed: { mode: 'needed' } }).state;
    expect(projected(needed)).toBeGreaterThan(projected(all));
  });

  it('事件が起きると見込みが下がり、解決すると戻る', () => {
    const s = assigned();
    const withIncident = {
      ...s,
      incidents: [{ id: 'staleContext' as const, workerId: 'agent', projectId: PF, taskId: 'fix', since: 0 }],
    };
    expect(projected(withIncident)).toBeLessThan(projected(s));
    const resolved = reduce(withIncident, { type: 'ResolveIncident', incident: 'staleContext', workerId: 'agent' });
    expect(projected(resolved.state)).toBeGreaterThan(projected(withIncident));
  });

  it('長い Session は見込みを下げ、Handoff 付きの New Session で戻る', () => {
    const s = reduce(assigned(), { type: 'SetContextFeed', workerId: 'agent', feed: { mode: 'needed' } }).state;
    const long = { ...s, sessions: { ...s.sessions, agent: { ...getSession(s, 'agent'), age: 40 } } };
    expect(projected(long)).toBeLessThan(projected(s));
    const handoff = reduce(long, {
      type: 'SetHandoff',
      workerId: 'agent',
      items: ['goal', 'decisions', 'constraints', 'modifiedFiles', 'validation', 'remainingWork'],
    }).state;
    expect(projected(reduce(handoff, { type: 'NewSession', workerId: 'agent' }).state)).toBeGreaterThan(
      projected(long),
    );
  });
});
