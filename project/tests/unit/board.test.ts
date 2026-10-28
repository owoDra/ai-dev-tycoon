import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { founders } from '../../src/content/staff';
import {
  activeProjects,
  canStartProject,
  closeDaysOf,
  closingTime,
  inquiriesOn,
  openInquiries,
  pendingBids,
} from '../../src/core/board';
import { calendarDay, minuteOfDay } from '../../src/core/clock';
import { type Command, reduce } from '../../src/core/commands';
import { tierOf } from '../../src/core/company';
import type { GameEvent } from '../../src/core/events';
import { deserialize, serialize } from '../../src/core/serialize';
import { createInitialState, type GameState } from '../../src/core/state';
import { playSpeed, skipUntil, step, waitingOnBids } from '../../src/core/step';
import { applyUnlocks } from '../../src/core/unlocks';
import { boardView, projectTabs } from '../../src/view/board';
import { hhmm } from '../../src/view/hud';

/*
 * 案件ボードの進行（以前のキャンペーンの進行のテストを、引き合いとコンペで表し直したもの）。
 * チュートリアル → 案件ボード → 受注した案件の同時進行 → 会社の資産の持ち越し → セーブからの再開。
 */

const DAY = balance.time.minutesPerDay;

/** 案件のすべての Task を完了済みにする（納品は次の Command の適用後に判定される） */
function deliver(state: GameState, projectId: string): GameState {
  const run = state.projects[projectId];
  if (!run) throw new Error(`始まっていない案件 ${projectId}`);
  const tasks = Object.fromEntries(Object.entries(run.tasks).map(([id, t]) => [id, { ...t, status: 'done' as const }]));
  return { ...state, projects: { ...state.projects, [projectId]: { ...run, tasks, completedAt: state.clock } } };
}

const pause: Command = { type: 'TogglePause' };

/** 引き合いに見積を出し、勝ったことにして締切まで進める（勝敗の乱数は別のテストで確かめる） */
function win(state: GameState, projectId: string): GameState {
  const s = reduce(state, { type: 'SubmitBid', projectId, price: 'base', deadline: 'standard' }).state;
  const board = s.board;
  const inquiry = board?.inquiries.find((i) => i.projectId === projectId);
  if (!board || !inquiry?.bid) throw new Error(`見積を出せない ${projectId}`);
  const inquiries = board.inquiries.map((i) =>
    i.projectId === projectId && i.bid ? { ...i, bid: { ...i.bid, winChance: 1 } } : i,
  );
  const ready = { ...s, board: { ...board, inquiries }, paused: false };
  return step(ready, inquiry.closesAt - s.clock).state;
}

/** 次の営業日の始業まで進める（その日の引き合いが届き、まだ締め切られていない） */
function nextMorning(state: GameState): GameState {
  return step({ ...state, paused: false }, DAY - (state.clock % DAY)).state;
}

/** チュートリアルを納品して、最初の引き合いが届いた会社 */
function afterTutorial(): { state: GameState; events: readonly GameEvent[] } {
  const s = reduce(createInitialState('c', { board: true }), { type: 'StartProject', projectId: 'tutorialLp' }).state;
  return reduce(deliver(s, 'tutorialLp'), pause);
}

