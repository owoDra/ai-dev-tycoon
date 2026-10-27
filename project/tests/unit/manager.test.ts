import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getProject } from '../../src/content/index';
import { type Command, reduce } from '../../src/core/commands';
import { managerCommands, managerSystem } from '../../src/core/manager';
import { generatedProjectId } from '../../src/core/projectGen';
import { scoreProject } from '../../src/core/scoring';
import { createInitialState, type GameState, type ManagerRun } from '../../src/core/state';
import { step } from '../../src/core/step';
import { talentId } from '../../src/core/talent';
import { operatorOf } from '../../src/core/team';
import { DIRECT, isDelegated, oversight, teamOfProject, teamOfWorker } from '../../src/core/teams';
import { playManaged } from '../helpers/managers';

const DAY = balance.time.minutesPerDay;
const P = generatedProjectId('mgr', 'M');
const W = [0, 1, 2].map((i) => talentId(`mgr:${i}`, true));
const PM = talentId('mgr:pm', true);

const must = (s: GameState, c: Command) => {
  const r = reduce(s, c);
  if (r.state === s) throw new Error(`Command が通らない: ${JSON.stringify(c)}`);
  return r.state;
};

/** 小規模の会社で、社員3人＋PM 候補と AI Worker を第2チームに移し、案件を割り当てた state（管理者はまだいない） */
function teamed(seed = 'mgr'): GameState {
  let s = createInitialState(seed, { team: [...W, PM], tier: 'small' });
  s = must(s, { type: 'CreateTeam' });
  for (const id of [...W, PM, 'agent']) s = must(s, { type: 'MoveMember', workerId: id, teamId: 't~2' });
  s = must(s, { type: 'StartProject', projectId: P });
  return must(s, { type: 'MoveProject', projectId: P, teamId: 't~2' });
}

const managed = (manager: ManagerRun, seed?: string) =>
  must(teamed(seed), { type: 'SetManager', teamId: 't~2', manager });
const ctx = () => {
  const events: unknown[] = [];
  return {
    events,
    ctx: { rng: { next: () => 0.5, chance: () => false, state: 0 } as never, emit: (e: unknown) => events.push(e) },
  };
};

describe('チーム（core/teams.ts）', () => {
  it('どのチームにも入っていない社員・AI Worker・案件は直轄チームに属し、移すと所属が変わる', () => {
    const s0 = createInitialState('t', { tier: 'small' });
    expect(teamOfWorker(s0, 'sato')).toBe(DIRECT);
    const s = teamed();
    expect(teamOfWorker(s, W[0] ?? '')).toBe('t~2');
    expect(teamOfWorker(s, 'agent')).toBe('t~2');
    expect(teamOfProject(s, P)).toBe('t~2');
    // 直轄に戻す
    expect(teamOfWorker(must(s, { type: 'MoveMember', workerId: W[0] ?? '', teamId: DIRECT }), W[0] ?? '')).toBe(
      DIRECT,
    );
  });

  it('増やした AI Worker はチームの最初の社員が運用し、その人の Seat から使用量を使う', () => {
    let s = createInitialState('ops', { team: [...W], tier: 'small' });
    s = must(s, { type: 'AddAiWorker' });
    expect(s.agents).toEqual(['agent', 'ai~2']);
    expect(s.sessions['ai~2']).toBeDefined();
    s = must(s, { type: 'CreateTeam' });
    s = must(s, { type: 'MoveMember', workerId: W[1] ?? '', teamId: 't~2' });
    s = must(s, { type: 'MoveMember', workerId: 'ai~2', teamId: 't~2' });
    expect(operatorOf(s, 'ai~2')).toBe(W[1]);
  });

  it('管理者がいないチームはプレイヤーが担当を決め、管理者に委任すると決められない（介入すると決められる）', () => {
    const assign: Command = {
      type: 'AssignTask',
      projectId: P,
      taskId: getProject(P).tasks[0]?.id ?? '',
      mode: 'human',
      workerId: W[0] ?? '',
    };
    expect(reduce(teamed(), assign).state).not.toBe(teamed());
    const s = managed({ kind: 'ai' });
    expect(isDelegated(s, 't~2')).toBe(true);
    expect(reduce(s, assign).state).toBe(s);
    const intervened = must(s, { type: 'Intervene', teamId: 't~2', on: true });
    expect(isDelegated(intervened, 't~2')).toBe(false);
    expect(reduce(intervened, assign).state.projects[P]?.tasks[assign.taskId]?.assignment?.workerId).toBe(W[0]);
    // 委任に戻せば、管理者がまた決める
    expect(isDelegated(must(intervened, { type: 'Intervene', teamId: 't~2', on: false }), 't~2')).toBe(true);
    // 直轄の案件で管理者を名乗っても通らない
    expect(
      reduce(teamed(), { ...assign, by: 'manager' }).state.projects[P]?.tasks[assign.taskId]?.assignment,
    ).toBeNull();
  });

  it('人間 PM はそのチームの社員だけで、PM は Task の作業をせず、仕事を抱えている人は PM にも移動もできない', () => {
    const s = teamed();
    expect(reduce(s, { type: 'SetManager', teamId: 't~2', manager: { kind: 'human', staffId: 'sato' } }).state).toBe(s);
    const pm = managed({ kind: 'human', staffId: PM });
    const run = step(pm, DAY).state;
    expect(Object.values(run.projects[P]?.tasks ?? {}).some((t) => t.assignment?.workerId === PM)).toBe(false);
    expect(Object.values(run.humanQueues[PM] ?? [])).toHaveLength(0);
    const busy = W.find((id) => (run.humanQueues[id]?.length ?? 0) > 0) ?? '';
    expect(busy).not.toBe('');
    expect(reduce(run, { type: 'MoveMember', workerId: busy, teamId: DIRECT }).state).toBe(run);
  });

  it('管理者を置けるのは「小規模」から', () => {
    const s = createInitialState('lock', { tier: 'startup' });
    expect(reduce(s, { type: 'CreateTeam' }).state).toBe(s);
  });
});

