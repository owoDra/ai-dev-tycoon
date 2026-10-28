import { type Accessor, createSignal } from 'solid-js';
import { balance } from '../content/balance';
import { type Command, reduce, type Transition } from '../core/commands';
import type { GameEvent } from '../core/events';
import { isBankrupt } from '../core/funds';
import type { GameState } from '../core/state';
import { step } from '../core/step';
import { decisionNeeded, nextDayStart } from '../core/turn';

/** 日の終わりにちょうど届かせるための上乗せ（ゲーム内の分） */
const STOP_EPSILON = 1e-6;

export type EventListener = (events: readonly GameEvent[]) => void;

/**
 * 進めている最中の日。target（次の始業の時刻）まで、ゲームループが少しずつ進めて見せる。
 * untilDecision なら、その日の終わりに判断が要らなければ（core/turn.ts の decisionNeeded）次の日へ続ける
 */
export interface DayRun {
  readonly target: number;
  readonly untilDecision: boolean;
  /** このまとめ送りで進めた日数（1日目が 1） */
  readonly days: number;
}

export interface GameStore {
  /** 現在の state。core の state は不変なので、Solid 側では createMemo で必要な値だけを取り出して使う */
  readonly state: Accessor<GameState>;
  /** 進めている最中の日（null なら止まっている。時間はプレイヤーが進めるまで動かない） */
  readonly run: Accessor<DayRun | null>;
  dispatch(command: Command): void;
  /**
   * 1日進め始める（untilDecision なら判断が必要になるまで）。すでに進めている最中なら止める（もう一度押すと止まる）
   */
  play(untilDecision: boolean): void;
  /** 進めている日を止める（日の途中で止めたら、次に進めるときは同じ日の終わりまで） */
  stop(): void;
  /** 進めている日を、最大 dtMinutes だけ進める（ゲームループから呼ぶ）。進めていなければ何もしない */
  advance(dtMinutes: number): void;
  /** events の購読。戻り値で解除する */
  onEvents(listener: EventListener): () => void;
}

/** Solid と core をつなぐ。state を変えるのは dispatch（Command）と advance（プレイヤーが進めた日の時間経過）だけ */
export function createGameStore(initial: GameState): GameStore {
  const [state, setState] = createSignal(initial);
  const [run, setRun] = createSignal<DayRun | null>(null);
  const listeners = new Set<EventListener>();
  /** 進めている日に起きた出来事（日の終わりに、判断が要るかを見る） */
  let dayEvents: GameEvent[] = [];

  const apply = ({ state: next, events }: Transition) => {
    if (next !== state()) setState(() => next);
    if (events.length === 0) return;
    for (const listener of listeners) listener(events);
  };
  const startDay = (untilDecision: boolean, days: number) => {
    dayEvents = [];
    setRun({ target: nextDayStart(state().clock), untilDecision, days });
  };

  return {
    state,
    run,
    dispatch: (command) => apply(reduce(state(), command)),
    play(untilDecision) {
      if (run() !== null) return setRun(null);
      if (isBankrupt(state())) return;
      startDay(untilDecision, 1);
    },
    stop: () => setRun(null),
    advance(dtMinutes) {
      const current = run();
      if (!current) return;
      const s = state();
      const room = current.target - s.clock - s.carryMinutes;
      // 止める時刻にちょうど届かせる（浮動小数の誤差で境目の手前に残らないようにする）
      const t = step(s, dtMinutes >= room ? room + STOP_EPSILON : dtMinutes);
      dayEvents.push(...t.events);
      apply(t);
      const after = state();
      if (after.clock < current.target && !isBankrupt(after)) return;
      // 日の終わり：まとめ送りなら、判断が要らない限り次の日へ続ける
      const more =
        current.untilDecision && current.days < balance.time.maxSkipDays && !decisionNeeded(after, dayEvents);
      if (run() !== current) return;
      if (more) startDay(true, current.days + 1);
      else setRun(null);
    },
    onEvents(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