describe('案件ボードの進行（core/board.ts）', () => {
  it('最初はチュートリアルの案件だけを始められ、創業メンバーの2人で始まる。チュートリアルの間は引き合いが届かない', () => {
    const s = createInitialState('c', { board: true });
    expect(s.tutorial).not.toBeNull();
    expect(Object.keys(s.team)).toEqual(founders);
    expect(canStartProject(s, 'ecRenewal')).toBe(false);
    expect(reduce(s, { type: 'StartProject', projectId: 'ecRenewal' }).state).toBe(s);
    const started = reduce(s, { type: 'StartProject', projectId: 'tutorialLp' }).state;
    expect(started.projects.tutorialLp).toBeDefined();
    expect(step(started, DAY * 2).state.board?.inquiries).toEqual([]);
  });

  it('チュートリアルを納品すると案件ボードに引き合いが届く。採用市場は案件を重ねてから（4件目の納品で）開き、社員を迎えられる', () => {
    const before = reduce(createInitialState('c', { board: true }), {
      type: 'StartProject',
      projectId: 'tutorialLp',
    }).state;
    const candidate = before.market.candidates[0] ?? '';
    // チュートリアルの間は採用できない
    expect(reduce(before, { type: 'Hire', staffId: candidate }).state).toBe(before);
    const { state: s, events } = afterTutorial();
    const posted = inquiriesOn(s.seed, 0, tierOf(s));
    expect(openInquiries(s)).toEqual(posted);
    expect(posted).toHaveLength(tierOf(s).inquiries);
    expect(events).toContainEqual({ type: 'InquiriesPosted', projectIds: posted });
    // チュートリアルの直後はまだ採用できない（人手が足りなくなるほど案件を重ねていない）
    expect(events).not.toContainEqual({ type: 'FeatureUnlocked', feature: 'hire' });
    expect(reduce(s, { type: 'Hire', staffId: candidate }).state).toBe(s);
    // 受注していない案件は直接始められない（コンペで受注する）
    expect(canStartProject(s, posted[0] ?? '')).toBe(false);
    // 4件目を納品した後、営業日ごとに1つずつ解放され、何日かのうちに採用市場が開く
    let later: GameState = { ...s, ledger: { ...s.ledger, delivered: 3 } };
    for (let day = 1; day <= 5 && !later.unlocked.includes('hire'); day++) {
      const before = later.unlocked.length;
      later = applyUnlocks({ ...later, clock: s.clock + day * DAY }, () => {});
      expect(later.unlocked.length - before).toBe(1);
    }
    expect(later.unlocked).toContain('hire');
    const hired = reduce(later, { type: 'Hire', staffId: candidate });
    expect(hired.events).toContainEqual({ type: 'StaffJoined', staffId: candidate });
    expect(hired.state.team[candidate]).toEqual({ seat: 'standard', used: 0 });
  });

  it('コンペで受注した2件を同時に進められ、タブ（フロア）に始めた順で並ぶ。売上は見積額、納期は提案した納期', () => {
    let s = afterTutorial().state;
    const [a = '', b = ''] = openInquiries(s);
    s = reduce(s, { type: 'SubmitBid', projectId: b, price: 'minus10', deadline: 'long' }).state;
    const bidB = s.board?.inquiries.find((i) => i.projectId === b)?.bid;
    s = win(s, a);
    expect(activeProjects(s)).toEqual([a, b].filter((id) => s.projects[id]));
    // b の見積も同じ締切で結果が出ている（勝敗は乱数）。どちらにしても a は進行中
    expect(s.board?.inquiries).toEqual(expect.not.arrayContaining([expect.objectContaining({ projectId: a })]));
    // 進行中の案件は案件ボードではなくタブに並び、売上は見積額
    const quoteA = reduce(afterTutorial().state, {
      type: 'SubmitBid',
      projectId: a,
      price: 'base',
      deadline: 'standard',
    }).state.board?.inquiries.find((i) => i.projectId === a)?.bid;
    expect(s.projects[a]?.revenue).toBe(quoteA?.amount);
    expect(projectTabs(s, null).tabs.map((t) => t.projectId)).toContain(a);
    if (s.projects[b]) {
      expect(s.projects[b]?.revenue).toBe(bidB?.amount);
      expect(s.projects[b]?.deadlineDays).toBe(bidB?.deadlineDays);
      expect(projectTabs(s, b).tabs.map((t) => [t.projectId, t.floor, t.selected])).toEqual([
        [a, 1, false],
        [b, 2, true],
      ]);
    }
  });

  it('終わりはなく、営業日ごとに新しい引き合いが届き続ける。見積を出さなかった引き合いは締切で見送り、通知する', () => {
    let s = { ...afterTutorial().state, paused: false };
    const events: GameEvent[] = [];
    for (let day = 1; day <= 5; day++) {
      const r = step(s, DAY);
      s = r.state;
      events.push(...r.events);
    }
    expect(events.filter((e) => e.type === 'InquiriesPosted')).toHaveLength(5);
    // 残っているのは、応募の期間（規模ごとの営業日数）の中にあるものだけ
    const longest = Math.max(...Object.values(balance.board.closeDays));
    const remaining = s.board?.inquiries ?? [];
    expect(remaining.length).toBeGreaterThan(0);
    for (const i of remaining) {
      expect(i.closesAt).toBeGreaterThan(s.clock);
      expect(i.postedDay).toBeGreaterThan(5 - longest);
    }
    expect(events.some((e) => e.type === 'BidWon' || e.type === 'BidLost')).toBe(false);
    // それより前に届いた分（最初の日の分を含む6日分）は、締切で「見送った」と知らせる
    expect(events.filter((e) => e.type === 'InquiryPassed')).toHaveLength(tierOf(s).inquiries * 6 - remaining.length);
  });

  it('作った Harness（会社の資産）は次の案件へ持ち越し、導入コストを二度払わない', () => {
    let s = afterTutorial().state;
    const [a = ''] = openInquiries(s);
    s = win(s, a);
    // Harness Builder を解放した会社（解放の順番は tests/unit/unlocks.test.ts で確かめる）
    s = { ...s, unlocked: [...s.unlocked, 'harness'] };
    s = reduce(s, { type: 'EquipPart', workerId: 'agent', partId: 'skillFrontend' }).state;
    expect(s.ownedParts).toEqual(['skillFrontend']);
    s = reduce(deliver(s, a), pause).state;
    const [next = ''] = openInquiries(nextMorning(s));
    s = win(nextMorning(s), next);
    expect(s.projects[next]).toBeDefined();
    expect(s.harnesses.agent?.parts).toEqual(['skillFrontend']);
    s = reduce(s, { type: 'RemovePart', workerId: 'agent', partId: 'skillFrontend' }).state;
    s = reduce(s, { type: 'EquipPart', workerId: 'agent', partId: 'skillFrontend' }).state;
    expect(s.harnessLedger).toHaveLength(1);
    // 解放の進み具合も持ち越す
    expect(s.unlocked).toContain('harness');
  });

  it('案件ボードのない単発のプレイでは、どの案件（生成した案件も）でも始められ、引き合いは届かない', () => {
    const s = createInitialState('s');
    expect(s.board).toBeNull();
    expect(canStartProject(s, 'saasFeature')).toBe(true);
    expect(canStartProject(s, 'p~1~M')).toBe(true);
    expect(openInquiries(step(s, DAY * 2).state)).toEqual([]);
  });

  it('セーブして読み込むと、案件ボードの途中（引き合い・見積・受注した案件・評判）から同じ状態で再開できる', () => {
    let s = afterTutorial().state;
    const [a = '', b = ''] = openInquiries(s);
    s = win(s, a);
    const morning = nextMorning(s);
    expect(openInquiries(morning).length).toBeGreaterThan(0);
    s = reduce(morning, {
      type: 'SubmitBid',
      projectId: openInquiries(morning)[0] ?? b,
      price: 'plus10',
      deadline: 'short',
    }).state;
    const loaded = deserialize(serialize(s));
    expect(loaded).toEqual(s);
    expect(activeProjects(loaded)).toContain(a);
    expect(step(loaded, DAY * 2)).toEqual(step(s, DAY * 2));
  });
});

