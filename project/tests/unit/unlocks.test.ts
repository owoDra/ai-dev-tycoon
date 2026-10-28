import { describe, expect, it } from 'vitest';
import { getAssignMode } from '../../src/content/assignModes';
import { glossary } from '../../src/content/glossary';
import { getModel, getTask } from '../../src/content/index';
import { allFeatures } from '../../src/content/unlocks';
import { type Command, reduce } from '../../src/core/commands';
import { holds } from '../../src/core/conditions';
import type { GameEvent } from '../../src/core/events';
import { autoTestCatch, expectedHumanMinutes, repairMinutes } from '../../src/core/formulas';
import { deserialize, OutdatedSaveError, SAVE_VERSION, serialize } from '../../src/core/serialize';
import { createInitialState, type GameState, updateTask } from '../../src/core/state';
import { step } from '../../src/core/step';
import { applyUnlocks, isRevealed, isUnlocked } from '../../src/core/unlocks';
import { AVERAGE_TEAM } from '../helpers/talent';

const P = 'ecRenewal';
const started = (s: GameState) => reduce(s, { type: 'StartProject', projectId: P }).state;
const done = (s: GameState, taskId: string, patch: object = {}) =>
  updateTask(s, P, taskId, (r) => ({ ...r, status: 'done', quality: 1, completedAt: 0, ...patch }));

describe('機能の解放（core/unlocks.ts）', () => {
  it('チュートリアルは「人間」「AI」だけ、それ以外のプレイはすべて解放・用語も明かした状態で始まる', () => {
    const tutorial = createInitialState('t', { tutorial: true });
    expect(tutorial.unlocked).toEqual(['mode:human', 'mode:ai']);
    expect(tutorial.revealed).toEqual([]);
    const free = createInitialState('f');
    expect(free.unlocked).toEqual(allFeatures);
    expect(free.tutorial).toBeNull();
    for (const g of glossary) expect(isRevealed(free, g.id)).toBe(true);
  });

  it('条件を満たすと1回だけ解放し FeatureUnlocked を出す。他の解放を条件にする機能も同じ回に連鎖して解放する', () => {
    let s = started(createInitialState('t', { tutorial: true }));
    s = { ...s, tutorial: null };
    const events: GameEvent[] = [];
    const project = s.projects[P];
    if (!project) throw new Error('案件が開始されていない');
    s = applyUnlocks({ ...s, projects: { ...s.projects, [P]: { ...project, completedAt: 1 } } }, (e) => events.push(e));
    expect(isUnlocked(s, 'mode:humanThenAi')).toBe(true);
    expect(isUnlocked(s, 'mode:agentWorkflow')).toBe(true);
    expect(events).toContainEqual({ type: 'FeatureUnlocked', feature: 'mode:agentWorkflow' });
    expect(events).toContainEqual({ type: 'TermRevealed', term: 'harnessEngineering' });
    const again: GameEvent[] = [];
    expect(applyUnlocks(s, (e) => again.push(e))).toBe(s);
    expect(again).toEqual([]);
  });

  it('AI のミスで品質が落ちた後に「AI → 人間レビュー」、レビューを使った後に自動テストを解放する', () => {
    let s = started(createInitialState('t', { tutorial: true }));
    s = { ...s, tutorial: null };
    const emit = () => {};
    s = applyUnlocks(done(s, 'hearing', { escaped: true, quality: 0.5 }), emit);
    expect(isUnlocked(s, 'mode:aiThenHumanReview')).toBe(true);
    expect(isUnlocked(s, 'mode:aiThenEval')).toBe(false);
    const review = { mode: 'aiThenHumanReview' as const, workerId: 'agent' };
    s = applyUnlocks(done(s, 'requirements', { assignment: review }), emit);
    expect(isUnlocked(s, 'mode:aiThenEval')).toBe(true);
    expect(isRevealed(s, 'humanInTheLoop')).toBe(true);
  });

  it('条件の判定（holds）', () => {
    const s = done(started(createInitialState('t')), 'hearing', { assignment: { mode: 'ai', workerId: 'agent' } });
    expect(holds(s, { type: 'tasksCompleted', count: 1 })).toBe(true);
    expect(holds(s, { type: 'tasksCompleted', count: 2 })).toBe(false);
    expect(holds(s, { type: 'modeCompleted', mode: 'ai', count: 1 })).toBe(true);
    expect(holds(s, { type: 'taskAssigned', projectId: P, taskId: 'hearing', mode: 'human' })).toBe(false);
    expect(holds(s, { type: 'taskCompleted', projectId: P, taskId: 'hearing' })).toBe(true);
    expect(holds(s, { type: 'projectCompleted', projectId: P })).toBe(false);
  });

  // v10 以前（キャンペーン）のセーブは案件ボードの会社に変換できないので読み込まず、タイトルでその旨を出す（Phase 20）
  it('解放の進み具合はセーブを通っても残り、v2 などキャンペーン以前の形式のセーブは読み込めない（OutdatedSaveError）', () => {
    const { unlocked: _u, revealed: _r, tutorial: _t, ...v2 } = createInitialState('v');
    expect(() => deserialize(JSON.stringify({ saveVersion: 2, state: v2 }))).toThrow(OutdatedSaveError);
    expect(SAVE_VERSION).toBe(15);
    const s = reduce(createInitialState('v', { board: true }), { type: 'SkipTutorial' }).state;
    const loaded = deserialize(serialize(s));
    expect(loaded.unlocked).toEqual(allFeatures);
    expect(loaded.tutorial).toBeNull();
  });
});

