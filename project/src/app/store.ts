import { type Accessor, createSignal } from 'solid-js';
import { type Command, reduce, type Transition } from '../core/commands';
import type { GameEvent } from '../core/events';
import type { GameState } from '../core/state';
import { step } from '../core/step';

export type EventListener = (events: readonly GameEvent[]) => void;

export interface GameStore {
  /** 現在の state。core の state は不変なので、Solid 側では createMemo で必要な値だけを取り出して使う */
  readonly state: Accessor<GameState>;
  dispatch(command: Command): void;
  /** ゲーム内時間を進める（ゲームループから呼ぶ） */
  advance(dtMinutes: number): void;
  /** events の購読。戻り値で解除する */
  onEvents(listener: EventListener): () => void;
}

/** Solid と core をつなぐ。state を変えるのは dispatch（Command）と advance（時間経過）だけ */
export function createGameStore(initial: GameState): GameStore {
  const [state, setState] = createSignal(initial);
  const listeners = new Set<EventListener>();

  const apply = ({ state: next, events }: Transition) => {
    if (next !== state()) setState(() => next);
    if (events.length === 0) return;
    for (const listener of listeners) listener(events);
  };

  return {
    state,
    dispatch: (command) => apply(reduce(state(), command)),
    advance: (dtMinutes) => apply(step(state(), dtMinutes)),
    onEvents(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
