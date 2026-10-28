import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getHarnessPart, getTask } from '../../src/content/index';
import type { Command } from '../../src/core/commands';
import { reduce } from '../../src/core/commands';
import { getSession } from '../../src/core/context';
import { evalLoop, reviewCatch } from '../../src/core/formulas';
import {
  bareness,
  combineModifiers,
  equippedParts,
  harnessModel,
  harnessModifiers,
  harnessOf,
  harnessSuccess,
  NEUTRAL,
  reviewBlind,
} from '../../src/core/harness';
import { scoreProject } from '../../src/core/scoring';
import { createInitialState, type GameState, updateTask } from '../../src/core/state';
import { step } from '../../src/core/step';
import { runHeadless } from '../helpers/headless';

const AGENT = 'agent';
const P = 'corporateSite';
const code = getTask(P, 'frontend');
const planning = getTask(P, 'hearing');

function withParts(parts: readonly string[], seed = 'h'): GameState {
  let s = reduce(createInitialState(seed), { type: 'StartProject', projectId: P }).state;
  for (const partId of parts) s = reduce(s, { type: 'EquipPart', workerId: AGENT, partId }).state;
  return s;
}

describe('補正の合算のルール（balance.harness.combine）', () => {
  it('部品がなければ補正なし', () => {
    expect(combineModifiers([])).toEqual(NEUTRAL);
    expect(harnessModifiers(withParts([]), AGENT, code)).toBe(NEUTRAL);
  });

  it('add は足し、上限で頭打ちになる', () => {
    expect(combineModifiers([{ mods: { success: 0.1 } }, { mods: { success: 0.05 } }]).success).toBeCloseTo(0.15);
    const max = balance.harness.combine.success.max;
    expect(combineModifiers([{ mods: { success: 0.3 } }, { mods: { success: 0.3 } }]).success).toBe(max);
    expect(combineModifiers([{ mods: { risk: -0.1 } }]).risk).toBe(balance.harness.combine.risk.min);
  });

  it('mul は掛け、下限で止まる', () => {
    expect(combineModifiers([{ mods: { humanTime: 0.6 } }, { mods: { humanTime: 0.5 } }]).humanTime).toBeCloseTo(0.3);
    const min = balance.harness.combine.humanTime.min;
    expect(combineModifiers([{ mods: { humanTime: 0.4 } }, { mods: { humanTime: 0.4 } }]).humanTime).toBe(min);
  });

  it('any は独立な確率として「どれかが起きる」確率にし、上限付き', () => {
    expect(combineModifiers([{ mods: { evalCatch: 0.5 } }, { mods: { evalCatch: 0.5 } }]).evalCatch).toBeCloseTo(0.75);
    const many = Array.from({ length: 10 }, () => ({ mods: { evalCatch: 0.6 } }));
    expect(combineModifiers(many).evalCatch).toBe(balance.harness.combine.evalCatch.max);
  });

  it('weight（守られる確率）で薄め、times（組の数）だけ重ねる', () => {
    expect(combineModifiers([{ mods: { success: 0.1 }, weight: 0.5 }]).success).toBeCloseTo(0.05);
    expect(combineModifiers([{ mods: { speed: 1.2 }, weight: 0.5 }]).speed).toBeCloseTo(1.1);
    expect(combineModifiers([{ mods: { aiCost: 1.1 }, times: 3 }]).aiCost).toBeCloseTo(1.1 ** 3);
    expect(combineModifiers([{ mods: { success: -0.02 }, times: 0 }]).success).toBe(0);
  });

  it('modifiers は効く種類の Task だけに、burden はどの Task にも効く', () => {
    const s = withParts(['mcpGit']);
    expect(harnessModifiers(s, AGENT, code).success).toBeCloseTo(0.03);
    expect(harnessModifiers(s, AGENT, planning).success).toBe(0);
    expect(harnessModifiers(s, AGENT, planning).risk).toBeGreaterThan(0);
  });

  it('同じカテゴリの調整コストは組の数 n(n−1)/2 で増える（Subagent 数の2乗）', () => {
    const subs = ['subResearch', 'subCode', 'subQa', 'subReview'];
    const pair = balance.harness.pairs.subagent.success;
    const per = getHarnessPart('subCode').modifiers.success ?? 0;
    for (let n = 1; n <= subs.length; n++) {
      const m = harnessModifiers(withParts(subs.slice(0, n)), AGENT, code);
      expect(m.success).toBeCloseTo(n * per + ((n * (n - 1)) / 2) * pair);
    }
  });

  it('お願いは見込みでは守られる確率で薄め、守られなかった作業では効かない（指示文の負担は残る）', () => {
    const s = withParts(['requestLinter']);
    const full = getHarnessPart('requestLinter').modifiers.success ?? 0;
    expect(harnessModifiers(s, AGENT, code).success).toBeCloseTo(full - 0);
    expect(harnessModifiers(s, AGENT, code, { expected: true }).success).toBeCloseTo(
      full * balance.harness.requestCompliance,
    );
    const skipped = harnessModifiers(s, AGENT, code, { skipped: ['requestLinter'] });
    expect(skipped.success).toBe(0);
    expect(skipped.noise).toBeGreaterThan(0);
  });

  it('実効の Model は速度・費用の補正とランニングコストを入れる', () => {
    const s = withParts(['permAcceptEdits', 'mcpFilesystem']);
    const mods = harnessModifiers(s, AGENT, code);
    const model = harnessModel(s, AGENT, mods);
    expect(model.speed).toBeCloseTo(24 * mods.speed);
    expect(model.costPerMinute).toBeCloseTo(40 * mods.aiCost + getHarnessPart('mcpFilesystem').runningCost);
  });
});