describe('AI → 自動テスト → 確認（簡易 Eval）', () => {
  const assignEval: Command = {
    type: 'AssignTask',
    projectId: P,
    taskId: 'hearing',
    mode: 'aiThenEval',
    workerId: 'agent',
  };

  /** 自動テストの直前に失敗を仕込み、Task が終わるまで進める */
  function runWithPlantedDefect(seed: string) {
    // 人間の時間を工程の作業量どおりに確かめるので、速度がちょうど平均の2人で進める
    let s = reduce(started(createInitialState(seed, { team: AVERAGE_TEAM })), assignEval).state;
    const events: GameEvent[] = [];
    for (let i = 0; i < 600 && s.projects[P]?.tasks.hearing?.status !== 'done'; i++) {
      const run = s.projects[P]?.tasks.hearing;
      if (run?.phase === 'review' && run.stepIndex === 2 && !run.defect && run.reworks === 0) {
        s = updateTask(s, P, 'hearing', (r) => ({ ...r, defect: true }));
      }
      const r = step(s, 1);
      s = r.state;
      events.push(...r.events);
    }
    return { run: s.projects[P]?.tasks.hearing, events };
  }

  // 自動テストの検出率は Task の種類で決まり 1 ではない（balance.assign.autoTestCatch）。
  // 見つけて1回の修復で直った seed を選び、そのときの流れを確かめる
  it('自動テストが AI の失敗を見つけると AI が修復し、人間の手戻りは発生しない', () => {
    const found = Array.from({ length: 80 }, (_, i) => runWithPlantedDefect(`eval-${i}`)).find(
      (x) => x.events.some((e) => e.type === 'EvalCaught') && x.run?.reworks === 1 && x.run.escaped === false,
    );
    expect(found).toBeDefined();
    const { run, events } = found ?? { run: undefined, events: [] };
    expect(events.some((e) => e.type === 'ReworkDetected')).toBe(false);
    expect(run?.escaped).toBe(false);
    expect(run?.quality).toBe(1);
    expect(run?.reworks).toBe(1);
    // 人間の時間は指示出しと最後の確認だけ（工程ごとに固定ステップ幅へ切り上がる分を許す）
    const task = getTask(P, 'hearing');
    const humanSteps = getAssignMode('aiThenEval').steps.filter((x) => x.actor === 'human');
    const planned = humanSteps.reduce((sum, x) => sum + task.effort * x.effortShare, 0);
    expect(run?.humanMinutes).toBeGreaterThanOrEqual(planned);
    expect(run?.humanMinutes).toBeLessThanOrEqual(planned + humanSteps.length);
    expect(run?.aiMinutes).toBeGreaterThan(repairMinutes(task, getModel('standard')) - 1);
  });

  it('自動テストは万能ではない：判断が中心の Task では失敗をすり抜けさせることがあり、最後の確認でも一部しか見つからない', () => {
    const runs = Array.from({ length: 40 }, (_, i) => runWithPlantedDefect(`miss-${i}`));
    expect(autoTestCatch(getTask(P, 'hearing'))).toBeLessThan(autoTestCatch(getTask(P, 'implementation')));
    expect(runs.some((x) => x.run?.escaped)).toBe(true);
    expect(runs.some((x) => x.events.some((e) => e.type === 'ReworkDetected'))).toBe(true);
    expect(runs.some((x) => x.events.some((e) => e.type === 'EvalCaught'))).toBe(true);
  });

  it('人間の拘束時間の見込みは「AI → 人間レビュー」より短い（レビュー時間の激減）', () => {
    const task = getTask(P, 'implementation');
    const model = getModel('standard');
    const review = expectedHumanMinutes(task, getAssignMode('aiThenHumanReview'), 1, model);
    const evalMode = expectedHumanMinutes(task, getAssignMode('aiThenEval'), 1, model);
    expect(evalMode).toBeLessThan(review / 3);
  });
});
