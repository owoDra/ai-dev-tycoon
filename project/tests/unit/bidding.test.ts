import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getProject } from '../../src/content/index';
import {
  bidAmount,
  closeInquiries,
  type DeadlineStep,
  deliveryRating,
  estimatePersonDays,
  type PriceStep,
  priceSteps,
  quoteBid,
  winChance,
} from '../../src/core/bidding';
import { openInquiries } from '../../src/core/board';
import { type Command, reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { generatedProjectId } from '../../src/core/projectGen';
import { createRngCursor, hashSeed } from '../../src/core/rng';
import { scoreProject } from '../../src/core/scoring';
import { createInitialState, createProjectRun, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { bidPreview } from '../../src/view/board';

/*
 * コンペ（core/bidding.ts）。勝率は見積額の安さと提案力（評判・同業種の実績・AI 体制）と納期の提案で決まり、
 * 表示した勝率のまま締切に勝敗が決まる。受注した案件の売上は見積額で、納品の納期と品質で評判が変わる。
 */

const DAY = balance.time.minutesPerDay;
const SEEDS = Array.from({ length: 40 }, (_, i) => `bid-${i}`);

/** チュートリアルなしで始め、最初の引き合いが届いた会社 */
function company(seed = 'bid'): GameState {
  const s = createInitialState(seed, { board: true, tutorial: false });
  return reduce({ ...s, paused: true }, { type: 'TogglePause' }).state;
}

const projects = SEEDS.map((s) => generatedProjectId(s, 'M'));

describe('コンペの勝率（core/bidding.ts）', () => {
  it('安いほど勝率が上がり、予算の上限を超える見積は選ばれない', () => {
    const s = company();
    for (const id of projects) {
      const def = getProject(id);
      const chances = priceSteps.map((p) => quoteBid(s, id, p, 'standard').winChance);
      for (let i = 1; i < chances.length; i++) {
        expect(chances[i], id).toBeLessThanOrEqual(chances[i - 1] ?? 1);
      }
      expect(chances[0], id).toBeGreaterThan(chances.at(-1) ?? 1);
      for (const p of priceSteps) {
        if (bidAmount(def, p) > (def.brief?.budget ?? 0)) expect(quoteBid(s, id, p, 'standard').winChance).toBe(0);
      }
    }
  });

  it('評判が高いほど・同業種の実績があるほど・AI 体制が整っているほど勝率が上がる', () => {
    const s = company();
    for (const id of projects) {
      const def = getProject(id);
      const amount = bidAmount(def, 'minus10');
      const base = winChance(s, def, amount, def.deadlineDays);
      // 競合がすべて予算の上限を超えていれば必ず勝つ（勝率 1）。比べられる案件だけを見る
      if (base <= 0 || base >= 1) continue;
      expect(winChance({ ...s, reputation: 80 }, def, amount, def.deadlineDays)).toBeGreaterThan(base);
      expect(winChance({ ...s, reputation: 20 }, def, amount, def.deadlineDays)).toBeLessThan(base);
      expect(
        winChance({ ...s, ownedParts: ['skillFrontend', 'hookUnitTest'] }, def, amount, def.deadlineDays),
      ).toBeGreaterThan(base);
      // 同業種の案件を納品した実績
      const other = projects.find((x) => x !== id && getProject(x).brief?.industry === def.brief?.industry);
      if (!other) continue;
      const delivered = { ...createProjectRun(other, 0), completedAt: 1 };
      expect(winChance({ ...s, projects: { [other]: delivered } }, def, amount, def.deadlineDays)).toBeGreaterThan(
        base,
      );
    }
  });

  it('納期を短く提案するほど勝率が上がる（納期重視の発注者ほど大きく）', () => {
    const s = company();
    const gain = (id: string) => {
      const q = (d: DeadlineStep) => quoteBid(s, id, 'minus20', d).winChance;
      return q('short') - q('long');
    };
    for (const id of projects) expect(gain(id), id).toBeGreaterThanOrEqual(0);
    const by = (focus: string) => projects.filter((id) => getProject(id).brief?.focus === focus).map(gain);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(by('deadline'))).toBeGreaterThan(avg(by('price')));
  });

  it('見積の基準額は 見積人日 × 平均売値 で、価格の選択肢はその ±20% まで', () => {
    for (const id of projects) {
      const def = getProject(id);
      const base = estimatePersonDays(def) * balance.talent.rate.mean;
      expect(bidAmount(def, 'base')).toBe(base);
      expect(bidAmount(def, 'minus20')).toBe(
        Math.round((base * 0.8) / balance.bid.amountStep) * balance.bid.amountStep,
      );
    }
  });
});

describe('勝率の表示と実際の判定', () => {
  it('案件ボードに表示した勝率（After）が、出した見積の勝率になる', () => {
    let s = company();
    for (const id of openInquiries(s)) {
      for (const price of ['minus20', 'base', 'plus10'] as PriceStep[]) {
        const shown = bidPreview(s, id, price, 'short').after;
        s = reduce(s, { type: 'SubmitBid', projectId: id, price, deadline: 'short' }).state;
        expect(s.board?.inquiries.find((i) => i.projectId === id)?.bid).toEqual(shown);
        // 出し直した後は、出した見積が Before になる
        expect(bidPreview(s, id, 'base', 'standard').before).toEqual(shown);
      }
    }
  });

  it('締切の判定は出した見積の勝率どおり：勝つ割合が勝率に一致する（0 は必ず負け、1 は必ず勝つ）', () => {
    const s = company();
    const id = openInquiries(s)[0] ?? '';
    const withChance = (winChanceValue: number): GameState => {
      const board = s.board;
      if (!board) throw new Error('案件ボードがない');
      const bid = { ...quoteBid(s, id, 'base', 'standard'), winChance: winChanceValue };
      const inquiries = board.inquiries.map((i) => (i.projectId === id ? { ...i, bid } : i));
      return { ...s, clock: board.inquiries[0]?.closesAt ?? 0, board: { ...board, inquiries } };
    };
    const trials = 2000;
    for (const p of [0, 0.25, 0.6, 1]) {
      let wins = 0;
      for (let n = 0; n < trials; n++) {
        const rng = createRngCursor(hashSeed(`trial-${n}`));
        const next = closeInquiries(
          withChance(p),
          () => rng.next(),
          () => {},
        );
        if (next.projects[id]) wins++;
      }
      expect(Math.abs(wins / trials - p), `勝率 ${p}`).toBeLessThan(0.03);
      if (p === 0) expect(wins).toBe(0);
      if (p === 1) expect(wins).toBe(trials);
    }
  });

  it('受注した案件の売上は見積額、納期は提案した納期。結果は案件ボードの履歴に残る', () => {
    const s = company();
    const id = openInquiries(s)[0] ?? '';
    const bid = quoteBid(s, id, 'minus10', 'long');
    const board = s.board;
    if (!board) throw new Error('案件ボードがない');
    const inquiries = board.inquiries.map((i) => (i.projectId === id ? { ...i, bid: { ...bid, winChance: 1 } } : i));
    const events: GameEvent[] = [];
    const closesAt = board.inquiries.find((i) => i.projectId === id)?.closesAt ?? 0;
    const next = closeInquiries(
      { ...s, clock: closesAt, board: { ...board, inquiries } },
      () => 0.5,
      (e) => events.push(e),
    );
    expect(next.projects[id]).toMatchObject({ revenue: bid.amount, deadlineDays: bid.deadlineDays, completedAt: null });
    // 見積を出さなかったほかの引き合いは、同じ締切で見送ったことを知らせる
    const others = openInquiries(s).filter((o) => o !== id);
    expect(events).toEqual([
      { type: 'BidWon', projectId: id, amount: bid.amount },
      ...others.map((projectId) => ({ type: 'InquiryPassed', projectId })),
    ]);
    expect(next.board?.results[0]).toMatchObject({ projectId: id, won: true, amount: bid.amount });
    expect(next.board?.inquiries).toEqual([]);
  });

  it('チュートリアルの間・締切の後・未知の引き合いには見積を出せない', () => {
    const tutorial = createInitialState('t', { board: true });
    const cmd: Command = { type: 'SubmitBid', projectId: 'p~1~S', price: 'base', deadline: 'standard' };
    expect(reduce(tutorial, cmd).state).toBe(tutorial);
    const s = company();
    expect(reduce(s, cmd).state).toBe(s);
    const id = openInquiries(s)[0] ?? '';
    const closed = { ...s, clock: s.board?.inquiries[0]?.closesAt ?? 0 };
    expect(reduce(closed, { ...cmd, projectId: id }).state).toBe(closed);
  });
});

describe('評判', () => {
  it('納期内で品質が高ければ上がり、遅れるほど・品質が低いほど下がる', () => {
    const s = company();
    const id = generatedProjectId('rate', 'S');
    const run = createProjectRun(id, 0, { revenue: 1, deadlineDays: 2 });
    const done = (completedAt: number, quality: number): GameState => {
      const tasks = Object.fromEntries(
        Object.entries(run.tasks).map(([k, t]) => [k, { ...t, status: 'done' as const, quality }]),
      );
      return { ...s, projects: { [id]: { ...run, tasks, completedAt } } };
    };
    const onTime = deliveryRating(done(DAY, 1), id);
    expect(onTime).toBeGreaterThan(0);
    expect(deliveryRating(done(DAY * 3, 1), id)).toBeLessThan(0);
    expect(deliveryRating(done(DAY * 4, 1), id)).toBeLessThan(deliveryRating(done(DAY * 3, 1), id));
    expect(deliveryRating(done(DAY, 0.6), id)).toBeLessThan(onTime);
    expect(scoreProject(done(DAY, 1), id)?.revenue).toBe(1);
  });

  it('ヘッドレスで通す：見積 → 受注 → 担当を決めて納品 → 評判の変化', () => {
    let s = { ...company('record'), paused: false };
    const log: string[] = [];
    const events: GameEvent[] = [];
    let won: string | null = null;
    for (let day = 0; day < 10 && !won; day++) {
      for (const id of openInquiries(s)) {
        const r = reduce(s, { type: 'SubmitBid', projectId: id, price: 'minus10', deadline: 'standard' });
        s = r.state;
        const bid = s.board?.inquiries.find((i) => i.projectId === id)?.bid;
        log.push(
          `${day + 1}日目 見積：${getProject(id).name} ${bid?.amount}円 勝率 ${Math.round((bid?.winChance ?? 0) * 100)}%`,
        );
      }
      const r = step(s, DAY);
      s = r.state;
      events.push(...r.events);
      for (const e of r.events) {
        if (e.type === 'BidWon') won ??= e.projectId;
        if (e.type === 'BidWon' || e.type === 'BidLost')
          log.push(`${e.type === 'BidWon' ? '受注' : '失注'}：${getProject(e.projectId).name}`);
      }
    }
    if (!won) throw new Error('10日で受注できなかった');
    const projectId = won;
    const human = Object.keys(s.team)[0] ?? '';
    for (const t of getProject(projectId).tasks) {
      const mode = t.aiAptitude >= 0.6 ? 'aiThenHumanReview' : 'human';
      s = reduce(s, {
        type: 'AssignTask',
        projectId,
        taskId: t.id,
        mode,
        workerId: mode === 'human' ? human : 'agent',
      }).state;
    }
    const before = s.reputation;
    for (let day = 0; day < 15 && (s.projects[projectId]?.completedAt ?? null) === null; day++) {
      const r = step(s, DAY);
      s = r.state;
      events.push(...r.events);
    }
    const score = scoreProject(s, projectId);
    const changed = events.find((e) => e.type === 'ReputationChanged' && e.projectId === projectId);
    log.push(
      `納品：${getProject(projectId).name} 売上 ${score?.revenue}円（= 見積額 ${s.projects[projectId]?.revenue}円）` +
        `・品質 ${score?.quality.toFixed(2)}・${Math.ceil((score?.elapsedMinutes ?? 0) / DAY)}日（納期 ${s.projects[projectId]?.deadlineDays}日）`,
      `評判：${before} → ${s.reputation.toFixed(1)}`,
    );
    console.log(`[コンペの記録]\n  ${log.join('\n  ')}`);
    expect(score?.completed).toBe(true);
    expect(score?.revenue).toBe(s.projects[projectId]?.revenue);
    expect(changed).toMatchObject({ type: 'ReputationChanged', reputation: s.reputation });
    expect(s.reputation).not.toBe(before);
  });
});
