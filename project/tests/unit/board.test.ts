import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { founders } from '../../src/content/staff';
import { activeProjects, canStartProject, inquiriesOn, openInquiries } from '../../src/core/board';
import { type Command, reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { deserialize, serialize } from '../../src/core/serialize';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { boardView, projectTabs } from '../../src/view/board';

/*
 * 案件ボードの進行（以前のキャンペーンの進行のテストを、引き合いとコンペで表し直したもの）。
 * チュートリアル → 案件ボード → 受注した案件の同時進行 → 会社の資産の持ち越し → セーブからの再開。
 */

const DAY = balance.project.minutesPerBusinessDay;

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

  it('チュートリアルを納品すると案件ボードに引き合いが届き、採用市場から社員を迎えられるようになる', () => {
    const before = reduce(createInitialState('c', { board: true }), {
      type: 'StartProject',
      projectId: 'tutorialLp',
    }).state;
    const candidate = before.market.candidates[0] ?? '';
    // チュートリアルの間は採用できない
    expect(reduce(before, { type: 'Hire', staffId: candidate }).state).toBe(before);
    const { state: s, events } = afterTutorial();
    const posted = inquiriesOn(s.seed, 0);
    expect(openInquiries(s)).toEqual(posted);
    expect(posted).toHaveLength(balance.board.perDay);
    expect(events).toContainEqual({ type: 'InquiriesPosted', projectIds: posted });
    expect(events).toContainEqual({ type: 'FeatureUnlocked', feature: 'hire' });
    // 受注していない案件は直接始められない（コンペで受注する）
    expect(canStartProject(s, posted[0] ?? '')).toBe(false);
    const hired = reduce(s, { type: 'Hire', staffId: candidate });
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
    const runA = s.projects[a];
    expect(runA?.revenue).toBe(boardView(s).active.find((p) => p.projectId === a)?.revenue);
    if (s.projects[b]) {
      expect(s.projects[b]?.revenue).toBe(bidB?.amount);
      expect(s.projects[b]?.deadlineDays).toBe(bidB?.deadlineDays);
      expect(projectTabs(s, b).tabs.map((t) => [t.projectId, t.floor, t.selected])).toEqual([
        [a, 1, false],
        [b, 2, true],
      ]);
    }
  });

  it('終わりはなく、営業日ごとに新しい引き合いが届き続ける。見積を出さなかった引き合いは締切で消える', () => {
    let s = { ...afterTutorial().state, paused: false };
    const events: GameEvent[] = [];
    for (let day = 1; day <= 5; day++) {
      const r = step(s, DAY);
      s = r.state;
      events.push(...r.events);
    }
    expect(events.filter((e) => e.type === 'InquiriesPosted')).toHaveLength(5);
    // 締切は届いた営業日から balance.board.closeDays 営業日目の終わり
    expect(s.board?.inquiries.map((i) => i.postedDay)).toEqual([4, 4, 5, 5]);
    expect(events.some((e) => e.type === 'BidWon' || e.type === 'BidLost')).toBe(false);
  });

  it('作った Harness（会社の資産）は次の案件へ持ち越し、導入コストを二度払わない', () => {
    let s = afterTutorial().state;
    const [a = ''] = openInquiries(s);
    s = win(s, a);
    s = reduce(s, { type: 'EquipPart', workerId: 'agent', partId: 'skillFrontend' }).state;
    expect(s.ownedParts).toEqual(['skillFrontend']);
    s = reduce(deliver(s, a), pause).state;
    const [next = ''] = openInquiries(step({ ...s, paused: false }, DAY).state);
    s = win(step({ ...s, paused: false }, DAY).state, next);
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
    s = reduce(step({ ...s, paused: false }, DAY).state, {
      type: 'SubmitBid',
      projectId: openInquiries(step({ ...s, paused: false }, DAY).state)[0] ?? b,
      price: 'plus10',
      deadline: 'short',
    }).state;
    const loaded = deserialize(serialize(s));
    expect(loaded).toEqual(s);
    expect(activeProjects(loaded)).toContain(a);
    expect(step(loaded, DAY * 2)).toEqual(step(s, DAY * 2));
  });
});
