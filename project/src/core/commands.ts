import { primaryActor } from '../content/assignModes';
import { balance, type GameSpeed } from '../content/balance';
import { content, findWorker } from '../content/index';
import type { AssignModeId } from '../content/types';
import type { GameEvent } from './events';
import { createTaskRun, type GameState, updateTask } from './state';

/** プレイヤー操作。状態を変える唯一の入口 */
export type Command =
  | { readonly type: 'SetSpeed'; readonly speed: GameSpeed }
  | { readonly type: 'TogglePause' }
  | { readonly type: 'StartProject'; readonly projectId: string }
  /**
   * Task の担当を決める。依存が未完了でも先に決めておける。開始後は変更できない。
   * workerId はモードの主な担い手（AI が関わるモードでは AI Worker）。人間の工程は空いている人が担う。
   */
  | {
      readonly type: 'AssignTask';
      readonly projectId: string;
      readonly taskId: string;
      readonly mode: AssignModeId;
      readonly workerId: string;
    };

export interface Transition {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

const unchanged = (state: GameState): Transition => ({ state, events: [] });

/** Command を適用する。無効な Command は状態を変えず、events も出さない */
export function reduce(state: GameState, command: Command): Transition {
  switch (command.type) {
    case 'SetSpeed': {
      if (command.speed === state.speed || !balance.time.speeds.includes(command.speed)) {
        return unchanged(state);
      }
      return { state: { ...state, speed: command.speed }, events: [{ type: 'SpeedChanged', speed: command.speed }] };
    }
    case 'TogglePause': {
      const paused = !state.paused;
      return { state: { ...state, paused }, events: [{ type: 'PauseToggled', paused }] };
    }
    case 'StartProject': {
      const def = content.projects.find((p) => p.id === command.projectId);
      if (!def || state.projects[def.id]) return unchanged(state);
      const tasks = Object.fromEntries(def.tasks.map((t) => [t.id, createTaskRun()]));
      const run = { projectId: def.id, startedAt: state.clock, completedAt: null, tasks };
      return { state: { ...state, projects: { ...state.projects, [def.id]: run } }, events: [] };
    }
    case 'AssignTask': {
      const run = state.projects[command.projectId]?.tasks[command.taskId];
      const mode = content.assignModes.find((m) => m.id === command.mode);
      const worker = findWorker(command.workerId);
      if (run?.status !== 'waiting' || !mode || worker?.kind !== primaryActor(mode)) {
        return unchanged(state);
      }
      const assignment = { mode: mode.id, workerId: worker.id };
      return { state: updateTask(state, command.projectId, command.taskId, (r) => ({ ...r, assignment })), events: [] };
    }
  }
}
