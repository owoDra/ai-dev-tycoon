import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { awayLimit, awayMinutes, catchUp, dayEnd, runsUnattended } from '../../src/core/away';
import { reduce } from '../../src/core/commands';
import { createInitialState } from '../../src/core/state';
import { awaitingAssignment, step } from '../../src/core/step';
import { campaignInProgress } from '../helpers/session';

const DAY = balance.time.minutesPerDay;
const PER_SECOND = balance.time.minutesPerRealSecond * balance.away.speed;

describe('営業日の終わりと、閉じている間の進行（core/away.ts）', () => {
  it('今の営業日の終わり。ちょうど境目なら次の営業日の終わり', () => {
    expect(dayEnd(0)).toBe(DAY);
    expect(dayEnd(DAY - 1)).toBe(DAY);
    expect(dayEnd(DAY)).toBe(DAY * 2);
  });

  it('案件ボードのある会社で、チュートリアルを終えていて、進行中の案件か結果待ちの見積があるときだけ対象になる', () => {
    expect(runsUnattended(createInitialState('s'))).toBe(false);
    const tutorial = reduce(createInitialState('s', { board: true }), {
      type: 'StartProject',
      projectId: 'tutorialLp',
    }).state;
    expect(runsUnattended(tutorial)).toBe(false);
    expect(awayMinutes(tutorial, 600)).toBe(0);
    expect(runsUnattended(campaignInProgress())).toBe(true);
    // 案件の合間でも、見積の結果を待っていれば時間が進む（締切に結果が出る）
    const waiting = { ...campaignInProgress(), projects: {} };
    expect(runsUnattended(waiting)).toBe(false);
    const inquiry = { projectId: 'p~1~S', postedDay: 0, closesAt: 960, bid: null };
    const board = { day: 0, inquiries: [inquiry], results: [] };
    expect(runsUnattended({ ...waiting, board })).toBe(false);
    const bid = { price: 'base' as const, deadline: 'standard' as const, amount: 1, deadlineDays: 1, winChance: 0.5 };
    expect(runsUnattended({ ...waiting, board: { ...board, inquiries: [{ ...inquiry, bid }] } })).toBe(true);
  });

  it('閉じていた実時間を1倍速で換算し、その営業日の終わりまでで止める', () => {
    const s = campaignInProgress();
    expect(awayMinutes(s, 0)).toBe(0);
    expect(awayMinutes(s, -5)).toBe(0);
    expect(awayMinutes(s, 30)).toBe(30 * PER_SECOND);
    expect(awayMinutes(s, 24 * 60 * 60)).toBe(DAY - s.clock);
  });

  it('進行は時間を進める step と同じ結果になり（決定論的）、一時停止の状態は元に戻す', () => {
    const s = { ...campaignInProgress(), paused: true };
    const r = catchUp(s, 60);
    const expected = step({ ...s, paused: false }, 60 * PER_SECOND);
    expect(r.state).toEqual({ ...expected.state, paused: true });
    expect(r.events).toEqual(expected.events);
    expect(r.events.some((e) => e.type === 'TaskStarted')).toBe(true);
  });

  it('長く閉じていても、ちょうど営業日の境目で止まる（その先は次の区切りで判断する）', () => {
    const s = campaignInProgress();
    const r = catchUp(s, 24 * 60 * 60);
    expect(r.state.clock).toBe(DAY);
    expect(r.state.carryMinutes).toBe(0);
    // 境目から再開して閉じたら、次の営業日の終わりまで進む
    expect(catchUp(r.state, 24 * 60 * 60).state.clock).toBe(DAY * 2);
    // 対象外なら何もしない
    const idle = createInitialState('s');
    expect(catchUp(idle, 600).state).toBe(idle);
  });
});

describe('閉じている間の進行は、プレイヤーの判断が要るところで止まる（core/away.ts）', () => {
  it('担当が決まっていない Task で案件が進められなくなったら、そこで止まる（納期だけを減らさない）', () => {
    // 最後の Task だけ担当を決めずにおく
    const s = campaignInProgress('away-stall', 1);
    expect(awaitingAssignment(s)).toBe(false);
    const r = catchUp(s, 24 * 60 * 60);
    expect(r.state.clock).toBeLessThan(dayEnd(s.clock));
    expect(awaitingAssignment(r.state)).toBe(true);
    // 担当待ちから始めたら、まったく進めない
    expect(catchUp(r.state, 24 * 60 * 60).state.clock).toBe(r.state.clock);
  });

  it('見積を出していない引き合いは、締切まで balance.board.minOpenMinutes を残して止まる', () => {
    const s = campaignInProgress();
    const closesAt = s.clock + 300;
    const inquiry = { projectId: 'p~1~S', postedDay: 0, closesAt, bid: null };
    const withInquiry = { ...s, board: { day: 0, inquiries: [inquiry], results: [] } };
    expect(awayLimit(withInquiry)).toBe(closesAt - balance.board.minOpenMinutes);
    const r = catchUp(withInquiry, 24 * 60 * 60);
    expect(r.state.clock).toBe(closesAt - balance.board.minOpenMinutes);
    expect(r.state.board?.inquiries).toHaveLength(1);
    // 見積を出した引き合いは結果を待つだけなので、止めない
    const bid = { price: 'base' as const, deadline: 'standard' as const, amount: 1, deadlineDays: 1, winChance: 0 };
    expect(awayLimit({ ...withInquiry, board: { day: 0, inquiries: [{ ...inquiry, bid }], results: [] } })).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});
