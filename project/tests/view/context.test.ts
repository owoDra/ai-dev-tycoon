import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/core/commands';
import { createInitialState, type GameState } from '../../src/core/state';
import { adviseProblems } from '../../src/view/advice';
import { contextView, toggleDoc } from '../../src/view/context';

const P = 'paymentFix';
const started = (s: GameState = createInitialState('ctx-view')) =>
  reduce(s, { type: 'StartProject', projectId: P }).state;

describe('Context の表示（view/context.ts）', () => {
  it('解放済みの範囲の渡し方と、資料の一覧（古い・矛盾の印付き）を出す', () => {
    const v = contextView(started(), P);
    expect(v?.feeds).toEqual(['needed', 'all', 'pick', 'router']);
    expect(v?.docs.some((d) => d.stale)).toBe(true);
    expect(v?.docs.some((d) => d.conflict)).toBe(true);
    expect(v?.status).toBe('cluttered');
  });

  it('解放されるまでは2択だけ、Context 自体が未解放なら null', () => {
    const base = started();
    const two = contextView({ ...base, unlocked: ['context'] }, P);
    expect(two?.feeds).toEqual(['needed', 'all']);
    expect(two?.session).toBeNull();
    expect(contextView({ ...base, unlocked: [] }, P)).toBeNull();
    expect(contextView(started(), 'ecRenewal')).toBeNull();
  });

  it('資料を1つ外すと、残りを個別に選んだ渡し方になる', () => {
    const s = started();
    const feed = toggleDoc(s, P, 'agent', 'oldPaymentSpec');
    expect(feed.mode).toBe('pick');
    expect(feed.mode === 'pick' && feed.docs.includes('oldPaymentSpec')).toBe(false);
  });

  it('事件はボトルネックや担当未定より先に出る', () => {
    const s = started();
    const withIncident: GameState = {
      ...s,
      incidents: [{ id: 'contextOverflow', workerId: 'agent', projectId: P, taskId: 'fix', since: 0 }],
    };
    const problems = adviseProblems(withIncident, P);
    expect(problems[0]?.kind).toBe('incident');
    expect(problems[0]?.incident).toEqual({ id: 'contextOverflow', workerId: 'agent' });
    expect(problems.length).toBeGreaterThan(1);
  });
});
