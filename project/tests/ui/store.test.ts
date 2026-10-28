import { describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { balance } from '../../src/content/balance';
import type { GameEvent } from '../../src/core/events';
import { createInitialState } from '../../src/core/state';
import { advanceDay, advanceUntilDecision } from '../../src/core/turn';
import { campaignInProgress } from '../helpers/session';

const DAY = balance.time.minutesPerDay;

describe('createGameStore', () => {
  it('dispatch で Command を適用し、events を購読者に渡す', () => {
    const store = createGameStore(createInitialState('store', { board: true }));
    const received: GameEvent[] = [];
    store.onEvents((events) => received.push(...events));
    store.dispatch({ type: 'StartProject', projectId: 'tutorialLp' });
    store.dispatch({ type: 'SkipTutorial' });
    expect(store.state().tutorial).toBeNull();
    expect(received).toContainEqual({ type: 'TutorialEnded', skipped: true });
  });

  it('購読を解除すると events が届かなくなる', () => {
    const store = createGameStore(createInitialState('store', { board: true }));
    store.dispatch({ type: 'StartProject', projectId: 'tutorialLp' });
    let count = 0;
    const off = store.onEvents(() => count++);
    store.dispatch({ type: 'SkipTutorial' });
    off();
    store.play(false);
    store.advance(DAY);
    expect(count).toBe(1);
  });
});

describe('プレイヤーが進める日（store の play・stop・advance）', () => {
  it('進めていない間は、advance を呼んでも時間は進まない', () => {
    const store = createGameStore(campaignInProgress());
    expect(store.run()).toBeNull();
    store.advance(60);
    expect(store.state().clock).toBe(0);
  });

  it('play で次の始業までの日ができ、advance で少しずつ進めて、次の始業ちょうどに着くと止まる', () => {
    const store = createGameStore(campaignInProgress());
    store.play(false);
    expect(store.run()).toEqual({ target: DAY, untilDecision: false, days: 1 });
    store.advance(100);
    expect(store.state().clock).toBe(100);
    expect(store.run()).not.toBeNull();
    // 残りより多く渡しても、次の始業を越えない
    store.advance(DAY * 3);
    expect(store.state().clock).toBe(DAY);
    expect(store.run()).toBeNull();
    store.advance(60);
    expect(store.state().clock).toBe(DAY);
  });

  it('1日だけ進めた結果は、core の advanceDay と同じになる', () => {
    const initial = campaignInProgress('store-day');
    const store = createGameStore(initial);
    store.play(false);
    for (let i = 0; i < 50 && store.run(); i++) store.advance(37.3);
    const expected = advanceDay(initial).state;
    expect(store.state().clock).toBe(expected.clock);
    expect(store.state().projects).toEqual(expected.projects);
  });

  it('判断が必要になるまで進めるなら、判断が要らない日の終わりでは次の日へ続け、判断が要る日の終わりで止まる', () => {
    const initial = campaignInProgress();
    const store = createGameStore(initial);
    store.play(true);
    expect(store.run()).toMatchObject({ target: DAY, untilDecision: true, days: 1 });
    store.advance(DAY);
    // 1日目の終わりは判断が要らない（担当はすべて決まっていて、案件が進んでいる）
    expect(store.run()).toEqual({ target: DAY * 2, untilDecision: true, days: 2 });
    for (let i = 0; i < balance.time.maxSkipDays && store.run(); i++) store.advance(DAY);
    expect(store.run()).toBeNull();
    expect(store.state().clock).toBe(advanceUntilDecision(initial).state.clock);
  });

  it('1日だけ進めるなら、判断が要らなくても日の終わりで止まる', () => {
    const store = createGameStore(campaignInProgress());
    store.play(false);
    store.advance(DAY);
    expect(store.state().clock).toBe(DAY);
    expect(store.run()).toBeNull();
  });

  it('進めている最中にもう一度 play すると止まり、次に進めるときは同じ日の終わりまで', () => {
    const store = createGameStore(campaignInProgress());
    store.play(true);
    store.advance(300);
    store.play(true);
    expect(store.run()).toBeNull();
    store.advance(60);
    expect(store.state().clock).toBe(300);
    store.play(false);
    expect(store.run()?.target).toBe(DAY);
  });

  it('stop で進めている日を止める', () => {
    const store = createGameStore(campaignInProgress());
    store.play(false);
    store.advance(120);
    store.stop();
    expect(store.run()).toBeNull();
    store.advance(60);
    expect(store.state().clock).toBe(120);
  });

  it('倒産した会社は進められない', () => {
    const s = createInitialState('store-broke', { board: true, tutorial: false });
    const broke = { ...s, funds: { ...s.funds, bankruptAt: 0 } };
    const store = createGameStore(broke);
    store.play(false);
    expect(store.run()).toBeNull();
  });
});