describe('部品の付け外し（Command）', () => {
  it('同じルールの「お願い」と「Hook」は付け替えになる', () => {
    let s = withParts(['requestUnitTest']);
    s = reduce(s, { type: 'EquipPart', workerId: AGENT, partId: 'hookUnitTest' }).state;
    expect(harnessOf(s, AGENT).parts).toEqual(['hookUnitTest']);
  });

  it('導入コストは一度だけ払い、外して付け直しても払わない（会社の資産）', () => {
    let s = withParts(['skillFrontend']);
    s = reduce(s, { type: 'RemovePart', workerId: AGENT, partId: 'skillFrontend' }).state;
    s = reduce(s, { type: 'EquipPart', workerId: AGENT, partId: 'skillFrontend' }).state;
    expect(s.harnessLedger).toEqual([
      { partId: 'skillFrontend', cost: getHarnessPart('skillFrontend').installCost, at: 0 },
    ]);
    expect(scoreProject(s, P)?.harnessCost).toBe(getHarnessPart('skillFrontend').installCost);
  });

  it('解放されていない部品は付けられない', () => {
    const s = reduce(createInitialState('t', { tutorial: true }), {
      type: 'EquipPart',
      workerId: AGENT,
      partId: 'skillFrontend',
    });
    expect(s.events).toEqual([]);
    expect(harnessOf(s.state, AGENT).parts).toEqual([]);
  });

  it('Context Router を付けると資料の渡し方が router になり、外すと「必要な資料だけ」に戻る', () => {
    let s = withParts(['contextRouter']);
    expect(getSession(s, AGENT).feed).toEqual({ mode: 'router' });
    expect(equippedParts(s, AGENT).map((p) => p.id)).toEqual(['contextRouter']);
    s = reduce(s, { type: 'RemovePart', workerId: AGENT, partId: 'contextRouter' }).state;
    expect(getSession(s, AGENT).feed).toEqual({ mode: 'needed' });
  });

  it('変更すると HarnessChanged を出し、人間時間の見込みが減る量を添える', () => {
    let s = reduce(createInitialState('ev'), { type: 'StartProject', projectId: P }).state;
    const r = reduce(s, { type: 'EquipPart', workerId: AGENT, partId: 'skillFrontend' });
    expect(r.events[0]).toMatchObject({ type: 'HarnessChanged', change: 'equip', id: 'skillFrontend' });
    expect((r.events[0] as { savedHumanHours: number }).savedHumanHours).toBeGreaterThan(0);
    s = r.state;
    expect(reduce(s, { type: 'SetModel', workerId: AGENT, modelId: 'frontier' }).events[0]).toMatchObject({
      change: 'model',
      id: 'frontier',
    });
  });

  it('AssignWorkflow は複数の Task をまとめて Agent Workflow にし、1件だけや始まった Task は受け付けない', () => {
    const s = reduce(createInitialState('wf'), { type: 'StartProject', projectId: P }).state;
    const ok = reduce(s, {
      type: 'AssignWorkflow',
      projectId: P,
      taskIds: ['frontend', 'a11y', 'release'],
      workerId: AGENT,
    });
    expect(ok.events).toEqual([{ type: 'WorkflowAssigned', projectId: P, taskIds: ['frontend', 'a11y', 'release'] }]);
    for (const id of ['frontend', 'a11y', 'release']) {
      expect(ok.state.projects[P]?.tasks[id]?.assignment).toEqual({ mode: 'agentWorkflow', workerId: AGENT });
    }
    expect(reduce(s, { type: 'AssignWorkflow', projectId: P, taskIds: ['frontend'], workerId: AGENT }).events).toEqual(
      [],
    );
  });
});

