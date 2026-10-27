import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getHuman, getModel, getTask } from '../../src/content/index';
import { getSeat } from '../../src/content/seats';
import { type Command, reduce } from '../../src/core/commands';
import { scoreCompany } from '../../src/core/scoring';
import { createInitialState, type GameState } from '../../src/core/state';
import { humanSpeed, seatDailyCost, teamDailyCost, usageSpeed } from '../../src/core/team';
import { runHeadless } from '../helpers/headless';
import { findTalents } from '../helpers/talent';

const P = 'ecRenewal';
const DAY = balance.project.minutesPerBusinessDay;
const start: Command = { type: 'StartProject', projectId: P };
const at0 = (...commands: Command[]) => commands.map((command) => ({ at: 0, command }));

/** 運用者（鈴木）の今日の使用量を used にした state */
const withUsage = (state: GameState, used: number): GameState => ({
  ...state,
  team: { ...state.team, suzuki: { seat: state.team.suzuki?.seat ?? 'standard', used } },
});

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

  it('運用者の使用量が上限を超えると、AI Worker の作業が遅くなる', () => {
    const s = createInitialState('s');
    expect(usageSpeed(s, 'agent')).toBe(1);
    expect(usageSpeed(withUsage(s, getSeat('standard').dailyUsage), 'agent')).toBe(balance.seat.overLimitSpeed);
    // Premium にすると同じ使用量でも上限に届かない
    const premium = reduce(withUsage(s, getSeat('standard').dailyUsage), {
      type: 'SetSeat',
      staffId: 'suzuki',
      seat: 'premium',
    }).state;
    expect(usageSpeed(premium, 'agent')).toBe(1);
  });

  it('上限を超えた後は同じ時間で進む AI の作業量が減り、使用量はモデルの消費量に比例して増える', () => {
    const minutes = 35;
    const fresh = implementationRun(0, minutes);
    const limit = getSeat('standard').dailyUsage;
    const capped = implementationRun(limit, minutes);
    const left = (s: GameState) => s.projects[P]?.tasks.implementation?.remaining ?? 0;
    // 指示出し（人間）の後に AI が作業する。上限超えでは同じ時間で進む量が overLimitSpeed 倍になる
    const startedAt = (s: GameState) => s.projects[P]?.tasks.implementation?.aiMinutes ?? 0;
    expect(startedAt(fresh)).toBeGreaterThan(0);
    expect(startedAt(capped)).toBe(startedAt(fresh));
    const total = left(fresh) + startedAt(fresh);
    expect(total - left(capped)).toBeCloseTo(startedAt(capped) * balance.seat.overLimitSpeed);
    const usagePerMinute = getModel('standard').usagePerMinute;
    expect(fresh.team.suzuki?.used).toBeCloseTo(startedAt(fresh) * usagePerMinute);
    // 運用者でない社員の使用量は増えない
    expect(fresh.team.sato?.used).toBe(0);
  });

  it('使用量は営業日が変わると 0 に戻る', () => {
    const s = runHeadless({ seed: 's', initial: withUsage(createInitialState('s'), 999), until: DAY + 1 }).state;
    expect(s.usageDay).toBe(1);
    expect(s.team.suzuki?.used).toBe(0);
  });

  it('固定費は月額を日割りにして、案件を進めている間だけ計上する', () => {
    const idle = runHeadless({ seed: 'f', until: DAY }).state;
    expect(idle.seatCost).toBe(0);
    const s = runHeadless({ seed: 'f', commands: at0(start), until: DAY }).state;
    const standardDaily = (getSeat('standard').monthlyUsd * balance.seat.yenPerUsd) / balance.seat.businessDaysPerMonth;
    expect(seatDailyCost(getSeat('standard'))).toBeCloseTo(standardDaily);
    // 2人とも Standard で1営業日
    expect(s.seatCost).toBeCloseTo(2 * standardDaily);
    expect(teamDailyCost(s)).toBeCloseTo(2 * standardDaily);
    // 会社のスコアでは固定費を引く
    expect(scoreCompany(s).seatCost).toBeCloseTo(2 * standardDaily);
  });

  it('Seat を変えると、その時点から新しい月額で計上する', () => {
    const premium: Command = { type: 'SetSeat', staffId: 'suzuki', seat: 'premium' };
    const s = runHeadless({
      seed: 'f',
      commands: [...at0(start), { at: DAY / 2, command: premium }],
      until: DAY,
    }).state;
    const half = (seat: 'standard' | 'premium') => seatDailyCost(getSeat(seat)) / 2;
    expect(s.seatCost).toBeCloseTo(2 * half('standard') + half('standard') + half('premium'));
  });

  it('SetSeat は社員の画面が解放されていて、会社にいる社員にだけ効き、SeatChanged を出す', () => {
    const s = createInitialState('s');
    const r = reduce(s, { type: 'SetSeat', staffId: 'suzuki', seat: 'premium' });
    expect(r.state.team.suzuki?.seat).toBe('premium');
    expect(r.events).toEqual([{ type: 'SeatChanged', staffId: 'suzuki', seat: 'premium' }]);
    // 会社にいない社員・同じ Seat は変わらない
    expect(reduce(s, { type: 'SetSeat', staffId: s.market.candidates[0] ?? '', seat: 'premium' }).state).toBe(s);
    expect(reduce(s, { type: 'SetSeat', staffId: 'suzuki', seat: 'standard' }).state).toBe(s);
    // キャンペーンでは解放されるまで変えられない
    const campaign = createInitialState('c', { campaign: true });
    expect(reduce(campaign, { type: 'SetSeat', staffId: 'suzuki', seat: 'premium' }).state).toBe(campaign);
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
