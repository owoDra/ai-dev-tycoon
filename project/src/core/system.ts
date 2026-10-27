import { autonomySystem } from './autonomy';
import { boardSystem } from './board';
import { bottleneckSystem } from './bottleneck';
import type { GameEvent } from './events';
import { humanQueueSystem } from './humanQueueSystem';
import { incidentSystem } from './incidents';
import { managerSystem } from './manager';
import { progressSystem } from './progress';
import type { RngCursor } from './rng';
import type { GameState } from './state';
import { taskSystem, taskUnlockSystem } from './taskSystem';
import { marketSystem, seatSystem } from './team';
import { managementSystem } from './teams';

/** システム関数に渡す、1ステップ分の作業場所 */
export interface SystemContext {
  readonly rng: RngCursor;
  emit(event: GameEvent): void;
}

/**
 * 固定ステップ1回ぶんの処理。新しい機能はシステムを1つ作って `defaultSystems` に足す。
 * state は書き換えず、新しい state を返す。乱数は必ず ctx.rng から引く。
 */
export type System = (state: GameState, ctx: SystemContext) => GameState;

/** 発火時刻に達した予約済みの出来事を出力する */
export const releaseScheduledEvents: System = (state, ctx) => {
  const due = state.pendingEvents.filter((e) => e.at <= state.clock);
  if (due.length === 0) return state;
  for (const e of due) ctx.emit(e.event);
  return { ...state, pendingEvents: state.pendingEvents.filter((e) => e.at > state.clock) };
};

/** 1ステップごとに先頭から順に適用されるシステム */
export const defaultSystems: readonly System[] = [
  releaseScheduledEvents,
  // 営業日が変わったら Seat の使用量を戻し、固定費を日割りで計上する
  seatSystem,
  // 営業日が変わったら採用市場の候補を入れ替える
  marketSystem,
  // 締切を迎えた引き合いのコンペの結果を出す（受注した案件はこのステップから進む）
  boardSystem,
  // 委任されたチームの管理者が、担当の決まっていない Task の担当を決める（Command を reduce に通す）
  managerSystem,
  // 管理者の運営の費用（人間 PM の稼働・AI PM の AI 費用と使用量）
  managementSystem,
  // このステップで AI が処理する分を、工程が終わって人間に回る前に数える
  autonomySystem,
  taskSystem,
  humanQueueSystem,
  taskUnlockSystem,
  incidentSystem,
  bottleneckSystem,
  progressSystem,
];
