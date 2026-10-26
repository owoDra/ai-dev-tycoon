import { balance } from '../content/balance';
import type { ModelDef, TaskDef } from '../content/types';
import { contextApplies, contextEffects, getSession, lossEffects, readContext } from './context';
import { incidentEffects } from './incidents';
import type { GameState } from './state';

/*
 * Context が AI の作業に与える影響を、Session と発生中の事件からまとめて計算する。
 * シミュレーション（core/taskFlow.ts・taskSystem.ts）と、HUD の見込み（view/hud.ts）で同じ式を使う。
 * 資料を持たない案件では Context の影響はなく、発生中の事件（Harness 由来のものはどの案件でも起きる）の影響だけが残る。
 */

/** AI の作業の所要時間に掛かる影響 */
export interface ContextWorkTime {
  /** 所要時間の倍率（発生中の事件） */
  readonly factor: number;
  /** Tool を誤選択する確率。起きると所要時間が 1 + toolMissExtra 倍になる */
  readonly toolMissChance: number;
  /** 足される時間（分）。Reset で失った項目の把握し直しと、Artifact Driven Work の保存作業 */
  readonly extraMinutes: number;
}

const NONE: ContextWorkTime = { factor: 1, toolMissChance: 0, extraMinutes: 0 };

/**
 * AI の作業の成功確率。成功確率から Context・Reset で失った項目・事件の影響を引き、
 * 古い仕様を参照する確率の分だけさらに下げる。
 */
export function aiSuccessWithContext(
  state: GameState,
  workerId: string,
  projectId: string,
  taskId: string,
  p: number,
): number {
  const incident = incidentEffects(state, workerId).successPenalty;
  const { min, max } = balance.success;
  if (!contextApplies(projectId)) return incident === 0 ? p : Math.min(max, Math.max(min, p - incident));
  const session = getSession(state, workerId);
  const effects = contextEffects(readContext(session, projectId, taskId));
  const penalty = effects.successPenalty + lossEffects(session).successPenalty + incident;
  return Math.min(max, Math.max(min, p - penalty)) * (1 - effects.staleChance);
}

/** AI の作業の所要時間への影響 */
export function aiWorkTime(
  state: GameState,
  workerId: string,
  projectId: string,
  task: TaskDef,
  model: ModelDef,
): ContextWorkTime {
  const factor = incidentEffects(state, workerId).aiTimeFactor;
  if (!contextApplies(projectId)) return factor === 1 ? NONE : { ...NONE, factor };
  const session = getSession(state, workerId);
  const effects = contextEffects(readContext(session, projectId, task.id));
  const extraShare = lossEffects(session).relearnShare + (session.artifacts ? balance.handoff.artifactShare : 0);
  return {
    factor,
    toolMissChance: effects.toolMissChance,
    extraMinutes: (task.effort * extraShare) / model.speed,
  };
}

/** AI の作業の所要時間の期待値（分）。Tool の誤選択は確率の分だけ延びるとみなす（見込み用） */
export function expectedAiWorkMinutes(minutes: number, time: ContextWorkTime): number {
  return minutes * time.factor * (1 + time.toolMissChance * balance.context.toolMissExtra) + time.extraMinutes;
}

/** AI の費用の倍率（Context の使用率に応じた AI 消費量の増加） */
export function aiCostFactor(state: GameState, workerId: string, projectId: string, taskId: string): number {
  if (!contextApplies(projectId)) return 1;
  return contextEffects(readContext(getSession(state, workerId), projectId, taskId)).costFactor;
}
