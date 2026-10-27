import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { tutorialScript } from '../../src/content/tutorial';
import type { AssignModeId } from '../../src/content/types';
import { modeFeature } from '../../src/content/unlocks';
import type { Command } from '../../src/core/commands';
import { scoreProject } from '../../src/core/scoring';
import { createInitialState, type GameState } from '../../src/core/state';
import { currentTutorialStep } from '../../src/core/tutorial';
import { projectedProfitPerPersonDay } from '../../src/view/hud';
import { runHeadless, type TimedCommand } from '../helpers/headless';

/**
 * 最初の3分（企画書50〜51章）を、想定どおりの操作列で再生して確かめる。
 * プレイヤーはステップが進むたびに吹き出しを読み、島とカードを押す。その時間を THINK_SECONDS として、
 * ゲームを1倍速のまま進めた（早送りしない）ときの実時間を数える。
 */
const P = tutorialScript.projectId;
const THINK_SECONDS = 5;
const LIMIT_SECONDS = 180;
const thinkMinutes = THINK_SECONDS * balance.time.minutesPerRealSecond;
const toRealSeconds = (minutes: number) => minutes / balance.time.minutesPerRealSecond;

const assign = (taskId: string, mode: AssignModeId): Command => ({
  type: 'AssignTask',
  projectId: P,
  taskId,
  mode,
  workerId: mode === 'human' ? 'sato' : 'agent',
});

/** 想定どおりの操作：そのステップになったら、この担当を決める */
const PLAN: readonly { readonly step: string; readonly command: Command }[] = [
  { step: 'choose', command: assign('wireframe', 'ai') },
  { step: 'next', command: assign('coding', 'ai') },
  { step: 'miss', command: assign('form', 'aiThenHumanReview') },
  { step: 'tryEval', command: assign('responsive', 'aiThenEval') },
];

function tutorialStart(): GameState {
  return createInitialState(tutorialScript.seed, { tutorial: true });
}

/** ステップの到達を見ながら操作の時刻を決め、TimedCommand の列にする */
function plannedCommands(): TimedCommand[] {
  const start: TimedCommand = { at: 0, command: { type: 'StartProject', projectId: P } };
  const commands: TimedCommand[] = [start];
  let state = runHeadless({ seed: tutorialScript.seed, initial: tutorialStart(), commands, until: 0 }).state;
  for (const { step, command } of PLAN) {
    while (currentTutorialStep(state)?.id !== step) {
      if (state.clock > LIMIT_SECONDS * balance.time.minutesPerRealSecond * 2) throw new Error(`${step} に届かない`);
      state = runHeadless({ seed: tutorialScript.seed, initial: state, until: state.clock + 1 }).state;
    }
    commands.push({ at: state.clock + thinkMinutes, command });
    state = runHeadless({ seed: tutorialScript.seed, initial: state, until: state.clock + thinkMinutes }).state;
    state = runHeadless({
      seed: tutorialScript.seed,
      initial: state,
      commands: [{ at: state.clock, command }],
      until: state.clock,
    }).state;
  }
  return commands;
}

/** 各ステップに着いたゲーム内時刻（分）。1分ずつ進めて TutorialStepChanged を拾う */
function stepTimeline(commands: readonly TimedCommand[]): { id: string; at: number }[] {
  const first = tutorialScript.steps[0]?.id ?? '';
  const timeline = [{ id: first, at: 0 }];
  const horizon = LIMIT_SECONDS * balance.time.minutesPerRealSecond * 2;
  let state = runHeadless({
    seed: tutorialScript.seed,
    initial: tutorialStart(),
    commands: commands.filter((c) => c.at <= 0),
    until: 0,
  }).state;
  while (state.tutorial && state.clock < horizon) {
    const from = state.clock;
    const r = runHeadless({
      seed: tutorialScript.seed,
      initial: state,
      commands: commands.filter((c) => c.at > from && c.at <= from + 1),
      until: from + 1,
    });
    for (const e of r.events) if (e.type === 'TutorialStepChanged') timeline.push({ id: e.stepId, at: r.state.clock });
    if (r.events.some((e) => e.type === 'TutorialEnded')) timeline.push({ id: '（終了）', at: r.state.clock });
    state = r.state;
  }
  return timeline;
}

