import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getHuman } from '../../src/content/index';
import { type Command, reduce } from '../../src/core/commands';
import { tierOf } from '../../src/core/company';
import { dailyCost } from '../../src/core/formulas';
import { scoreCompany } from '../../src/core/scoring';
import { deserialize, OutdatedSaveError, serialize } from '../../src/core/serialize';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { talentId } from '../../src/core/talent';
import { operatorOf, signingFee, teamMembers } from '../../src/core/team';
import { teamView } from '../../src/view/team';

const DAY = balance.time.minutesPerDay;
const P = 'ecRenewal';
const hireCmd = (staffId: string): Command => ({ type: 'Hire', staffId });
const releaseCmd = (staffId: string): Command => ({ type: 'Release', staffId });

/** 採用が解放された state（単発のプレイはすべて解放済み） */
const fresh = (seed = 'hire') => createInitialState(seed);

/** 今日の候補を n 人採用する */
function hireAll(state: GameState, n: number): GameState {
  let s = state;
  for (const id of s.market.candidates.slice(0, n)) s = reduce(s, hireCmd(id)).state;
  return s;
}

/** 次の営業日まで進めて、新しい候補を出す */
const nextDay = (s: GameState) => step(s, DAY - (s.clock % DAY)).state;

describe('採用と退職（Hire / Release）', () => {
  it('候補を採用すると契約金を払って入社し、候補から外れる。StaffJoined を出す', () => {
    const s = fresh();
    const id = s.market.candidates[0] ?? '';
    const r = reduce(s, hireCmd(id));
    expect(r.events).toEqual([{ type: 'StaffJoined', staffId: id }]);
    expect(r.state.team[id]).toEqual({ seat: 'standard', used: 0 });
    expect(r.state.humanQueues[id]).toEqual([]);
    expect(r.state.market.candidates).not.toContain(id);
    expect(r.state.hireCost).toBe(getHuman(id).dailyRate * balance.hire.signingDays);
    expect(signingFee(id)).toBe(r.state.hireCost);
    // 会社の利益から契約金を引く
    expect(scoreCompany(r.state).profit).toBeCloseTo(scoreCompany(s).profit - r.state.hireCost);
    // 同じ人は二度採用できない・候補にいない人は採用できない
    expect(reduce(r.state, hireCmd(id)).state).toBe(r.state);
    expect(reduce(s, hireCmd(talentId('not-a-candidate'))).state).toBe(s);
  });

  it('人員の上限に達したら採用できず、社員の画面の採用ボタンも無効になる', () => {
    let s = fresh('cap');
    while (Object.keys(s.team).length < tierOf(s).maxStaff) {
      s = hireAll(s, tierOf(s).maxStaff - Object.keys(s.team).length);
      s = nextDay(s);
    }
    expect(Object.keys(s.team)).toHaveLength(tierOf(s).maxStaff);
    const candidate = s.market.candidates[0] ?? '';
    expect(candidate).not.toBe('');
    expect(reduce(s, hireCmd(candidate)).state).toBe(s);
    expect(teamView(s).candidates.every((c) => c.hire === null)).toBe(true);
    expect(teamView(s).headcount).toEqual({ count: tierOf(s).maxStaff, max: tierOf(s).maxStaff });
    // 1人退職すれば、また採用できる
    const released = reduce(s, releaseCmd('sato')).state;
    expect(reduce(released, hireCmd(candidate)).state.team[candidate]).toBeDefined();
  });

  it('退職すると会社からいなくなり、StaffReleased を出す。最後の1人は退職できない', () => {
    const s = fresh();
    const r = reduce(s, releaseCmd('sato'));
    expect(r.events).toEqual([{ type: 'StaffReleased', staffId: 'sato' }]);
    expect(r.state.team.sato).toBeUndefined();
    expect(r.state.humanQueues.sato).toBeUndefined();
    expect(teamMembers(r.state).map((h) => h.id)).toEqual(['suzuki']);
    expect(reduce(r.state, releaseCmd('suzuki')).state).toBe(r.state);
    expect(teamView(r.state).members[0]?.releaseBlocked).toBe('最後の1人');
    // 会社にいない人は退職できない
    expect(reduce(s, releaseCmd('nobody')).state).toBe(s);
  });

  it('担当している Task が終わるまでは退職できない（担当を決めただけ・作業中・待ち行列）', () => {
    let s = reduce(fresh('busy'), { type: 'StartProject', projectId: P }).state;
    s = reduce(s, { type: 'AssignTask', projectId: P, taskId: 'hearing', mode: 'human', workerId: 'sato' }).state;
    expect(reduce(s, releaseCmd('sato')).state).toBe(s);
    expect(teamView(s).members.find((m) => m.id === 'sato')?.release).toBeNull();
    s = step(s, 10).state;
    expect(s.humanQueues.sato?.length).toBe(1);
    expect(reduce(s, releaseCmd('sato')).state).toBe(s);
    // 仕事を持っていない人は退職できる
    expect(reduce(s, releaseCmd('suzuki')).state.team.suzuki).toBeUndefined();
    // 担当した Task が終われば退職できる
    while (s.projects[P]?.tasks.hearing?.status !== 'done') s = step(s, 10).state;
    expect(reduce(s, releaseCmd('sato')).state.team.sato).toBeUndefined();
  });

  it('AI Worker の運用者が退職したら、最初に入社した社員が運用を引き継ぐ', () => {
    const s = fresh();
    expect(operatorOf(s, 'agent')).toBe('suzuki');
    const r = reduce(s, releaseCmd('suzuki')).state;
    expect(operatorOf(r, 'agent')).toBe('sato');
    expect(teamView(r).members[0]?.operator).toBe(true);
  });

  it('採用と退職は、キャンペーンでは最初の案件を納品するまで（チュートリアルの間）できない', () => {
    const s = createInitialState('c', { board: true });
    expect(reduce(s, hireCmd(s.market.candidates[0] ?? '')).state).toBe(s);
    expect(reduce(s, releaseCmd('sato')).state).toBe(s);
    expect(teamView(s).hiring).toBe(false);
  });
});

