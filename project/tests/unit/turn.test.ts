import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { createInitialState } from '../../src/core/state';
import { step } from '../../src/core/step';
import type { System } from '../../src/core/system';
import {
  advanceDay,
  advanceUntilDecision,
  decisionNeeded,
  nextDayStart,
  unassignedProjects,
} from '../../src/core/turn';
import { campaignInProgress, SESSION_PROJECT } from '../helpers/session';

const DAY = balance.time.minutesPerDay;
const count = (events: readonly GameEvent[], type: GameEvent['type']) => events.filter((e) => e.type === type).length;

describe('1日ずつ進める（core/turn.ts）', () => {
  it('次の始業の時刻。ちょうど境目なら翌日の始業', () => {
    expect(nextDayStart(0)).toBe(DAY);
    expect(nextDayStart(DAY - 1)).toBe(DAY);
    expect(nextDayStart(DAY)).toBe(DAY * 2);
  });

  it('advanceDay は日の途中から呼んでも、次の始業ちょうどに着く（端数を残さない）', () => {
    const s = campaignInProgress();
    const half = step(s, 300.5).state;
    const r = advanceDay(half);
    expect(r.state.clock).toBe(DAY);
    expect(r.state.carryMinutes).toBe(0);
    // 始業ちょうどからなら、まる1日進む
    expect(advanceDay(r.state).state.clock).toBe(DAY * 2);
  });

  it('advanceDay は step で同じ時間を進めたのと同じ結果になる（決定論的）', () => {
    const s = campaignInProgress('turn-same');
    expect(advanceDay(s)).toEqual(step(s, DAY));
  });

  it('日の境目の処理（引き合いが届く）は、1日進めるごとに1回だけ走る', () => {
    let s = campaignInProgress('turn-boundary');
    for (let day = 0; day < 3; day++) {
      const r = advanceDay(s);
      expect(count(r.events, 'InquiriesPosted')).toBe(1);
      s = r.state;
    }
  });

  it('倒産したら、その日の途中でも止まる', () => {
    const s = {
      ...createInitialState('turn-broke', { board: true, tutorial: false }),
      idleCost: Number.MAX_SAFE_INTEGER,
    };
    let r = advanceDay(s);
    for (let day = 0; day < balance.funds.graceDays + 2; day++) r = advanceDay(r.state);
    expect(r.state.funds.bankruptAt).not.toBeNull();
    expect(advanceDay(r.state).state).toBe(r.state);
  });
});

describe('判断が要るか（core/turn.ts の decisionNeeded）', () => {
  it('すべての Task の担当が決まっていて、案件が進められるなら判断は要らない', () => {
    const s = campaignInProgress();
    expect(unassignedProjects(s)).toEqual([]);
    expect(decisionNeeded(s, [])).toBe(false);
  });

  it('担当が決まっていない、始められる Task がある案件があれば判断が要る', () => {
    // 最後の Task は、前の Task が終わるまで始められないので、まだ判断は要らない
    const s = campaignInProgress('turn-unassigned', 1);
    expect(unassignedProjects(s)).toEqual([]);
    const r = advanceUntilDecision(s);
    expect(unassignedProjects(r.state)).toEqual([SESSION_PROJECT]);
    expect(decisionNeeded(r.state, [])).toBe(true);
  });

  it('進めている案件がなければ（受注を考える）判断が要る', () => {
    expect(decisionNeeded(createInitialState('turn-idle', { board: true, tutorial: false }), [])).toBe(true);
  });

  it('その日に納品・決算などが起きたら判断が要る（ふつうの出来事では要らない）', () => {
    const s = campaignInProgress();
    expect(decisionNeeded(s, [{ type: 'ProjectCompleted' } as GameEvent])).toBe(true);
    expect(decisionNeeded(s, [{ type: 'FiscalClosed', no: 1 }])).toBe(true);
    expect(decisionNeeded(s, [{ type: 'InquiriesPosted' } as GameEvent])).toBe(false);
  });
});

describe('判断が必要になるまで進める（core/turn.ts の advanceUntilDecision）', () => {
  it('判断が要らなければ次の日へ続け、納品した日の終わりで止まる', () => {
    const s = campaignInProgress();
    const first = advanceDay(s);
    expect(decisionNeeded(first.state, first.events)).toBe(false);
    const r = advanceUntilDecision(s);
    expect(r.state.clock).toBeGreaterThan(DAY);
    expect(r.state.clock % DAY).toBe(0);
    expect(count(r.events, 'ProjectCompleted')).toBe(1);
    // 1日ずつ進めたのと同じ結果になる
    let manual = s;
    while (manual.clock < r.state.clock) manual = advanceDay(manual).state;
    expect(r.state).toEqual(manual);
  });

  it('担当が決まっていない Task で案件が止まったら、その日の終わりで止まる（納期だけを減らさない）', () => {
    const s = campaignInProgress('turn-stall', 1);
    const r = advanceUntilDecision(s);
    expect(r.state.clock % DAY).toBe(0);
    expect(unassignedProjects(r.state)).toEqual([SESSION_PROJECT]);
    // 判断が要る状態から始めても、少なくとも1日は進める
    expect(advanceUntilDecision(r.state).state.clock).toBe(r.state.clock + DAY);
  });

  it('期末を迎えたら決算を締め、そこで止まる', () => {
    const start = campaignInProgress('turn-fiscal');
    const fiscalDay = balance.fiscal.days;
    const before = { ...start, clock: fiscalDay * DAY - 60, fiscal: { ...start.fiscal, startDay: 0 } };
    const r = advanceUntilDecision(before);
    expect(r.state.clock).toBe(fiscalDay * DAY);
    expect(r.events).toContainEqual({ type: 'FiscalClosed', no: 1 });
    // 止めたのは決算（その日の出来事を除けば、判断は要らない）
    expect(decisionNeeded(r.state, [])).toBe(false);
  });

  it('判断が要らないまま続いても、balance.time.maxSkipDays 日で止まる', () => {
    // 何も起きない世界（システムなし）では、担当の決まった案件が進まないまま判断も要らない
    const systems: readonly System[] = [];
    const s = campaignInProgress('turn-max');
    const r = advanceUntilDecision(s, systems);
    expect(r.state.clock).toBe(s.clock + balance.time.maxSkipDays * DAY);
  });

  it('引き合いは Command の適用後に届く（チュートリアルを飛ばしたら、時間を進めずに見積を出せる）', () => {
    const s = createInitialState('turn-inquiry', { board: true, talent: true });
    const started = reduce(s, { type: 'StartProject', projectId: SESSION_PROJECT }).state;
    const skipped = reduce(started, { type: 'SkipTutorial' }).state;
    expect(skipped.clock).toBe(0);
    expect(skipped.board?.inquiries.length).toBeGreaterThan(0);
  });
});
