import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getHuman, getModel, getTask } from '../../src/content/index';
import { getSeat } from '../../src/content/seats';
import { type Command, reduce } from '../../src/core/commands';
import { scoreCompany } from '../../src/core/scoring';
import { createInitialState, type GameState } from '../../src/core/state';
import { humanSpeed, overLimit, seatDailyCost, seatsDailyCost, usageLimit } from '../../src/core/team';
import { runHeadless } from '../helpers/headless';
import { findTalents } from '../helpers/talent';

const P = 'ecRenewal';
const DAY = balance.time.minutesPerDay;
const start: Command = { type: 'StartProject', projectId: P };
const at0 = (...commands: Command[]) => commands.map((command) => ({ at: 0, command }));

/** 会社の今日の使用量を used にした state */
const withUsage = (state: GameState, used: number): GameState => ({ ...state, usage: used });

/** 実装（AI 適性が高く大きい Task）だけを AI に任せ、依存の Task は済ませた状態から進める */
function implementationRun(used: number, until: number) {
  const started = reduce(createInitialState('seat'), start).state;
  const deps = ['hearing', 'requirements', 'uiDesign', 'research'];
  let s = started;
  for (const id of deps) {
    const run = s.projects[P];
    const t = run?.tasks[id];
    if (!run || !t) throw new Error('案件が始まっていない');
    s = { ...s, projects: { ...s.projects, [P]: { ...run, tasks: { ...run.tasks, [id]: { ...t, status: 'done' } } } } };
  }
  return runHeadless({
    seed: 'seat',
    initial: withUsage(s, used),
    commands: at0({ type: 'AssignTask', projectId: P, taskId: 'implementation', mode: 'ai', workerId: 'agent' }),
    until,
  }).state;
}

