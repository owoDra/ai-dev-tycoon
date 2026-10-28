import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getProject } from '../../src/content/index';
import { reduce } from '../../src/core/commands';
import { cancelProject, contractOf, contractSystem, deadlineAt, isDelivered } from '../../src/core/contract';
import type { GameEvent } from '../../src/core/events';
import { valuationOf } from '../../src/core/funds';
import { generatedProjectId } from '../../src/core/projectGen';
import { createRngCursor } from '../../src/core/rng';
import { scoreProject } from '../../src/core/scoring';
import { deserialize, serialize } from '../../src/core/serialize';
import { createInitialState, createProjectRun, type GameState } from '../../src/core/state';
import { humanChoices } from '../../src/view/project';

/*
 * 案件の契約と期限（core/contract.ts）。期限厳守は期限切れで打ち切り（入金なし）、炎上しても続行は炎上して作業を続ける。
 * どちらも評判と企業価値が下がり、会社側から打ち切るともっと下がる。
 */

const DAY = balance.time.minutesPerDay;
const ids = Array.from({ length: 60 }, (_, i) => generatedProjectId(`contract-${i}`, 'M'));
const strictId = ids.find((id) => contractOf(id) === 'strict') ?? '';
const lenientId = ids.find((id) => contractOf(id) === 'lenient') ?? '';

/** 案件ボードのある会社で、案件を始めて人間に1件任せた状態 */
function started(projectId: string): GameState {
  const s = createInitialState('contract', { board: true, tutorial: false });
  const run = createProjectRun(projectId, 0);
  const human = humanChoices(s)[0]?.id ?? '';
  const firstTask = getProject(projectId).tasks[0]?.id ?? '';
  return {
    ...s,
    projects: { [projectId]: run },
    humanQueues: { ...s.humanQueues, [human]: [{ projectId, taskId: firstTask, queuedAt: 0 }] },
  };
}

/** 期限ちょうどの時刻で契約の判定を走らせる */
function atDeadline(state: GameState, projectId: string) {
  const run = state.projects[projectId];
  if (!run) throw new Error('案件がない');
  const events: GameEvent[] = [];
  const next = contractSystem(
    { ...state, clock: deadlineAt(run) },
    { rng: createRngCursor(1), emit: (e) => events.push(e) },
  );
  return { next, events };
}

describe('契約の種類（生成した案件）', () => {
  it('生成した案件の一部が期限厳守になり、案件の id から決まる。固定の案件は炎上しても続行', () => {
    const strict = ids.filter((id) => contractOf(id) === 'strict').length / ids.length;
    expect(strict).toBeGreaterThan(balance.contract.strictShare / 2);
    expect(strict).toBeLessThan(Math.min(1, balance.contract.strictShare * 2));
    expect(ids.map(contractOf)).toEqual(ids.map(contractOf));
    expect(contractOf('ecRenewal')).toBe('lenient');
  });
});

