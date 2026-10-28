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
} from '../../src/core/board';
import { calendarDay, minuteOfDay } from '../../src/core/clock';
import { type Command, reduce } from '../../src/core/commands';
import { tierOf } from '../../src/core/company';
import type { GameEvent } from '../../src/core/events';
import { acceptOrder, maxProjects, orderBlock, orderTerms } from '../../src/core/orders';
import { settleProgress } from '../../src/core/progress';
import { deserialize, serialize } from '../../src/core/serialize';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { applyUnlocks } from '../../src/core/unlocks';
import { boardView, projectTabs } from '../../src/view/board';
import { hhmm } from '../../src/view/hud';

/*
 * 案件ボードの進行（以前のキャンペーンの進行のテストを、引き合いと受注で表し直したもの）。
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

/** Command の適用後の判定（解放・チュートリアルの進行・引き合い）だけを走らせる。状態を変えない Command では判定が走らないので直接呼ぶ */
function settle(state: GameState): { state: GameState; events: readonly GameEvent[] } {
  const events: GameEvent[] = [];
  return { state: settleProgress(state, (e) => events.push(e)), events };
}

/** 引き合いを受注する（受注の条件は tests/unit/orders.test.ts で確かめる） */
function win(state: GameState, projectId: string): GameState {
  const s = acceptOrder(state, projectId, () => {});
  if (!s.projects[projectId]) throw new Error(`受注できない ${projectId}`);
  return s;
}

/** 次の営業日の始業まで進める（その日の引き合いが届き、まだ締め切られていない） */
function nextMorning(state: GameState): GameState {
  return step(state, DAY - (state.clock % DAY)).state;
}

