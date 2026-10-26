import { type Accessor, createSignal, onCleanup } from 'solid-js';
import type { GameStore } from '../../../app/store';
import type { IconName } from '../../../assets/icons';
import { balance } from '../../../content/balance';
import { getProject } from '../../../content/index';
import type { AssignModeId } from '../../../content/types';
import { type Command, reduce } from '../../../core/commands';
import { createInitialState, type GameState } from '../../../core/state';
import { step } from '../../../core/step';
import { MINUTES_PER_HOUR } from '../../../core/units';
import { ja } from '../../../i18n/ja';
import { taskRows } from '../../../view/project';
import { describeEntity, islandId, type WorldViewModel } from '../../../view/world';

/**
 * D3 の比較ページの遊び場（プロトタイプ用）。ECサイト案件を、最初の2つの Task だけ人間に割り当てた状態で始め、
 * 残りはプレイヤーが詳細から担当を決める。core の reduce / step をそのまま使う。
 * Phase 06 では本物の store・ループ・view/advice.ts に置き換える。
 */

export const SANDBOX_PROJECT = 'ecRenewal';
const SEED = 'd3-sandbox';
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

const opening: Readonly<Record<string, readonly [AssignModeId, string]>> = {
  hearing: ['human', 'sato'],
  requirements: ['human', 'suzuki'],
};

export function sandboxInitialState(): GameState {
  const commands: Command[] = [
    { type: 'StartProject', projectId: SANDBOX_PROJECT },
    ...Object.entries(opening).map(
      ([taskId, [mode, workerId]]): Command => ({
        type: 'AssignTask',
        projectId: SANDBOX_PROJECT,
        taskId,
        mode,
        workerId,
      }),
    ),
  ];
  return commands.reduce((s, c) => reduce(s, c).state, createInitialState(SEED));
}

/** 比較のために時間を早回しする倍率（ゲーム内の速度に掛ける） */
export const sandboxBoosts = [1, 8] as const;
export type SandboxBoost = (typeof sandboxBoosts)[number];
const MAX_FRAME_SECONDS = 0.25;

export interface Sandbox {
  readonly store: GameStore;
  readonly boost: Accessor<SandboxBoost>;
  setBoost(boost: SandboxBoost): void;
  reset(): void;
}

/** requestAnimationFrame で時間を進める。一時停止は state.paused（HUD の操作）に従う */
export function createSandbox(): Sandbox {
  const [state, setState] = createSignal<GameState>(sandboxInitialState());
  const [boost, setBoost] = createSignal<SandboxBoost>(8);
  let last: number | undefined;
  let frame = 0;

  const store: GameStore = {
    state,
    dispatch: (command) => setState(reduce(state(), command).state),
    advance: (minutes) => setState(step(state(), minutes).state),
    onEvents: () => () => {},
  };

  const tick = (now: number) => {
    const dt = last === undefined ? 0 : Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    const s = state();
    if (!s.paused && dt > 0) store.advance(dt * balance.time.minutesPerRealSecond * s.speed * boost());
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  onCleanup(() => cancelAnimationFrame(frame));

  return {
    store,
    boost,
    setBoost,
    reset: () => setState(sandboxInitialState()),
  };
}

/** HUD に出す値（仮）。Phase 06 で view に本実装する */
export interface HudValues {
  profitPerHumanHour: number;
  /** 納期までの残り（日と時刻） */
  remainingDays: number;
  remainingTime: string;
  /** 島で作業している人間・AI の割合（0〜1） */
  human: number;
  ai: number;
}

export function hudValues(state: GameState, vm: WorldViewModel | undefined, profitPerHumanHour: number): HudValues {
  const run = state.projects[SANDBOX_PROJECT];
  const deadline = getProject(SANDBOX_PROJECT).deadlineDays * MINUTES_PER_DAY;
  const left = Math.max(0, deadline - (run ? state.clock - run.startedAt : 0));
  const days = Math.floor(left / MINUTES_PER_DAY);
  const rest = Math.floor(left % MINUTES_PER_DAY);
  const hh = String(Math.floor(rest / MINUTES_PER_HOUR)).padStart(2, '0');
  const mm = String(rest % MINUTES_PER_HOUR).padStart(2, '0');
  const ratio = (kind: 'human' | 'ai') => {
    const list = vm?.actors.filter((a) => a.kind === kind) ?? [];
    return list.length === 0 ? 0 : list.filter((a) => a.activity === 'work').length / list.length;
  };
  return {
    profitPerHumanHour,
    remainingDays: days,
    remainingTime: `${hh}:${mm}`,
    human: ratio('human'),
    ai: ratio('ai'),
  };
}

/** 「次に対応すべき問題」（仮）。問題 → 原因 → 次の行動 の3段 */
export interface Problem {
  id: string;
  icon: IconName;
  severity: 'danger' | 'warning';
  /** 問題のある島（次の行動でここへ移動する） */
  entityId: string;
  problem: string;
  cause: string;
  action: string;
}

const tp = ja.explore.d3.problems;

/**
 * 重要な順に問題を並べる（仮のルール）。ボトルネック → 担当が決まっていない Task（前の Task が終わっているものから）。
 * Phase 06 の view/advice.ts はこれを置き換える
 */
export function sandboxProblems(state: GameState, vm: WorldViewModel | undefined): Problem[] {
  const problems: Problem[] = [];
  // ボトルネックはリードタイムの累計なので、終わった島を指し続けることがある。終わった島は問題にしない
  const bn = vm?.bottleneck;
  const island = vm?.islands.find((i) => i.id === bn?.entityId);
  const finished = island?.status === 'done' || island?.status === 'defect';
  const label = bn && vm && !finished ? describeEntity(vm, bn.entityId)?.label : undefined;
  if (bn && label) {
    problems.push({
      id: `bottleneck:${bn.entityId}`,
      icon: 'bottleneck',
      severity: 'danger',
      entityId: bn.entityId,
      problem: tp.bottleneck(label),
      cause: tp.bottleneckCause(Math.round(bn.intensity * 100)),
      action: tp.bottleneckAction,
    });
  }
  const rows = taskRows(state, SANDBOX_PROJECT);
  const done = new Set(rows.filter((r) => r.status === 'done' || r.status === 'defect').map((r) => r.id));
  const def = getProject(SANDBOX_PROJECT);
  const unassigned = rows
    .filter((r) => r.status === 'unassigned')
    .map((r) => {
      const deps = def.tasks.find((t) => t.id === r.id)?.deps ?? [];
      return { row: r, ready: deps.every((d) => done.has(d)) };
    })
    .sort((a, b) => Number(b.ready) - Number(a.ready));
  for (const { row, ready } of unassigned) {
    problems.push({
      id: `unassigned:${row.id}`,
      icon: 'warning',
      severity: ready ? 'danger' : 'warning',
      entityId: islandId(row.id),
      problem: tp.unassigned(row.name),
      cause: ready ? tp.unassignedReady : tp.unassignedLater,
      action: tp.unassignedAction,
    });
  }
  return problems;
}
