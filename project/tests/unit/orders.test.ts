import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { companyTiers } from '../../src/content/companyTiers';
import { getProject } from '../../src/content/index';
import type { ProjectSize } from '../../src/content/types';
import { inquiriesOn, openInquiries, postInquiries } from '../../src/core/board';
import { type Command, reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { deliveryRating, expireInquiries, maxProjects, orderBlock, orderTerms } from '../../src/core/orders';
import { generatedProjectId } from '../../src/core/projectGen';
import { scoreProject } from '../../src/core/scoring';
import { createInitialState, createProjectRun, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';

/*
 * 受注（core/orders.ts）。引き合いは選べば必ず受注でき、売上は標準価格を評判と競合の値下げで上下させた額、納期は標準の納期。
 * 同時に進められる数は会社の規模で決まり、受付の締切を過ぎた引き合いは黙って消える。納品の納期と品質で評判が変わる。
 */

const DAY = balance.time.minutesPerDay;
const projects = Array.from({ length: 40 }, (_, i) => generatedProjectId(`order-${i}`, 'M'));

/** チュートリアルなしで始め、最初の引き合いが届いた会社 */
function company(seed = 'order', tier: GameState['tier'] = 'solo'): GameState {
  const s = createInitialState(seed, { board: true, tutorial: false, tier });
  return postInquiries(s, () => {});
}

describe('受注の条件（orderTerms）', () => {
  it('引き合いを選べば必ず受注でき、売上と納期は受注の条件のとおり。引き合いはボードから外れる', () => {
    for (let n = 0; n < 10; n++) {
      const s = company(`always-${n}`);
      const id = openInquiries(s)[0] ?? '';
      const terms = orderTerms(s, id);
      const r = reduce(s, { type: 'AcceptOrder', projectId: id });
      expect(r.events).toContainEqual({ type: 'OrderAccepted', projectId: id, amount: terms.revenue });
      expect(r.state.clock).toBe(s.clock);
      expect(r.state.projects[id]).toMatchObject({
        revenue: terms.revenue,
        deadlineDays: terms.deadlineDays,
        startedAt: s.clock,
        completedAt: null,
      });
      expect(openInquiries(r.state)).toEqual(openInquiries(s).filter((o) => o !== id));
    }
  });

  it('評判が中央なら売上は標準価格（金額の刻みに丸める）で、納期は標準の納期', () => {
    const s = company();
    expect(s.reputation).toBe(balance.reputation.initial);
    const step = balance.orders.amountStep;
    for (const id of projects) {
      const def = getProject(id);
      expect(orderTerms(s, id)).toEqual({
        revenue: Math.round(def.revenue / step) * step,
        deadlineDays: def.deadlineDays,
      });
    }
  });

  it('評判が高いほど売上が高く、低いほど安い', () => {
    const s = company();
    for (const id of projects) {
      const mid = orderTerms(s, id).revenue;
      expect(orderTerms({ ...s, reputation: 90 }, id).revenue, id).toBeGreaterThan(mid);
      expect(orderTerms({ ...s, reputation: 10 }, id).revenue, id).toBeLessThan(mid);
      expect(orderTerms({ ...s, reputation: 90 }, id).deadlineDays).toBe(orderTerms(s, id).deadlineDays);
    }
  });

  it('競合の値下げの間は売上が下がる', () => {
    const s = company();
    const war = { ...s, companyEvents: { ...s.companyEvents, priceWarUntil: s.clock + DAY } };
    for (const id of projects) {
      expect(orderTerms(war, id).revenue, id).toBeLessThan(orderTerms(s, id).revenue);
    }
  });
});

describe('受注できないとき（orderBlock）', () => {
  it('同時に進められる数（会社の規模ごと）に達すると受注できず、大きな会社ほど多く進められる', () => {
    const s = company();
    const ids = openInquiries(s);
    expect(ids.length).toBeGreaterThan(maxProjects(s));
    let next = s;
    for (const id of ids) next = reduce(next, { type: 'AcceptOrder', projectId: id }).state;
    expect(Object.keys(next.projects)).toHaveLength(maxProjects(s));
    const rest = openInquiries(next)[0] ?? '';
    expect(orderBlock(next, rest)).toBe('full');
    expect(reduce(next, { type: 'AcceptOrder', projectId: rest }).state).toBe(next);
    // 1件を終えれば、また受注できる
    const [done = ''] = Object.keys(next.projects);
    const run = next.projects[done];
    if (!run) throw new Error('案件がない');
    const freed = { ...next, projects: { ...next.projects, [done]: { ...run, completedAt: next.clock } } };
    expect(orderBlock(freed, rest)).toBeNull();
    // 規模が上がるほど上限が増える
    const limits = companyTiers.map((t) => t.maxProjects);
    for (let i = 1; i < limits.length; i++) expect(limits[i]).toBeGreaterThanOrEqual(limits[i - 1] ?? 0);
    expect(limits.at(-1)).toBeGreaterThan(limits[0] ?? 0);
  });

  it('チュートリアルの間・ボードにない引き合い・締切を過ぎた引き合いは受注できない', () => {
    const tutorial = createInitialState('t', { board: true });
    const cmd: Command = { type: 'AcceptOrder', projectId: 'p~1~S' };
    expect(orderBlock(tutorial, 'p~1~S')).toBe('tutorial');
    expect(reduce(tutorial, cmd).state).toBe(tutorial);
    const s = company();
    expect(orderBlock(s, 'p~1~S')).toBe('notOpen');
    expect(reduce(s, cmd).state).toBe(s);
    const id = openInquiries(s)[0] ?? '';
    const closed = { ...s, clock: s.board?.inquiries[0]?.closesAt ?? 0 };
    expect(orderBlock(closed, id)).toBe('notOpen');
    expect(reduce(closed, { ...cmd, projectId: id }).state).toBe(closed);
  });
});

describe('受付の締切（expireInquiries）', () => {
  it('締切を過ぎた引き合いだけが、知らせずにボードから消える', () => {
    const s = company();
    const board = s.board;
    if (!board) throw new Error('案件ボードがない');
    const closesAt = Math.min(...board.inquiries.map((i) => i.closesAt));
    const due = board.inquiries.filter((i) => i.closesAt <= closesAt).map((i) => i.projectId);
    const next = expireInquiries({ ...s, clock: closesAt });
    expect(openInquiries(next)).toEqual(openInquiries(s).filter((o) => !due.includes(o)));
    // 締切前なら何も変えない
    expect(expireInquiries(s)).toBe(s);
    // 時間を進めたときも、消えた引き合いについてのイベントは出ない
    const { events } = step(s, closesAt - s.clock);
    for (const e of events) if ('projectId' in e) expect(due).not.toContain(e.projectId);
  });
});

describe('会社の規模と届く案件（core/board.ts の inquiriesOn）', () => {
  it('届く案件の数と規模は会社の規模で決まり、重みのない規模の案件は届かない', () => {
    for (const tier of companyTiers) {
      const sizes = new Set<ProjectSize>();
      for (let day = 0; day < 30; day++) {
        const ids = inquiriesOn('tier', day, tier);
        expect(ids).toHaveLength(tier.inquiries);
        for (const id of ids) sizes.add(getProject(id).brief?.size as ProjectSize);
      }
      const allowed = (Object.entries(tier.sizes) as [ProjectSize, number][]).filter(([, w]) => w > 0).map(([k]) => k);
      expect([...sizes].sort(), tier.id).toEqual([...allowed].sort());
    }
    // 小さな会社には大きな案件（L・XL）が届かず、大きな会社には届く
    const first = companyTiers[0];
    const last = companyTiers.at(-1);
    expect(first?.sizes.L).toBe(0);
    expect(first?.sizes.XL).toBe(0);
    expect(last?.sizes.XL).toBeGreaterThan(0);
  });
});

describe('納品の評判（deliveryRating）', () => {
  const s = company();
  const id = generatedProjectId('rate', 'S');
  const run = createProjectRun(id, 0, { revenue: 1, deadlineDays: 2 });
  const done = (quality: number, burningAt: number | null = null): GameState => {
    const tasks = Object.fromEntries(
      Object.entries(run.tasks).map(([k, t]) => [k, { ...t, status: 'done' as const, quality }]),
    );
    return { ...s, projects: { [id]: { ...run, tasks, completedAt: DAY, burningAt } } };
  };

  it('期限内で品質が高ければ上がり、炎上した案件は期限内の分だけ上がらない。品質が低いほど下がる', () => {
    const onTime = deliveryRating(done(1), id);
    expect(onTime).toBeGreaterThan(0);
    expect(deliveryRating(done(1, DAY * 2), id)).toBeCloseTo(onTime - balance.reputation.onTime);
    expect(deliveryRating(done(balance.reputation.qualityPivot, DAY * 2), id)).toBeCloseTo(0);
    expect(deliveryRating(done(0.6), id)).toBeLessThan(0);
    expect(deliveryRating(done(0.6), id)).toBeLessThan(onTime);
    expect(scoreProject(done(1), id)?.revenue).toBe(1);
  });

  it('納品していない案件では評判は変わらない', () => {
    expect(deliveryRating({ ...s, projects: { [id]: run } }, id)).toBe(0);
  });
});

describe('ヘッドレスで通す', () => {
  it('受注 → 担当を決めて納品 → 評判の変化', () => {
    let s = company('record');
    const log: string[] = [];
    const events: GameEvent[] = [];
    // 小さい案件を選ぶ（人手の少ない創業時の会社で、期限内に納品しやすい）
    const projectId = openInquiries(s).find((id) => getProject(id).brief?.size === 'S') ?? openInquiries(s)[0] ?? '';
    const accepted = reduce(s, { type: 'AcceptOrder', projectId });
    s = accepted.state;
    for (const e of accepted.events) {
      if (e.type === 'OrderAccepted') log.push(`受注：${getProject(e.projectId).name} ${e.amount}円`);
    }
    expect(s.projects[projectId]).toBeDefined();
    const humans = Object.keys(s.team);
    let turn = 0;
    for (const t of getProject(projectId).tasks) {
      const mode = t.aiAptitude >= 0.6 ? 'aiThenHumanReview' : 'human';
      s = reduce(s, {
        type: 'AssignTask',
        projectId,
        taskId: t.id,
        mode,
        workerId: mode === 'human' ? (humans[turn++ % humans.length] ?? '') : 'agent',
      }).state;
    }
    const before = s.reputation;
    for (let day = 0; day < 30 && (s.projects[projectId]?.completedAt ?? null) === null; day++) {
      const r = step(s, DAY);
      s = r.state;
      events.push(...r.events);
    }
    const run = s.projects[projectId];
    const score = scoreProject(s, projectId);
    const changed = events.filter((e) => e.type === 'ReputationChanged' && e.projectId === projectId);
    log.push(
      `${run?.cancelled ? '打ち切り' : '納品'}：${getProject(projectId).name} 売上 ${score?.revenue}円` +
        `・品質 ${score?.quality.toFixed(2)}・${Math.ceil((score?.elapsedMinutes ?? 0) / DAY)}日（納期 ${run?.deadlineDays}日）` +
        `${run?.burningAt !== null ? '・炎上' : ''}`,
      `評判：${before} → ${s.reputation.toFixed(1)}`,
    );
    console.log(`[受注の記録]\n  ${log.join('\n  ')}`);
    expect(run?.completedAt).not.toBeNull();
    expect(changed.at(-1)).toMatchObject({ type: 'ReputationChanged', reputation: s.reputation });
    expect(s.reputation).not.toBe(before);
    if (run?.cancelled === null) {
      expect(score?.completed).toBe(true);
      expect(score?.revenue).toBe(run.revenue);
    }
  });
});