function play() {
  const commands = plannedCommands();
  const horizon = LIMIT_SECONDS * balance.time.minutesPerRealSecond * 2;
  const full = runHeadless({ seed: tutorialScript.seed, initial: tutorialStart(), commands, until: horizon });
  const ended = full.events.findIndex((e) => e.type === 'TutorialEnded');
  const started = runHeadless({
    seed: tutorialScript.seed,
    initial: tutorialStart(),
    commands: [commands[0] as TimedCommand],
    until: 0,
  });
  const startScore = scoreProject(started.state, P);
  const endScore = scoreProject(full.state, P);
  if (!startScore || !endScore) throw new Error('案件が開始されていない');
  return {
    commands,
    full,
    ended,
    start: projectedProfitPerPersonDay(started.state, P, startScore),
    end: endScore,
  };
}

describe('チュートリアル「小さなLP制作」（企画書50〜51章）', () => {
  const r = play();
  const steps = r.full.events.filter((e) => e.type === 'TutorialStepChanged').map((e) => e.stepId);
  const completedAt = r.full.state.projects[P]?.completedAt ?? Number.POSITIVE_INFINITY;

  it('想定どおりの操作列で、各ステップの条件が台本の順に満たされ、最後にチュートリアルが終わる', () => {
    expect(steps).toEqual(tutorialScript.steps.slice(1).map((s) => s.id));
    expect(r.ended).toBeGreaterThanOrEqual(0);
    expect(r.full.state.tutorial).toBeNull();
    expect(r.full.state.projects[P]?.completedAt).not.toBeNull();
  });

  it('人間だけ → AI 導入 → AI のミス → レビュー → 自動テストを体験する（シナリオで確定）', () => {
    const tasks = r.full.state.projects[P]?.tasks;
    expect(tasks?.wireframe?.escaped).toBe(false);
    expect(tasks?.coding?.escaped).toBe(true);
    expect(tasks?.coding?.quality).toBeLessThan(1);
    expect(r.full.events.some((e) => e.type === 'ReworkDetected' && e.taskId === 'form')).toBe(true);
    expect(r.full.events.some((e) => e.type === 'EvalCaught' && e.taskId === 'responsive')).toBe(true);
    for (const f of [modeFeature('aiThenHumanReview'), modeFeature('aiThenEval')]) {
      expect(r.full.events).toContainEqual({ type: 'FeatureUnlocked', feature: f });
    }
  });

  it('最終的な Profit / Person-Day が、開始時（人間だけの見込み）の2倍以上になる', () => {
    console.info(
      `[tutorial] Profit/Person-Day 開始時（人間だけの見込み）: ${Math.round(r.start)} 円/人日 → 終了時: ${Math.round(r.end.profitPerPersonDay)} 円/人日（×${(r.end.profitPerPersonDay / r.start).toFixed(2)}）`,
    );
    expect(r.end.completed).toBe(true);
    expect(r.end.profitPerPersonDay).toBeGreaterThanOrEqual(r.start * 2);
  });

  it('所要時間：ゲーム内時間を1倍速の実時間に換算して3分以内（各ステップの読む時間を含む）', () => {
    const seconds = toRealSeconds(completedAt);
    console.info(
      `[tutorial] 所要時間: ゲーム内 ${completedAt} 分 = 1倍速の実時間 ${seconds.toFixed(1)} 秒（うち読む・押す時間 ${THINK_SECONDS}秒 × ${PLAN.length}回）`,
    );
    for (const c of r.commands.slice(1))
      console.info(`[tutorial]   ${toRealSeconds(c.at).toFixed(1)}秒: ${JSON.stringify(c.command)}`);
    const timeline = stepTimeline(r.commands);
    timeline.slice(0, -1).forEach((s, i) => {
      const sec = (minutes: number) => toRealSeconds(minutes).toFixed(1).padStart(5);
      const stay = (timeline[i + 1]?.at ?? s.at) - s.at;
      console.info(`[tutorial]   ステップ ${s.id.padEnd(10)} 到達 ${sec(s.at)}秒 / 滞在 ${sec(stay)}秒`);
    });
    expect(seconds).toBeLessThanOrEqual(LIMIT_SECONDS);
  });
});
