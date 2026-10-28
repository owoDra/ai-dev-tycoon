import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getProject } from '../../src/content/index';
import {
  bidAmount,
  bidDeadlineDays,
  closeInquiries,
  type DeadlineStep,
  deadlineOffered,
  deliveryRating,
  estimatePersonDays,
  type PriceStep,
  priceSteps,
  quoteBid,
  submitBid,
  winChance,
} from '../../src/core/bidding';
import { openInquiries, postInquiries } from '../../src/core/board';
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
  return postInquiries(s, () => {});
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
  it('案件ボードに表示した勝率（After）が、出した見積の勝率になる。Before は基準の見積', () => {
    const s = company();
    for (const id of openInquiries(s)) {
      for (const price of ['minus20', 'base', 'plus10'] as PriceStep[]) {
        const shown = bidPreview(s, id, price, 'short').after;
        expect(bidPreview(s, id, price, 'short').before).toEqual(quoteBid(s, id, 'base', 'standard'));
        const r = reduce(s, { type: 'SubmitBid', projectId: id, price, deadline: 'short' });
        expect(r.events[0]).toEqual({
          type: 'BidSubmitted',
          projectId: id,
          amount: shown.amount,
          winChance: shown.winChance,
        });
        expect(r.state.board?.results[0]).toMatchObject({ projectId: id, winChance: shown.winChance });
      }
    }
  });

  it('その場の判定は見積の勝率どおり：勝つ割合が勝率に一致する（予算超えの 0 は必ず負ける）', () => {
    const s = company();
    const id = openInquiries(s)[0] ?? '';
    const trials = 2000;
    for (const price of ['minus20', 'base', 'plus20'] as PriceStep[]) {
      const chance = quoteBid(s, id, price, 'standard').winChance;
      let wins = 0;
      for (let n = 0; n < trials; n++) {
        const rng = createRngCursor(hashSeed(`trial-${n}`));
        if (submitBid(s, id, price, 'standard', rng.next, () => {}).projects[id]) wins++;
      }
      expect(Math.abs(wins / trials - chance), `勝率 ${chance}`).toBeLessThan(0.03);
      if (chance === 0) expect(wins).toBe(0);
    }
  });

  it('受注した案件の売上は見積額、納期は提案した納期。結果は案件ボードの履歴に残り、引き合いから外れる', () => {
    const s = company();
    const id = openInquiries(s)[0] ?? '';
    const bid = quoteBid(s, id, 'minus10', 'long');
    const events: GameEvent[] = [];
    const next = submitBid(
      s,
      id,
      'minus10',
      'long',
      () => 0,
      (e) => events.push(e),
    );
    expect(next.clock).toBe(s.clock);
    expect(next.projects[id]).toMatchObject({ revenue: bid.amount, deadlineDays: bid.deadlineDays, completedAt: null });
    expect(events).toEqual([
      { type: 'BidSubmitted', projectId: id, amount: bid.amount, winChance: bid.winChance },
      { type: 'BidWon', projectId: id, amount: bid.amount },
    ]);
    expect(next.board?.results).toEqual([
      { projectId: id, outcome: 'won', amount: bid.amount, winChance: bid.winChance, at: s.clock },
    ]);
    expect(openInquiries(next)).toEqual(openInquiries(s).filter((o) => o !== id));
    // 負けたら案件は始まらず、失注として残る
    const lostEvents: GameEvent[] = [];
    const lost = submitBid(
      s,
      id,
      'minus10',
      'long',
      () => 0.999_999,
      (e) => lostEvents.push(e),
    );
    expect(lost.projects[id]).toBeUndefined();
    expect(lostEvents.at(-1)).toEqual({ type: 'BidLost', projectId: id });
    expect(lost.board?.results[0]).toMatchObject({ projectId: id, outcome: 'lost' });
  });

  it('見積を出さなかった引き合いは、締切で見送ったことを知らせ、結果の履歴に残る', () => {
    const s = company();
    const board = s.board;
    if (!board) throw new Error('案件ボードがない');
    const closesAt = Math.min(...board.inquiries.map((i) => i.closesAt));
    const due = board.inquiries.filter((i) => i.closesAt <= closesAt).map((i) => i.projectId);
    const events: GameEvent[] = [];
    const next = closeInquiries({ ...s, clock: closesAt }, (e) => events.push(e));
    expect(events).toEqual(due.map((projectId) => ({ type: 'InquiryPassed', projectId })));
    expect(next.board?.results).toHaveLength(due.length);
    expect(next.board?.results).toEqual(
      expect.arrayContaining(
        due.map((projectId) => expect.objectContaining({ projectId, outcome: 'passed', amount: 0 })),
      ),
    );
    expect(openInquiries(next)).toEqual(openInquiries(s).filter((o) => !due.includes(o)));
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
    let s = company('record');
    const log: string[] = [];
    const events: GameEvent[] = [];
    let won: string | null = null;
    for (let day = 0; day < 10 && !won; day++) {
      for (const id of openInquiries(s)) {
        const r = reduce(s, { type: 'SubmitBid', projectId: id, price: 'minus10', deadline: 'standard' });
        s = r.state;
        for (const e of r.events) {
          if (e.type === 'BidSubmitted')
            log.push(
              `${day + 1}日目 見積：${getProject(id).name} ${e.amount}円 勝率 ${Math.round(e.winChance * 100)}%`,
            );
          if (e.type === 'BidWon') won ??= e.projectId;
          if (e.type === 'BidWon' || e.type === 'BidLost')
            log.push(`${e.type === 'BidWon' ? '受注' : '失注'}：${getProject(e.projectId).name}`);
        }
      }
      if (won) break;
      const r = step(s, DAY);
      s = r.state;
      events.push(...r.events);
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

describe('納期の選択肢（core/bidding.ts の bidDeadlineDays）', () => {
  it('短縮は標準より1日以上短く、余裕は1日以上長い。標準が1日の案件には短縮を出さず、出しても受け付けない', () => {
    for (const standard of [1, 2, 3, 5, 8, 13]) {
      const long = bidDeadlineDays(standard, 'long');
      expect(bidDeadlineDays(standard, 'standard')).toBe(standard);
      expect(long).toBeGreaterThanOrEqual(standard + 1);
      expect(deadlineOffered(standard, 'standard')).toBe(true);
      expect(deadlineOffered(standard, 'long')).toBe(true);
      if (standard === 1) {
        expect(deadlineOffered(standard, 'short')).toBe(false);
      } else {
        expect(deadlineOffered(standard, 'short')).toBe(true);
        const short = bidDeadlineDays(standard, 'short');
        expect(short).toBeLessThanOrEqual(standard - 1);
        expect(short).toBeGreaterThanOrEqual(1);
      }
    }
    // 標準の納期が1日の引き合いに短縮で見積を出しても、state は変わらない
    let found: { s: GameState; id: string } | null = null;
    for (let n = 0; n < 30 && !found; n++) {
      const s = company(`short-${n}`);
      const id = openInquiries(s).find((i) => getProject(i).deadlineDays === 1);
      if (id) found = { s, id };
    }
    if (!found) throw new Error('標準の納期が1日の引き合いが見つからない');
    const cmd: Command = { type: 'SubmitBid', projectId: found.id, price: 'base', deadline: 'short' };
    expect(reduce(found.s, cmd).state).toBe(found.s);
  });
});