describe('期限切れ', () => {
  it('期限厳守の案件は期限が切れたらその場で打ち切り、入金はなく、担当の仕事から外れ、評判と企業価値が下がる', () => {
    const s = started(strictId);
    expect(atDeadline({ ...s, clock: 0 }, strictId).next.projects[strictId]?.completedAt).not.toBeNull();
    const before = contractSystem(
      { ...s, clock: deadlineAt(s.projects[strictId] ?? createProjectRun(strictId, 0)) - 1 },
      {
        rng: createRngCursor(1),
        emit: () => {},
      },
    );
    expect(before.projects[strictId]?.cancelled).toBeNull();
    const { next, events } = atDeadline(s, strictId);
    const run = next.projects[strictId];
    expect(run?.cancelled).toBe('expired');
    expect(run && isDelivered(run)).toBe(false);
    expect(events).toContainEqual({ type: 'ProjectCancelled', projectId: strictId, reason: 'expired' });
    expect(scoreProject(next, strictId)?.revenue).toBe(0);
    expect(Object.values(next.humanQueues).flat()).toEqual([]);
    expect(next.reputation).toBe(s.reputation - balance.contract.reputation.expired);
    expect(next.valuationHit).toBeCloseTo((run?.revenue ?? 0) * balance.contract.valuation.expired);
    expect(valuationOf(next)).toBeLessThan(valuationOf(s));
  });

  it('炎上しても続行の案件は炎上して作業を続け（1回だけ）、納品すれば元の売上が入る', () => {
    const s = started(lenientId);
    const { next, events } = atDeadline(s, lenientId);
    const run = next.projects[lenientId];
    expect(run?.burningAt).toBe(deadlineAt(s.projects[lenientId] ?? createProjectRun(lenientId, 0)));
    expect(run?.completedAt).toBeNull();
    expect(events).toContainEqual({ type: 'ProjectBurning', projectId: lenientId });
    expect(next.reputation).toBe(s.reputation - balance.contract.reputation.burning);
    expect(Object.values(next.humanQueues).flat()).toHaveLength(1);
    // もう一度判定しても炎上は重ならない
    expect(atDeadline(next, lenientId).events).toEqual([]);
    // 納品すれば元の売上
    const tasks = Object.fromEntries(
      Object.entries(run?.tasks ?? {}).map(([k, t]) => [k, { ...t, status: 'done' as const, quality: 1 }]),
    );
    const done = {
      ...next,
      projects: { [lenientId]: { ...(run ?? createProjectRun(lenientId, 0)), tasks, completedAt: next.clock } },
    };
    expect(scoreProject(done, lenientId)?.revenue).toBe(run?.revenue);
  });

  it('失った企業価値は、営業日が変わるたびに少しずつ戻る', () => {
    const s = { ...createInitialState('recover', { board: true, tutorial: false }), valuationHit: 1_000_000 };
    const next = contractSystem({ ...s, clock: DAY }, { rng: createRngCursor(1), emit: () => {} });
    expect(next.valuationHit).toBeCloseTo(1_000_000 * (1 - balance.contract.recovery));
    expect(contractSystem({ ...s, clock: DAY + 1 }, { rng: createRngCursor(1), emit: () => {} }).valuationHit).toBe(
      1_000_000,
    );
  });
});

describe('会社側からの打ち切り（CancelProject）', () => {
  it('入金なしで打ち切り、期限切れより評判と企業価値が大きく下がる。チュートリアル中と案件ボードのない会社では打ち切れない', () => {
    const s = started(lenientId);
    const r = reduce(s, { type: 'CancelProject', projectId: lenientId });
    expect(r.state.projects[lenientId]?.cancelled).toBe('cancelled');
    expect(r.events).toContainEqual({ type: 'ProjectCancelled', projectId: lenientId, reason: 'cancelled' });
    const expired = cancelProject(s, lenientId, 'expired', () => {});
    expect(r.state.reputation).toBeLessThan(expired.reputation);
    expect(r.state.valuationHit).toBeGreaterThan(expired.valuationHit);
    // 終わった案件はもう打ち切れない
    expect(reduce(r.state, { type: 'CancelProject', projectId: lenientId }).state).toBe(r.state);
    const tutorial = { ...s, tutorial: { step: 0, history: [] } } as unknown as GameState;
    expect(reduce(tutorial, { type: 'CancelProject', projectId: lenientId }).state).toBe(tutorial);
    const solo = { ...s, board: null };
    expect(reduce(solo, { type: 'CancelProject', projectId: lenientId }).state).toBe(solo);
  });
});

describe('セーブ（v20 → v21）', () => {
  it('どの案件も炎上・打ち切りなしで読み込み、失った企業価値は 0 から', () => {
    const s = started(lenientId);
    const { valuationHit: _hit, ...rest } = s;
    const projects = Object.fromEntries(
      Object.entries(s.projects).map(([id, p]) => {
        const { burningAt: _b, cancelled: _c, ...old } = p;
        return [id, old];
      }),
    );
    const old = JSON.parse(serialize(s)) as { saveVersion: number };
    const loaded = deserialize(JSON.stringify({ ...old, saveVersion: 20, state: { ...rest, projects } }));
    expect(loaded.valuationHit).toBe(0);
    expect(loaded.projects[lenientId]?.burningAt).toBeNull();
    expect(loaded.projects[lenientId]?.cancelled).toBeNull();
  });
});