describe('Harness がシミュレーションに与える影響', () => {
  const assign = (mode: 'aiThenHumanReview' | 'ai'): Command => ({
    type: 'AssignTask',
    projectId: P,
    taskId: 'hearing',
    mode,
    workerId: AGENT,
  });

  it('Eval の部品があると、AI の作業の直後に検証（eval）に入り、失敗は AI が修復する（Generate → Eval → Repair）', () => {
    let s = reduce(withParts(['evalAcceptance'], 'eval-loop'), assign('ai')).state;
    const phases = new Set<string>();
    let caught = false;
    for (let i = 0; i < 400 && s.projects[P]?.tasks.hearing?.status !== 'done'; i++) {
      const run = s.projects[P]?.tasks.hearing;
      // AI の作業を終えて検証に入った直後に、失敗を仕込む
      if (run?.phase === 'eval' && run.evalLoops === 0 && !run.defect && !caught) {
        s = updateTask(s, P, 'hearing', (r) => ({ ...r, defect: true }));
      }
      const r = step(s, 1);
      s = r.state;
      if (r.events.some((e) => e.type === 'EvalCaught')) caught = true;
      const phase = s.projects[P]?.tasks.hearing?.phase;
      if (phase) phases.add(phase);
    }
    expect(phases).toContain('eval');
    expect(s.projects[P]?.tasks.hearing?.status).toBe('done');
    // 検証の発見は確率なので、見つけた場合は修復の工程を通る
    if (caught) expect(phases).toContain('evalRepair');
  });

  it('Eval のループの見込み：検証で見つかる確率が高いほど残る失敗が減り、上限で打ち切る', () => {
    expect(evalLoop(0.6, 0).defect).toBeCloseTo(0.4);
    expect(evalLoop(0.6, 0.5).defect).toBeLessThan(0.4);
    expect(evalLoop(0.6, 0.9).defect).toBeLessThan(evalLoop(0.6, 0.5).defect);
    expect(evalLoop(0.6, 0.5).repairs).toBeLessThanOrEqual(balance.harness.maxRepairLoops);
  });

  it('事故の確率があれば事故が起き、作業は失敗扱いで損害がスコアに入る', () => {
    let accidents = 0;
    let cost = 0;
    for (let i = 0; i < 20; i++) {
      const seed = `acc-${i}`;
      const initial = reduce(
        withParts(['permAuto', 'mcpDatabase', 'mcpChat'], seed),
        assign('aiThenHumanReview'),
      ).state;
      const { state } = runHeadless({ seed, initial, until: 600 });
      accidents += state.projects[P]?.tasks.hearing?.accidents ?? 0;
      cost += scoreProject(state, P)?.accidentCost ?? 0;
    }
    expect(accidents).toBeGreaterThan(0);
    expect(cost).toBe(accidents * balance.harness.accidentCost);
  });

  it('Skill は人間の介入（指示出しと確認）を軽くし、AI が関わる Task の介入の回数を数える', () => {
    const play = (parts: string[]) => {
      const initial = reduce(withParts(parts, 'skill'), assign('aiThenHumanReview')).state;
      return runHeadless({ seed: 'skill', initial, until: 600 }).state.projects[P]?.tasks.hearing;
    };
    const plain = play([]);
    const skilled = play(['skillReport']);
    expect(plain?.interventions).toBeGreaterThanOrEqual(2);
    expect(skilled?.humanMinutes ?? 0).toBeLessThan(plain?.humanMinutes ?? 0);
  });
});

describe('素の AI の弱さ（balance.harness.bare）', () => {
  const { successLoss, reviewBlind: blindMax } = balance.harness.bare;
  const review = { actor: 'human', phase: 'review', effortShare: 0.25 } as const;

  it('部品がなければ成功確率の successLoss の割合を失い、レビューは reviewBlind の割合だけ見逃す', () => {
    expect(bareness(NEUTRAL)).toBe(1);
    expect(harnessSuccess(0.8, NEUTRAL)).toBeCloseTo(0.8 * (1 - successLoss));
    expect(reviewBlind(NEUTRAL)).toBeCloseTo(blindMax);
    expect(reviewCatch(code, review, reviewBlind(NEUTRAL))).toBeCloseTo(1 - blindMax);
  });

  it('guard は足し合わせて 1 で頭打ちになり、1 に届けば素の AI の弱さは消える', () => {
    const half = combineModifiers([{ mods: { guard: 0.5 } }]);
    expect(harnessSuccess(0.8, half)).toBeCloseTo(0.8 * (1 - successLoss / 2));
    expect(reviewBlind(half)).toBeCloseTo(blindMax / 2);
    const full = combineModifiers([{ mods: { guard: 0.6 } }, { mods: { guard: 0.6 } }]);
    expect(full.guard).toBe(1);
    expect(harnessSuccess(0.8, full)).toBe(0.8);
    expect(reviewCatch(code, review, reviewBlind(full))).toBe(1);
  });

  it('型にはめる部品（Skill・Hook・Eval）だけが guard を持ち、MCP・権限モード・Subagent は持たない', () => {
    for (const id of ['skillFrontend', 'hookUnitTest', 'requestUnitTest', 'evalUnitTest']) {
      expect(getHarnessPart(id).modifiers.guard ?? 0, id).toBeGreaterThan(0);
    }
    for (const id of ['mcpFilesystem', 'permAcceptEdits', 'subCode', 'contextRouter']) {
      expect(getHarnessPart(id).modifiers.guard ?? 0, id).toBe(0);
    }
  });

  it('Task に効く部品の guard だけが届く（企画の Task にコード用の Skill は効かない）', () => {
    const s = withParts(['skillFrontend']);
    expect(harnessModifiers(s, AGENT, code).guard).toBeGreaterThan(0);
    expect(harnessModifiers(s, AGENT, planning).guard).toBe(0);
  });
});