describe('見積の締切（core/board.ts・core/step.ts）', () => {
  it('締切は、届いた営業日から数えて規模ごとの営業日目の夕方（balance.board.closeAt）で、HUD の時計と同じ「N日目 HH:MM」で読める', () => {
    const s = afterTutorial().state;
    expect(s.board?.inquiries.length).toBeGreaterThan(0);
    for (const inquiry of s.board?.inquiries ?? []) {
      const days = closeDaysOf(inquiry.projectId);
      expect(minuteOfDay(inquiry.closesAt)).toBe(balance.board.closeAt);
      expect(calendarDay(inquiry.closesAt)).toBe(calendarDay(s.clock) + days - 1);
      const view = boardView(s).inquiries.find((i) => i.projectId === inquiry.projectId);
      expect(view?.closes).toEqual({ day: days, time: hhmm(balance.board.closeAt) });
    }
    expect(hhmm(balance.board.closeAt)).toBe('17:00');
  });

  it('応募の期間は規模が大きいほど長く、どれも翌営業日以降まで残る（毎朝ボードを見なくても見積を出せる）', () => {
    const { S, M, L, XL } = balance.board.closeDays;
    expect(S).toBeGreaterThanOrEqual(2);
    expect(M).toBeGreaterThanOrEqual(S);
    expect(L).toBeGreaterThanOrEqual(M);
    expect(XL).toBeGreaterThanOrEqual(L);
    const closeOffset = balance.board.closeAt - balance.time.origin;
    expect(closingTime(0, 3)).toBe(closeOffset + 2 * DAY);
    // 夕方に届いたら、1営業日遅らせたところから数える
    expect(closingTime(DAY - 1, 2)).toBe(closeOffset + 2 * DAY);
  });

  it('締切までの残りが短い時刻に届いたら（夕方にチュートリアルを終えたなど）、次の営業日の夕方を締切にする', () => {
    const closeOffset = balance.board.closeAt - balance.time.origin;
    expect(closingTime(0)).toBe(closeOffset);
    expect(closingTime(closeOffset - balance.board.minOpenMinutes)).toBe(closeOffset);
    expect(closingTime(closeOffset - balance.board.minOpenMinutes + 1)).toBe(closeOffset + DAY);
    expect(closingTime(DAY - 1)).toBe(closeOffset + DAY);
  });

  it('進行中の案件がなく、見積を出して結果を待つだけのときは、締切まで早送りする', () => {
    let s = afterTutorial().state;
    // 見積を考えている途中（出していない引き合いが残っている）は早送りしない
    expect(waitingOnBids(s)).toBe(false);
    expect(playSpeed(s)).toBe(s.speed);
    for (const projectId of openInquiries(s)) {
      s = reduce(s, { type: 'SubmitBid', projectId, price: 'base', deadline: 'standard' }).state;
    }
    expect(pendingBids(s)).toHaveLength(tierOf(s).inquiries);
    expect(waitingOnBids(s)).toBe(true);
    expect(playSpeed(s)).toBe(balance.time.idleSkip);
    // 早送りは最初の締切（結果が出る時刻）まで
    const closesAt = s.board?.inquiries[0]?.closesAt ?? 0;
    expect(skipUntil(s)).toBe(closesAt);
    // 結果が出たら早送りをやめる（受注すれば担当を決めるまで、負ければ次の引き合いまで）
    const after = step({ ...s, paused: false }, closesAt - s.clock).state;
    expect(pendingBids(after)).toEqual([]);
    expect(waitingOnBids(after)).toBe(false);
  });

  it('進行中の案件があれば、結果待ちの見積があっても早送りしない（勤務時間の間）', () => {
    const first = afterTutorial().state;
    const [a = ''] = openInquiries(first);
    const won = win(first, a);
    // 翌朝の引き合いにすべて見積を出す
    let s = nextMorning(won);
    expect(openInquiries(s).length).toBeGreaterThan(0);
    for (const projectId of openInquiries(s)) {
      s = reduce(s, { type: 'SubmitBid', projectId, price: 'base', deadline: 'standard' }).state;
    }
    expect(pendingBids(s).length).toBeGreaterThan(0);
    expect(activeProjects(s)).toContain(a);
    expect(waitingOnBids(s)).toBe(false);
  });

  it('見積を出さずに締切が過ぎた引き合いは、InquiryPassed で知らせて消え、結果の履歴に「見送り」として残る', () => {
    const s = { ...afterTutorial().state, paused: false };
    const ids = openInquiries(s);
    const last = Math.max(...(s.board?.inquiries ?? []).map((i) => i.closesAt));
    const { state, events } = step(s, last - s.clock);
    expect(
      events
        .filter((e) => e.type === 'InquiryPassed')
        .map((e) => e.projectId)
        .sort(),
    ).toEqual([...ids].sort());
    expect(state.board?.inquiries.map((i) => i.projectId)).toEqual(expect.not.arrayContaining(ids));
    const passed = (state.board?.results ?? []).filter((r) => ids.includes(r.projectId));
    expect(passed.map((r) => r.outcome)).toEqual(ids.map(() => 'passed'));
  });
});