describe('Seat（core/team.ts）', () => {
  it('Premium は Standard の5倍の使用量（AI 容量 +400%）を持つ', () => {
    expect(getSeat('premium').dailyUsage / getSeat('standard').dailyUsage).toBe(5);
  });

  it('Seat は会社が枚数で持ち、使用量の上限は枚数 × 1枚の使用量の合計。人の数とは関係ない', () => {
    const s = createInitialState('s');
    expect(s.seats).toEqual(balance.seat.initial);
    expect(usageLimit(s)).toBe(2 * getSeat('standard').dailyUsage);
    const three = createInitialState('s', { team: ['sato', 'suzuki', findTalents(() => true, 1)[0].id] });
    expect(usageLimit(three)).toBe(usageLimit(s));
    expect(usageLimit({ ...s, seats: { standard: 1, premium: 2 } })).toBe(
      getSeat('standard').dailyUsage + 2 * getSeat('premium').dailyUsage,
    );
  });

  it('会社の使用量を使い切ると AI は止まり、Seat を買い足すとすぐ動き出す。0枚なら AI は使えない', () => {
    const s = createInitialState('s');
    expect(overLimit(s)).toBe(false);
    const full = withUsage(s, usageLimit(s));
    expect(overLimit(full)).toBe(true);
    expect(overLimit(reduce(full, { type: 'SetSeats', seat: 'premium', count: 1 }).state)).toBe(false);
    expect(overLimit({ ...s, seats: { standard: 0, premium: 0 } })).toBe(true);
  });

  it('使い切った後は AI の作業が進まず、費用も増えない。使用量はモデルの消費量に比例して増える', () => {
    const minutes = 35;
    const fresh = implementationRun(0, minutes);
    const limit = usageLimit(createInitialState('seat'));
    const capped = implementationRun(limit, minutes);
    const task = (s: GameState) => s.projects[P]?.tasks.implementation;
    // 指示出し（人間）の後に AI が作業する。使い切っていると AI の工程が始まっても進まない
    expect(task(fresh)?.aiMinutes).toBeGreaterThan(0);
    expect(task(capped)?.aiMinutes).toBe(0);
    expect(task(capped)?.aiCost).toBe(0);
    expect(task(capped)?.remaining).toBeGreaterThan(task(fresh)?.remaining ?? 0);
    expect(capped.usage).toBe(limit);
    const usagePerMinute = getModel('standard').usagePerMinute;
    expect(fresh.usage).toBeCloseTo((task(fresh)?.aiMinutes ?? 0) * usagePerMinute);
  });

  it('使用量は営業日が変わると 0 に戻る', () => {
    const s = runHeadless({ seed: 's', initial: withUsage(createInitialState('s'), 999), until: DAY + 1 }).state;
    expect(s.usageDay).toBe(1);
    expect(s.usage).toBe(0);
  });

  it('固定費は枚数 × 月額を日割りにして、案件を進めている間だけ計上する', () => {
    const idle = runHeadless({ seed: 'f', until: DAY }).state;
    expect(idle.seatCost).toBe(0);
    const s = runHeadless({ seed: 'f', commands: at0(start), until: DAY }).state;
    const standardDaily = (getSeat('standard').monthlyUsd * balance.seat.yenPerUsd) / balance.seat.businessDaysPerMonth;
    expect(seatDailyCost(getSeat('standard'))).toBeCloseTo(standardDaily);
    // Standard 2枚で1営業日
    expect(s.seatCost).toBeCloseTo(2 * standardDaily);
    expect(seatsDailyCost(s)).toBeCloseTo(2 * standardDaily);
    // 会社のスコアでは固定費を引く
    expect(scoreCompany(s).seatCost).toBeCloseTo(2 * standardDaily);
  });

  it('枚数を変えると、その時点から新しい枚数で計上する', () => {
    const premium: Command = { type: 'SetSeats', seat: 'premium', count: 1 };
    const s = runHeadless({
      seed: 'f',
      commands: [...at0(start), { at: DAY / 2, command: premium }],
      until: DAY,
    }).state;
    const half = (seat: 'standard' | 'premium') => seatDailyCost(getSeat(seat)) / 2;
    expect(s.seatCost).toBeCloseTo(4 * half('standard') + half('premium'));
  });

  it('SetSeats は社員の画面が解放されていて、0 以上の整数の枚数にだけ効き、SeatsChanged を出す', () => {
    const s = createInitialState('s');
    const r = reduce(s, { type: 'SetSeats', seat: 'premium', count: 3 });
    expect(r.state.seats).toEqual({ standard: 2, premium: 3 });
    expect(r.events).toEqual([{ type: 'SeatsChanged', seat: 'premium', count: 3 }]);
    expect(reduce(s, { type: 'SetSeats', seat: 'standard', count: 0 }).state.seats.standard).toBe(0);
    // 負の数・整数でない数・同じ枚数は変わらない
    for (const count of [-1, 1.5, Number.NaN, 2]) {
      expect(reduce(s, { type: 'SetSeats', seat: 'standard', count }).state).toBe(s);
    }
    // キャンペーンでは解放されるまで変えられない
    const campaign = createInitialState('c', { board: true });
    expect(reduce(campaign, { type: 'SetSeats', seat: 'premium', count: 1 }).state).toBe(campaign);
  });

  it('得意分野の Task は速く、会社にいない社員には担当させられない', () => {
    // テスト（test）が得意な人材と、会社にいない人材
    const [tester, outsider] = findTalents((h) => h.strengths.includes('test') && !h.strengths.includes('planning'));
    const team = ['sato', 'suzuki', tester.id];
    const s = reduce(createInitialState('s', { team }), start).state;
    const assignQa = (workerId: string): Command => ({
      type: 'AssignTask',
      projectId: P,
      taskId: 'hearing',
      mode: 'human',
      workerId,
    });
    expect(reduce(s, assignQa(outsider.id)).state).toBe(s);
    expect(reduce(s, assignQa(tester.id)).state).not.toBe(s);
    const qa = getTask(P, 'qa');
    expect(qa.kind).toBe('test');
    expect(humanSpeed(tester.id, qa)).toBeCloseTo(tester.skill * balance.staff.strengthSpeed);
    expect(getTask(P, 'hearing').kind).toBe('planning');
    expect(humanSpeed(tester.id, getTask(P, 'hearing'))).toBe(tester.skill);
    // 創業メンバーは得意分野がなく、どの Task も同じ速さ（その人の skill）
    expect(humanSpeed('sato', qa)).toBe(getHuman('sato').skill);
    expect(humanSpeed('sato', getTask(P, 'hearing'))).toBe(getHuman('sato').skill);
  });
});