describe('採用市場と給与', () => {
  it('営業日が変わると候補が入れ替わる（同じ seed なら同じ候補）', () => {
    const s = fresh('market');
    expect(s.market.day).toBe(0);
    expect(s.market.candidates).toHaveLength(tierOf(s).candidates);
    const mid = step(s, DAY / 2).state;
    expect(mid.market).toEqual(s.market);
    const next = nextDay(s);
    expect(next.market.day).toBe(1);
    expect(next.market.candidates).toHaveLength(tierOf(s).candidates);
    expect(next.market.candidates).not.toEqual(s.market.candidates);
    expect(nextDay(fresh('market')).market).toEqual(next.market);
  });

  it('社員は待機中も給与がかかる：作業中の分は案件の人件費、待機中の分は会社の費用（案件の進行中だけ）', () => {
    const idle = fresh('pay');
    // 案件がなければ計上しない
    expect(step(idle, DAY).state.idleCost).toBe(0);
    let s = reduce(idle, { type: 'StartProject', projectId: P }).state;
    s = reduce(s, { type: 'AssignTask', projectId: P, taskId: 'hearing', mode: 'human', workerId: 'sato' }).state;
    const minutes = 60;
    s = step(s, minutes).state;
    const share = minutes / balance.project.minutesPerPersonDay;
    // 佐藤は最初のステップから作業中なので、待機していたのは鈴木だけ
    expect(s.idleCost).toBeCloseTo(dailyCost(getHuman('suzuki')) * share);
    expect(s.projects[P]?.tasks.hearing?.laborCost).toBeCloseTo(dailyCost(getHuman('sato')) * share);
    const company = scoreCompany(s);
    expect(company.idleCost).toBe(s.idleCost);
    expect(company.profit).toBeCloseTo(
      company.projectProfit - company.harnessCost - company.seatCost - company.hireCost - company.idleCost,
    );
  });
});

describe('セーブと再開', () => {
  it('採用した人材はセーブして再開しても同じ人で、候補・契約金もそのまま戻る', () => {
    // 5人まで採用できる規模で、4人の会社にしてからセーブする
    let s = hireAll(nextDay(hireAll(createInitialState('save', { tier: 'startup' }), 2)), 1);
    s = reduce(s, releaseCmd('sato')).state;
    const loaded = deserialize(serialize(s));
    expect(loaded).toEqual(s);
    expect(teamMembers(loaded)).toEqual(teamMembers(s));
    expect(teamMembers(loaded).map((h) => h.id)).toHaveLength(4);
    expect(teamView(loaded).candidates).toEqual(teamView(s).candidates);
  });

  it('v9 以前（キャンペーン）のセーブは読み込めず、採用市場と生成した人材の社員はセーブを通っても同じに戻る', () => {
    const base = reduce(createInitialState('v9', { team: ['sato', 'suzuki'] }), {
      type: 'StartProject',
      projectId: P,
    }).state;
    const {
      market: _m,
      hireCost: _h,
      idleCost: _i,
      ...rest
    } = {
      ...base,
      team: { ...base.team, watanabe: { seat: 'premium', used: 3 } },
      humanQueues: { ...base.humanQueues, watanabe: [{ projectId: P, taskId: 'hearing', queuedAt: 0 }] },
    };
    expect(() => deserialize(JSON.stringify({ saveVersion: 9, state: rest }))).toThrow(OutdatedSaveError);
    const id = talentId('watanabe');
    const current = {
      ...base,
      team: { ...base.team, [id]: { seat: 'premium' as const, used: 3 } },
      humanQueues: { ...base.humanQueues, [id]: [{ projectId: P, taskId: 'hearing', queuedAt: 0 }] },
    };
    const loaded = deserialize(serialize(current));
    expect(loaded.team[id]).toEqual({ seat: 'premium', used: 3 });
    expect(loaded.humanQueues[id]).toHaveLength(1);
    expect(getHuman(id).id).toBe(id);
    expect(loaded.market.candidates).toHaveLength(tierOf(loaded).candidates);
    expect(loaded.hireCost).toBe(0);
    expect(loaded.idleCost).toBe(0);
  });
});
