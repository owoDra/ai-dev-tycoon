import { describe, expect, it } from 'vitest';
import { content } from '../../src/content/index';
import type { IncidentId } from '../../src/content/types';
import { reduce } from '../../src/core/commands';
import { getSession, readContext } from '../../src/core/context';
import type { GameEvent } from '../../src/core/events';
import { getIncidentDef, incidentChance, incidentEffects, incidentHolds } from '../../src/core/incidents';
import { createInitialState, createSession, type GameState, type SessionRun } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { runHeadless } from '../helpers/headless';
import { strategies } from '../helpers/strategies';

const P = 'paymentFix';
const AGENT = 'agent';

function withIncident(id: IncidentId, session: Partial<SessionRun> = {}): GameState {
  const s = createInitialState('inc');
  return {
    ...s,
    sessions: { ...s.sessions, [AGENT]: { ...createSession(), ...session } },
    incidents: [{ id, workerId: AGENT, projectId: P, taskId: 'fix', since: 0 }],
  };
}

describe('事件の発生条件（core/incidents.ts）', () => {
  it('条件を満たすほど発生確率が上がり、満たさなければ 0', () => {
    const overflow = getIncidentDef('contextOverflow');
    const at = (age: number) => readContext({ ...createSession(), feed: { mode: 'router' }, age }, P, 'fix');
    expect(incidentChance(overflow, at(0))).toBe(0);
    expect(incidentChance(overflow, at(45))).toBeGreaterThan(0);
    expect(incidentChance(overflow, at(50))).toBeGreaterThan(incidentChance(overflow, at(45)));

    const stale = getIncidentDef('staleContext');
    const conflict = getIncidentDef('instructionConflict');
    const all = readContext({ ...createSession(), feed: { mode: 'all' } }, P, 'fix');
    const needed = readContext({ ...createSession(), feed: { mode: 'needed' } }, P, 'fix');
    expect(incidentChance(stale, all)).toBeGreaterThan(incidentChance(stale, needed));
    expect(incidentChance(conflict, all)).toBeGreaterThan(incidentChance(conflict, needed));
  });

  it('「すべての資料」で AI に任せると事件が起き、「必要な資料だけ」より多い', () => {
    const count = (feed: 'all' | 'needed') => {
      let total = 0;
      for (let i = 0; i < 10; i++) {
        let s = createInitialState(`inc-${i}`);
        s = reduce(s, { type: 'StartProject', projectId: P }).state;
        for (const c of strategies.aiWithReview(P)(s)) s = reduce(s, c).state;
        s = reduce(s, { type: 'SetContextFeed', workerId: AGENT, feed: { mode: feed } }).state;
        const r = runHeadless({ seed: `inc-${i}`, initial: s, until: 2000 });
        total += r.events.filter((e) => e.type === 'IncidentStarted').length;
      }
      return total;
    };
    expect(count('all')).toBeGreaterThan(count('needed'));
  });

  it('発生中の事件は AI の作業の成功確率を下げる', () => {
    expect(incidentEffects(withIncident('staleContext'), AGENT).successPenalty).toBeGreaterThan(0);
    expect(incidentEffects(createInitialState('inc'), AGENT).successPenalty).toBe(0);
  });
});

describe('事件の解決', () => {
  it.each(content.incidents.map((d) => d.id))('%s は解決アクションで解消し、原因も取り除かれる', (id) => {
    const before = withIncident(id, { feed: { mode: 'all' }, age: 40 });
    const r = reduce(before, { type: 'ResolveIncident', incident: id, workerId: AGENT });
    expect(r.state.incidents).toEqual([]);
    expect(r.events).toContainEqual<GameEvent>({ type: 'IncidentResolved', incident: id, workerId: AGENT });
    expect(r.state.contextStats.resolved).toBe(1);
    const reading = readContext(getSession(r.state, AGENT), P, 'fix');
    expect(incidentHolds(getIncidentDef(id), reading)).toBe(false);
  });

  it('プレイヤーが自分で原因を取り除いても解消する（古い資料を外す）', () => {
    const before = withIncident('staleContext', { feed: { mode: 'all' } });
    const r = reduce(before, { type: 'SetContextFeed', workerId: AGENT, feed: { mode: 'needed' } });
    expect(r.state.incidents).toEqual([]);
  });

  it('発生していない事件の解決は何もしない', () => {
    const s = createInitialState('inc');
    expect(reduce(s, { type: 'ResolveIncident', incident: 'staleContext', workerId: AGENT }).state).toBe(s);
  });

  it('すべての事件に 問題 → 原因 → 次の行動 の文言がある（企画書49章）', () => {
    for (const d of content.incidents) {
      const t = ja.incidents[d.id];
      for (const text of [t.name, t.problem, t.cause, t.action]) expect(text, d.id).not.toBe('');
    }
  });
});
