import { type Accessor, createSignal, onCleanup } from 'solid-js';
import type { GameStore } from '../../../app/store';
import type { AssignModeId } from '../../../content/types';
import { type Command, reduce } from '../../../core/commands';
import { createInitialState, type GameState } from '../../../core/state';
import { step } from '../../../core/step';

/** デモで実時間1秒に進めるゲーム内の分（本編は1日ずつ進めるので、デモだけの速さ） */
const DEMO_MINUTES_PER_SECOND = 24;

/**
 * 比較ページのデモ再生。ECサイト案件を、決まった配置の Command で自動進行させる（core の reduce / step をそのまま使う）。
 * 2つの幕を繰り返す：
 * - before：全部人間が担当する。実装（人間で8時間）のリードタイムが積み上がり、ボトルネックが強くなる
 * - after：AI に任せて人間はレビューする。仕事が速く流れ、ボトルネックは弱いまま次の工程へ移っていく
 */

export const DEMO_PROJECT = 'ecRenewal';
const SEED = 'd2-demo';

type Plan = Readonly<Record<string, readonly [AssignModeId, string]>>;

export const demoScenes = {
  before: {
    hearing: ['human', 'sato'],
    requirements: ['human', 'suzuki'],
    uiDesign: ['human', 'sato'],
    research: ['human', 'suzuki'],
    implementation: ['human', 'sato'],
    qa: ['human', 'suzuki'],
    release: ['human', 'sato'],
  },
  after: {
    hearing: ['human', 'sato'],
    requirements: ['aiThenHumanReview', 'agent'],
    uiDesign: ['aiThenHumanReview', 'agent'],
    research: ['ai', 'agent'],
    implementation: ['aiThenHumanReview', 'agent'],
    qa: ['aiThenHumanReview', 'agent'],
    release: ['human', 'suzuki'],
  },
} as const satisfies Record<string, Plan>;

export type DemoSceneId = keyof typeof demoScenes;
export const demoSceneOrder: readonly DemoSceneId[] = ['before', 'after'];

/** デモの再生速度（1倍速のゲームの速さ＝実時間1秒でゲーム内 minutesPerRealSecond 分、に対する倍率） */
export const demoSpeeds = [1, 4, 8, 16] as const;
export type DemoSpeed = (typeof demoSpeeds)[number];
/** 案件が終わってから次の幕へ移るまでの実時間（秒） */
const HOLD_SECONDS = 4;
/** 1フレームで進める実時間の上限（秒） */
const MAX_FRAME_SECONDS = 0.25;

export function demoCommands(scene: DemoSceneId): Command[] {
  return [
    { type: 'StartProject', projectId: DEMO_PROJECT },
    ...Object.entries(demoScenes[scene]).map(
      ([taskId, [mode, workerId]]): Command => ({
        type: 'AssignTask',
        projectId: DEMO_PROJECT,
        taskId,
        mode,
        workerId,
      }),
    ),
  ];
}

/** 幕の開始時の state（案件を始めて、全 Task の担当を決めたところ） */
export function demoInitialState(scene: DemoSceneId): GameState {
  return demoCommands(scene).reduce((s, c) => reduce(s, c).state, createInitialState(SEED));
}

export function isDemoDone(state: GameState): boolean {
  const completed = state.projects[DEMO_PROJECT]?.completedAt;
  return completed !== null && completed !== undefined;
}

export interface DemoPlayer {
  readonly store: GameStore;
  readonly scene: Accessor<DemoSceneId>;
  readonly playing: Accessor<boolean>;
  readonly speed: Accessor<DemoSpeed>;
  /** 案件が終わって次の幕を待っているか */
  readonly holding: Accessor<boolean>;
  play(): void;
  pause(): void;
  setSpeed(speed: DemoSpeed): void;
  restart(): void;
}

/**
 * デモの再生器。requestAnimationFrame で実時間を進め、案件が終わったら少し待って次の幕へ移る。
 * 停止中は state.paused を true にし、ワールドの待機の動きと描画ループも止まるようにする。
 */
export function createDemoPlayer(): DemoPlayer {
  const [scene, setScene] = createSignal<DemoSceneId>('before');
  const [state, setState] = createSignal<GameState>(demoInitialState('before'));
  const [playing, setPlaying] = createSignal(true);
  const [speed, setSpeed] = createSignal<DemoSpeed>(8);
  const [holding, setHolding] = createSignal(false);
  let held = 0;
  let last: number | undefined;
  let frame = 0;

  const store: GameStore = {
    state,
    dispatch: (command) => setState(reduce(state(), command).state),
    advance: (minutes) => setState(step(state(), minutes).state),
    run: () => null,
    play: () => {},
    stop: () => {},
    onEvents: () => () => {},
  };

  const enter = (next: DemoSceneId) => {
    setScene(next);
    setState(demoInitialState(next));
    setHolding(false);
    held = 0;
  };

  const tick = (now: number) => {
    frame = 0;
    const dt = last === undefined ? 0 : Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    if (!playing()) return;
    if (isDemoDone(state())) {
      setHolding(true);
      held += dt;
      if (held >= HOLD_SECONDS) {
        const i = demoSceneOrder.indexOf(scene());
        enter(demoSceneOrder[(i + 1) % demoSceneOrder.length] ?? 'before');
      }
    } else {
      store.advance(dt * DEMO_MINUTES_PER_SECOND * speed());
    }
    frame = requestAnimationFrame(tick);
  };
  const resume = () => {
    if (frame !== 0) return;
    last = undefined;
    frame = requestAnimationFrame(tick);
  };
  resume();
  onCleanup(() => cancelAnimationFrame(frame));

  return {
    store,
    scene,
    playing,
    speed,
    holding,
    play() {
      setPlaying(true);
      resume();
    },
    pause() {
      setPlaying(false);
    },
    setSpeed,
    restart() {
      enter('before');
      resume();
    },
  };
}
