import { describe, expect, it } from 'vitest';
import { getAssignMode } from '../../src/content/assignModes';
import { glossary } from '../../src/content/glossary';
import { getModel, getTask } from '../../src/content/index';
import { tutorialScript } from '../../src/content/tutorial';
import type { FeatureId } from '../../src/content/types';
import { allFeatures, menuSpotOf, tutorialFeatures, unlockDefs } from '../../src/content/unlocks';
import { type Command, reduce } from '../../src/core/commands';
import { holds } from '../../src/core/conditions';
import type { GameEvent } from '../../src/core/events';
import { autoTestCatch, expectedHumanMinutes, repairMinutes } from '../../src/core/formulas';
import { deserialize, OutdatedSaveError, SAVE_VERSION, serialize } from '../../src/core/serialize';
import { createInitialState, type GameState, updateTask } from '../../src/core/state';
import { step } from '../../src/core/step';
import { currentTutorialStep } from '../../src/core/tutorial';
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
    // 人間のレビューを何度も繰り返した会社が、案件を納品した
    const ledger = { ...s.ledger, modeCompleted: { aiThenHumanReview: 6 } };
    s = applyUnlocks({ ...s, ledger, projects: { ...s.projects, [P]: { ...project, completedAt: 1 } } }, (e) =>
      events.push(e),
    );
    expect(isUnlocked(s, 'harness')).toBe(true);
    // Harness Builder の解放を条件にする「お願い」と「Hook」も、同じ回に解放する
    expect(isUnlocked(s, 'harness:hook')).toBe(true);
    expect(events).toContainEqual({ type: 'FeatureUnlocked', feature: 'harness:hook' });
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
    expect(SAVE_VERSION).toBe(18);
    const s = reduce(createInitialState('v', { board: true }), { type: 'SkipTutorial' }).state;
    const loaded = deserialize(serialize(s));
    expect(loaded.unlocked).toEqual(s.unlocked);
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

describe('段階的な解放（Phase 29。企画書50章「必要になる前に説明しない」）', () => {
  /** チュートリアルの案件を納品した会社（案件ボードあり） */
  const afterTutorial = (): GameState => {
    const s = reduce(createInitialState('ladder', { board: true }), {
      type: 'StartProject',
      projectId: 'tutorialLp',
    }).state;
    const run = s.projects.tutorialLp;
    if (!run) throw new Error('チュートリアルの案件が始まっていない');
    const projects = { ...s.projects, tutorialLp: { ...run, completedAt: s.clock } };
    return reduce({ ...s, projects }, { type: 'TogglePause' }).state;
  };
  const DAY = 1440;

  it('チュートリアルの直後は、Workflow・Harness・Context・採用・上級の任せ方をまだ渡さない', () => {
    const s = afterTutorial();
    expect(s.tutorial).toBeNull();
    for (const f of [
      'mode:agentWorkflow',
      'mode:humanThenAi',
      'harness',
      'harness:hook',
      'context',
      'hire',
      'team',
    ] as const) {
      expect(isUnlocked(s, f), f).toBe(false);
    }
    expect(isUnlocked(s, 'problems')).toBe(true);
  });

  it('条件を満たした解放が重なっても1営業日に1つずつ渡し、解放を条件にする連鎖は同じ日にまとめる', () => {
    const s = afterTutorial();
    // 経験を十分に積んだ（納品・レビュー・AI のミスの数がそろった）会社
    const ledger = { ...s.ledger, delivered: 5, defectsEscaped: 5, modeCompleted: { aiThenHumanReview: 10 } };
    let state: GameState = { ...s, ledger };
    // 同じ営業日のうちは、チュートリアルの納品で渡した分のほかに増えない
    expect(applyUnlocks(state, () => {}).unlocked).toEqual(s.unlocked);
    const perDay: FeatureId[][] = [];
    for (let day = 1; day <= 8; day++) {
      const events: GameEvent[] = [];
      state = applyUnlocks({ ...state, clock: s.clock + day * DAY }, (e) => events.push(e));
      perDay.push(events.flatMap((e) => (e.type === 'FeatureUnlocked' ? [e.feature] : [])));
    }
    // 毎日1つの解放（連鎖は同じ日）。Harness Builder と「お願い」と「Hook」は同じ日に届く
    for (const day of perDay.filter((d) => d.length > 0)) {
      const roots = day.filter((f) => unlockDefs.find((u) => u.feature === f)?.when.type !== 'unlocked');
      expect(roots, day.join(',')).toHaveLength(1);
    }
    expect(perDay.find((d) => d.includes('harness'))).toContain('harness:hook');
    // Harness の部品を導入すると、次の営業日に Agent Workflow
    expect(isUnlocked(state, 'mode:agentWorkflow')).toBe(false);
    state = { ...state, ownedParts: ['skillFrontend'] };
    state = applyUnlocks({ ...state, clock: s.clock + 20 * DAY }, () => {});
    expect(isUnlocked(state, 'mode:agentWorkflow')).toBe(true);
  });

  it('どの遊び方でも、昇格すれば Harness・MCP・権限モード・Subagent・Mod・Routine まで届く（体験の条件に昇格の条件を添えてある）', () => {
    // レビューも Workflow も使わず、部品も入れていないが、小規模企業まで育った会社
    let state: GameState = { ...afterTutorial(), tier: 'small', ledger: { ...afterTutorial().ledger, delivered: 10 } };
    for (let day = 1; day <= 30; day++) state = applyUnlocks({ ...state, clock: day * DAY }, () => {});
    for (const f of [
      'harness',
      'harness:hook',
      'harness:eval',
      'harness:subagent',
      'harness:tool',
      'harness:permission',
      'harness:mod',
      'harness:routine',
      'context',
      'hire',
      'team',
      'mode:humanThenAi',
    ] as const) {
      expect(isUnlocked(state, f), f).toBe(true);
    }
  });
});

