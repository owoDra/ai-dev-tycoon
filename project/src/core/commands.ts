import { balance, type GameSpeed } from '../content/balance';
import type { GameEvent } from './events';
import type { GameState } from './state';

/** プレイヤー操作。状態を変える唯一の入口 */
export type Command = { readonly type: 'SetSpeed'; readonly speed: GameSpeed } | { readonly type: 'TogglePause' };

export interface Transition {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/** Command を適用する。無効な Command は状態を変えず、events も出さない */
export function reduce(state: GameState, command: Command): Transition {
  switch (command.type) {
    case 'SetSpeed': {
      if (command.speed === state.speed || !balance.time.speeds.includes(command.speed)) {
        return { state, events: [] };
      }
      return { state: { ...state, speed: command.speed }, events: [{ type: 'SpeedChanged', speed: command.speed }] };
    }
    case 'TogglePause': {
      const paused = !state.paused;
      return { state: { ...state, paused }, events: [{ type: 'PauseToggled', paused }] };
    }
  }
}
