import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { documentsOf, handoffItems } from '../../src/content/documents';
import { reduce } from '../../src/core/commands';
import {
  contextEffects,
  contextStatus,
  getSession,
  itemsToLose,
  lossEffects,
  projectNeededDocs,
  readContext,
} from '../../src/core/context';
import type { GameEvent } from '../../src/core/events';
import { createInitialState, createSession, type GameState, type SessionRun } from '../../src/core/state';

const P = 'paymentFix';
const AGENT = 'agent';
const pick = (docs: string[]): SessionRun => ({ ...createSession(), feed: { mode: 'pick', docs } });

function aged(minutes: number, extra: Partial<SessionRun> = {}): GameState {
  const s = createInitialState('ctx');
  return { ...s, sessions: { ...s.sessions, [AGENT]: { ...createSession(), age: minutes, ...extra } } };
}

describe('Context の読み取り（core/context.ts）', () => {
  it('無関係な資料を足すと noise が増え、relevant は変わらない', () => {
    const base = readContext(pick(['paymentSpec', 'paymentCode']), P, 'fix');
    const noisy = readContext(pick(['paymentSpec', 'paymentCode', 'unrelatedIssues']), P, 'fix');
    expect(noisy.noise).toBeGreaterThan(base.noise);
    expect(noisy.relevant).toBe(base.relevant);
    expect(contextEffects(noisy).successPenalty).toBeGreaterThan(contextEffects(base).successPenalty);
    expect(contextEffects(noisy).costFactor).toBeGreaterThan(contextEffects(base).costFactor);
  });

  it('Task に必要な資料が欠けると coverage が下がる。Router はその Task に必要な資料だけを渡し、noise は 0', () => {
    expect(readContext(pick(['paymentSpec']), P, 'fix').coverage).toBeLessThan(1);
    const routed = readContext({ ...createSession(), feed: { mode: 'router' } }, P, 'fix');
    expect(routed.coverage).toBe(1);
    expect(routed.noise).toBe(0);
  });

  it('「すべての資料」は古い仕様と矛盾するルールを含み、「必要な資料だけ」は含まない', () => {
    const all = readContext({ ...createSession(), feed: { mode: 'all' } }, P, 'fix');
    const needed = readContext({ ...createSession(), feed: { mode: 'needed' } }, P, 'fix');
    expect(all.stale).toBeGreaterThan(0);
    expect(all.conflicts).toBeGreaterThan(0);
    expect(contextEffects(all).staleChance).toBeGreaterThan(0);
    expect(needed.stale).toBe(0);
    expect(needed.conflicts).toBe(0);
    expect(needed.noise).toBeLessThan(all.noise);
    expect(projectNeededDocs(P).length).toBeLessThan(documentsOf(P).length);
  });

  it('Session を続けると noise が溜まり、状態が 良好 → 散らかり → 溢れ と変わる', () => {
    const at = (age: number) => readContext({ ...createSession(), feed: { mode: 'router' }, age }, P, 'fix');
    expect(at(10).noise).toBeGreaterThan(at(0).noise);
    expect(contextStatus(at(0))).toBe('good');
    expect(contextStatus(at(30))).toBe('cluttered');
    expect(contextStatus(at(100))).toBe('overflow');
  });

  it('資料を持たない案件では Context は常に良好で、影響がない', () => {
    const r = readContext({ ...createSession(), age: 500 }, 'ecRenewal', 'implementation');
    expect(contextStatus(r)).toBe('good');
    expect(contextEffects(r)).toEqual({ successPenalty: 0, staleChance: 0, costFactor: 1, toolMissChance: 0 });
  });
});

describe('Session Reset / Handoff', () => {
  it('NewSession で noise が 0 になる（資料の noise がない渡し方のとき）', () => {
    const before = aged(40, { feed: { mode: 'router' } });
    expect(readContext(getSession(before, AGENT), P, 'fix').noise).toBeGreaterThan(0);
    const after = reduce(before, { type: 'NewSession', workerId: AGENT }).state;
    expect(getSession(after, AGENT).age).toBe(0);
    expect(readContext(getSession(after, AGENT), P, 'fix').noise).toBe(0);
  });

  it('Handoff なしの Reset は全項目を失い（Important Decisions Lost）、AI の作業に影響する', () => {
    const r = reduce(aged(40), { type: 'NewSession', workerId: AGENT });
    const session = getSession(r.state, AGENT);
    expect(session.lost).toEqual(handoffItems);
    expect(session.recover).toBe(balance.handoff.recoverWorks);
    expect(lossEffects(session).successPenalty).toBeGreaterThan(0);
    expect(r.events).toContainEqual<GameEvent>({ type: 'SessionReset', workerId: AGENT, lost: handoffItems });
  });

  it('欠けた項目に応じた影響だけが出る。Decisions を欠くと Goal を欠くより重い', () => {
    const lose = (missing: string) =>
      lossEffects(
        getSession(
          reduce(aged(40, { handoff: handoffItems.filter((i) => i !== missing) }), {
            type: 'NewSession',
            workerId: AGENT,
          }).state,
          AGENT,
        ),
      );
    expect(lose('decisions').successPenalty).toBeGreaterThan(lose('goal').successPenalty);
    expect(lose('modifiedFiles').relearnShare).toBeGreaterThan(0);
    expect(lose('decisions').relearnShare).toBe(0);
  });

  it('Handoff ですべて残せば何も失わず、引き継いだ状態が relevant に入る', () => {
    const s = reduce(aged(40, { handoff: handoffItems }), { type: 'NewSession', workerId: AGENT }).state;
    const session = getSession(s, AGENT);
    expect(session.lost).toEqual([]);
    expect(session.carried).toBe(handoffItems.length * balance.handoff.itemSize);
    expect(s.contextStats.handoffResets).toBe(1);
  });

  it('Artifact Driven Work は成果物に残る項目（Modified Files・Validation・Remaining Work）を失わない', () => {
    const lost = itemsToLose({ ...createSession(), age: 40, artifacts: true });
    expect(lost).toEqual(['goal', 'decisions', 'constraints']);
  });

  it('履歴のない Session の Reset は何も失わない', () => {
    expect(itemsToLose(createSession())).toEqual([]);
  });

  it('資料の渡し方は解放済みの範囲でだけ変えられる', () => {
    const locked = { ...createInitialState('ctx'), unlocked: [] };
    expect(reduce(locked, { type: 'SetContextFeed', workerId: AGENT, feed: { mode: 'needed' } }).state).toBe(locked);
    const s = reduce(createInitialState('ctx'), { type: 'SetContextFeed', workerId: AGENT, feed: { mode: 'needed' } });
    expect(getSession(s.state, AGENT).feed).toEqual({ mode: 'needed' });
    const bad = reduce(createInitialState('ctx'), {
      type: 'SetContextFeed',
      workerId: AGENT,
      feed: { mode: 'pick', docs: ['nope'] },
    });
    expect(getSession(bad.state, AGENT).feed).toEqual({ mode: 'all' });
  });
});