/** チュートリアルを納品して、最初の引き合いが届いた会社 */
function afterTutorial(): { state: GameState; events: readonly GameEvent[] } {
  const s = reduce(createInitialState('c', { board: true }), { type: 'StartProject', projectId: 'tutorialLp' }).state;
  return settle(deliver(s, 'tutorialLp'));
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
    // 受注していない案件は直接始められない（案件ボードで受注する）
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

  it('受注した2件を同時に進められ、タブ（フロア）に始めた順で並ぶ。売上と納期は受注の条件（orderTerms）', () => {
    let s = afterTutorial().state;
    const [a = '', b = ''] = openInquiries(s);
    const termsA = orderTerms(s, a);
    const termsB = orderTerms(s, b);
    s = reduce(s, { type: 'AcceptOrder', projectId: b }).state;
    // 受注した引き合いはボードから外れ、その場で案件が始まる
    expect(openInquiries(s)).not.toContain(b);
    s = win(s, a);
    expect(activeProjects(s)).toEqual([b, a]);
    // 進行中の案件は案件ボードではなくタブに並ぶ
    expect(s.projects[a]).toMatchObject({ revenue: termsA.revenue, deadlineDays: termsA.deadlineDays });
    expect(s.projects[b]).toMatchObject({ revenue: termsB.revenue, deadlineDays: termsB.deadlineDays });
    expect(projectTabs(s, a).tabs.map((t) => [t.projectId, t.floor, t.selected])).toEqual([
      [b, 1, false],
      [a, 2, true],
    ]);
  });

  it('終わりはなく、営業日ごとに新しい引き合いが届き続ける。受注しなかった引き合いは締切で黙って消える', () => {
    let s = afterTutorial().state;
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
    // 選ばなければ受注しない
    expect(events.some((e) => e.type === 'OrderAccepted')).toBe(false);
    expect(activeProjects(s)).toEqual([]);
    // それより前に届いた分（最初の日の分を含む6日分）は、知らせずに消える
    const posted = events.flatMap((e) => (e.type === 'InquiriesPosted' ? e.projectIds : []));
    const gone = posted.filter((id) => !remaining.some((i) => i.projectId === id));
    expect(gone.length).toBeGreaterThan(0);
    for (const e of events) {
      if (e.type !== 'InquiriesPosted' && 'projectId' in e) expect(gone).not.toContain(e.projectId);
    }
  });

  it('作った Harness（会社の資産）は次の案件へ持ち越し、導入コストを二度払わない', () => {
    let s = afterTutorial().state;
    const [a = ''] = openInquiries(s);
    s = win(s, a);
    // Harness Builder を解放した会社（解放の順番は tests/unit/unlocks.test.ts で確かめる）
    s = { ...s, unlocked: [...s.unlocked, 'harness'] };
    s = reduce(s, { type: 'EquipPart', workerId: 'agent', partId: 'skillFrontend' }).state;
    expect(s.ownedParts).toEqual(['skillFrontend']);
    s = settle(deliver(s, a)).state;
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

  it('セーブして読み込むと、案件ボードの途中（引き合い・受注した案件・評判）から同じ状態で再開できる', () => {
    let s = afterTutorial().state;
    const [a = '', b = ''] = openInquiries(s);
    s = win(s, a);
    const morning = nextMorning(s);
    expect(openInquiries(morning).length).toBeGreaterThan(0);
    s = reduce(morning, { type: 'AcceptOrder', projectId: openInquiries(morning)[0] ?? b }).state;
    expect(activeProjects(s)).toHaveLength(2);
    const loaded = deserialize(serialize(s));
    expect(loaded).toEqual(s);
    expect(activeProjects(loaded)).toContain(a);
    expect(step(loaded, DAY * 2)).toEqual(step(s, DAY * 2));
  });
});

describe('受付の締切と受注（core/board.ts・core/orders.ts・core/step.ts）', () => {
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

  it('受付の期間は規模が大きいほど長く、どれも翌営業日以降まで残る（毎朝ボードを見なくても受注できる）', () => {
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

  it('受注すると、時間を進めずにその場で案件が始まる。同時に進められる数に達したら、それ以上は受注できない', () => {
    let s = afterTutorial().state;
    const clock = s.clock;
    const ids = openInquiries(s);
    const max = maxProjects(s);
    expect(ids.length).toBeGreaterThan(max);
    const events: GameEvent[] = [];
    for (const projectId of ids) {
      const r = reduce(s, { type: 'AcceptOrder', projectId });
      s = r.state;
      events.push(...r.events);
    }
    expect(s.clock).toBe(clock);
    const accepted = events.flatMap((e) => (e.type === 'OrderAccepted' ? [e.projectId] : []));
    expect(accepted).toEqual(ids.slice(0, max));
    expect(activeProjects(s)).toEqual(accepted);
    // 残りは上限に達していて受注できず、ボードに残る
    expect(openInquiries(s)).toEqual(ids.slice(max));
    for (const id of ids.slice(max)) expect(orderBlock(s, id)).toBe('full');
    // 受注した引き合いには、もう一度は受注できない
    const again = reduce(s, { type: 'AcceptOrder', projectId: ids[0] ?? '' });
    expect(again.state).toBe(s);
  });

  it('受注に乱数は使わない（同じ state から受注すれば同じ結果になり、state の乱数は進まない）', () => {
    const s = afterTutorial().state;
    const [a = ''] = openInquiries(s);
    const order: Command = { type: 'AcceptOrder', projectId: a };
    const r1 = reduce(s, order);
    expect(r1).toEqual(reduce(s, order));
    expect(r1.state.rng).toBe(s.rng);
  });

  it('受注せずに締切が過ぎた引き合いは、知らせずにボードから消える', () => {
    const s = afterTutorial().state;
    const ids = openInquiries(s);
    const last = Math.max(...(s.board?.inquiries ?? []).map((i) => i.closesAt));
    const { state, events } = step(s, last - s.clock);
    expect(state.board?.inquiries.map((i) => i.projectId)).toEqual(expect.not.arrayContaining(ids));
    for (const e of events) {
      if (e.type !== 'InquiriesPosted' && 'projectId' in e) expect(ids).not.toContain(e.projectId);
    }
    expect(Object.keys(state.projects).filter((id) => ids.includes(id))).toEqual([]);
  });
});