describe('管理者の判断（core/manager.ts）', () => {
  it('同じ state からは必ず同じ判断になり、state の乱数を引かない', () => {
    for (const manager of [{ kind: 'human', staffId: PM }, { kind: 'ai' }] satisfies ManagerRun[]) {
      const s = managed(manager);
      const a = managerCommands(s, 't~2');
      expect(a.length).toBe(getProject(P).tasks.length);
      expect(managerCommands(s, 't~2')).toEqual(a);
      expect(managerCommands(structuredClone(s), 't~2')).toEqual(a);
      expect(a.every((c) => c.type === 'AssignTask' && c.by === 'manager')).toBe(true);
      const first = step(s, balance.time.tickMinutes).state;
      const again = step(s, balance.time.tickMinutes).state;
      expect(first).toEqual(again);
    }
  });

  it('判断は Command を reduce に通して state を変え、Command を外から与えたときと同じ state になる', () => {
    // 人間 PM は勤務時間だけ判断する。システムは時計を進めてから適用されるので、始業の1ステップ後の state で確かめる
    const s: GameState = { ...managed({ kind: 'human', staffId: PM }), clock: balance.time.tickMinutes };
    const { ctx: c } = ctx();
    const bySystem = managerSystem(s, c);
    let byHand = s;
    for (const _ of getProject(P).tasks) {
      const [command] = managerCommands(byHand, 't~2', 1);
      if (!command) break;
      byHand = reduce(byHand, command).state;
    }
    expect(bySystem).toEqual(byHand);
    expect(Object.values(bySystem.projects[P]?.tasks ?? {}).every((t) => t.assignment !== null)).toBe(true);
    // 担当以外の state（時計・乱数・社員・費用）は変えない
    const { projects: _a, ...restSystem } = bySystem;
    const { projects: _b, ...restBefore } = s;
    expect(restSystem).toEqual(restBefore);
  });

  it('委任していないチーム・直轄チームでは何も判断しない', () => {
    expect(managerCommands(teamed(), 't~2')).toEqual([]);
    expect(managerCommands(teamed(), DIRECT)).toEqual([]);
    const intervened = must(managed({ kind: 'ai' }), { type: 'Intervene', teamId: 't~2', on: true });
    expect(managerCommands(intervened, 't~2')).toEqual([]);
  });

  it('人間 PM は品質要求の高い Task に人間の確認のあるモードを選び、AI PM は省きがち', () => {
    const human = managerCommands(managed({ kind: 'human', staffId: PM }), 't~2');
    const ai = managerCommands(managed({ kind: 'ai' }), 't~2');
    const reviewed = (cs: Command[]) =>
      cs.filter((c) => c.type === 'AssignTask' && ['human', 'aiThenHumanReview', 'humanThenAi'].includes(c.mode))
        .length;
    expect(reviewed(human)).toBeGreaterThanOrEqual(reviewed(ai));
  });
});

describe('管理者の費用', () => {
  it('人間 PM の稼働は人日に数え、AI PM は人日を使わず AI 費用と運用者の Seat の使用量を使う', () => {
    const human = playManaged(P, 'human', 'cost');
    const ai = playManaged(P, 'ai', 'cost');
    const h = human.projects[P]?.management;
    const a = ai.projects[P]?.management;
    expect(h?.minutes ?? 0).toBeGreaterThan(0);
    expect(h?.laborCost ?? 0).toBeGreaterThan(0);
    expect(h?.aiCost).toBe(0);
    expect(a?.minutes).toBe(0);
    expect(a?.aiCost ?? 0).toBeGreaterThan(0);
    const hs = scoreProject(human, P);
    expect(hs?.managementCost).toBeCloseTo((h?.laborCost ?? 0) + (h?.aiCost ?? 0));
    const tasksMinutes = Object.values(human.projects[P]?.tasks ?? {}).reduce((sum, t) => sum + t.humanMinutes, 0);
    expect(hs?.humanMinutes).toBeCloseTo(tasksMinutes + (hs?.aftercareMinutes ?? 0) + (h?.minutes ?? 0));
  });

  it('AI PM の見落としは、AI PM に委任した案件の品質要求の高い Task だけにかかる', () => {
    const tasks = getProject(P).tasks;
    const high = { ...tasks[0], qualityReq: 1 } as (typeof tasks)[number];
    const low = { ...high, qualityReq: balance.manager.ai.qualityPivot };
    const ai = managed({ kind: 'ai' });
    expect(oversight(ai, P, high).miss).toBeGreaterThan(0);
    expect(oversight(ai, P, high).risk).toBeGreaterThan(0);
    expect(oversight(ai, P, low)).toEqual({ miss: 0, risk: 0 });
    expect(oversight(managed({ kind: 'human', staffId: PM }), P, high)).toEqual({ miss: 0, risk: 0 });
    expect(oversight(must(ai, { type: 'Intervene', teamId: 't~2', on: true }), P, high)).toEqual({ miss: 0, risk: 0 });
  });
});