describe('解放のカードの「開く」の行き先（content/unlocks.ts の menuSpotOf）', () => {
  it('メニューの入口がある機能はその入口へ、ない機能（担当モード・ドックの項目）は行き先なし', () => {
    expect(menuSpotOf('harness:hook')).toBe('harness');
    expect(menuSpotOf('mode:agentWorkflow')).toBe('library');
    expect(menuSpotOf('hire')).toBe('team');
    expect(menuSpotOf('context:pick')).toBe('context');
    expect(menuSpotOf('mode:aiThenHumanReview')).toBeUndefined();
    expect(menuSpotOf('dock:speed')).toBeUndefined();
  });
});

describe('チュートリアルを飛ばした会社の解放', () => {
  /** 台本どおりにチュートリアルを遊び切った会社（各ステップで許された担当のうち、人間以外を選ぶ） */
  const playTutorial = (): GameState => {
    let s = reduce(createInitialState(tutorialScript.seed, { board: true }), {
      type: 'StartProject',
      projectId: tutorialScript.projectId,
    }).state;
    for (let i = 0; i < 1000 && s.tutorial !== null; i++) {
      for (const a of currentTutorialStep(s)?.allow ?? []) {
        const mode = a.modes.find((m) => m !== 'human') ?? 'human';
        const workerId = mode === 'human' ? (Object.keys(s.team)[0] ?? '') : (s.agents[0] ?? '');
        s = reduce(s, {
          type: 'AssignTask',
          projectId: tutorialScript.projectId,
          taskId: a.taskId,
          mode,
          workerId,
        }).state;
      }
      if (s.paused) s = reduce(s, { type: 'TogglePause' }).state;
      s = step(s, 5).state;
    }
    return s;
  };

  it('チュートリアルを遊び切ったときに解放済みの機能が、tutorialFeatures とちょうど一致する', () => {
    const s = playTutorial();
    expect(s.tutorial).toBeNull();
    expect([...s.unlocked].sort()).toEqual([...tutorialFeatures].sort());
  });

  it('チュートリアルなしで始めた会社も同じところから始まり、Workflow・Harness・採用はまだ渡さない', () => {
    const s = createInitialState('quick', { board: true, tutorial: false, talent: true });
    expect([...s.unlocked].sort()).toEqual([...tutorialFeatures].sort());
    for (const f of ['mode:agentWorkflow', 'harness', 'hire', 'context'] as const)
      expect(isUnlocked(s, f), f).toBe(false);
    // 案件ボードのない単発のプレイ（テスト）だけが、すべて解放済みで始まる
    expect(createInitialState('single').unlocked).toEqual(allFeatures);
  });
});
