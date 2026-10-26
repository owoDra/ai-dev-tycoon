import { getAssignMode } from '../content/assignModes';
import { type FxSignalKind, fxRules } from '../content/fx';
import { content, getModel, getProject, humans } from '../content/index';
import type { AssignModeId } from '../content/types';
import type { GameEvent } from '../core/events';
import { expectedHumanMinutes } from '../core/formulas';
import { MINUTES_PER_HOUR } from '../core/units';
import { type EntityId, humanActorId, islandId } from './world';

/** 演出のきっかけ（content/fx.ts の表を引くキー）と、演出を出す場所 */
export interface FxSignal {
  readonly kind: FxSignalKind;
  /** 演出の中心（島・キャラクター）。null なら画面の中心 */
  readonly entityId: EntityId | null;
  /** 表情を変えるキャラクター */
  readonly actorId?: EntityId;
  /** 大きな数字（自動化で減った人間時間の見込み、h） */
  readonly amount?: number;
}

/** events を読むときに必要な ViewModel の値 */
export interface FxContext {
  readonly projectId: string;
  /** いまボトルネックとして示している島やキャラクター（WorldViewModel.bottleneck） */
  readonly bottleneckEntity: EntityId | null;
}

/**
 * 担当モードで作業したときに、人間がやった場合より減る人間時間の見込み（h）。
 * 人間の熟練度は全員の平均で見積もる（view/hud.ts の見込みと同じ考え方）
 */
export function savedHumanHours(projectId: string, taskId: string, modeId: AssignModeId): number {
  const task = getProject(projectId).tasks.find((t) => t.id === taskId);
  const ai = content.workers.find((w) => w.kind === 'ai');
  if (!task || !ai || humans.length === 0) return 0;
  const model = getModel(ai.modelId);
  const skill = humans.reduce((sum, h) => sum + h.skill, 0) / humans.length;
  const human = expectedHumanMinutes(task, getAssignMode('human'), skill, model);
  const mode = expectedHumanMinutes(task, getAssignMode(modeId), skill, model);
  return (human - mode) / MINUTES_PER_HOUR;
}

/**
 * GameEvent の列を演出のきっかけに変換する（純粋関数。state は変えない）。
 * - Task 完了 → taskDone（品質が落ちていたら taskDefect）。ボトルネックの島の Task が終わったら bottleneckCleared も
 * - レビューで手戻りを発見 → reviewCatch（レビューした人の表情を変える）
 * - 人間時間の見込みが大きく減る担当で作業が始まる → automation（減った時間を大きな数字で出す）
 * - 自動テストが失敗を発見 → autoRepair（AI がそのまま直す）
 * - 機能の解放 → unlock（「NEW」バッジと一緒に出す）
 * - 案件の納品 → projectComplete（同じ回のほかの大きな演出より優先されるのは director が決める）
 */
export function fxSignals(events: readonly GameEvent[], ctx: FxContext): FxSignal[] {
  const out: FxSignal[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'TaskCompleted': {
        if (e.projectId !== ctx.projectId) break;
        const entityId = islandId(e.taskId);
        out.push({ kind: e.quality >= 1 ? 'taskDone' : 'taskDefect', entityId });
        if (ctx.bottleneckEntity === entityId) out.push({ kind: 'bottleneckCleared', entityId });
        break;
      }
      case 'ReworkDetected':
        if (e.projectId !== ctx.projectId) break;
        out.push({ kind: 'reviewCatch', entityId: islandId(e.taskId), actorId: humanActorId(e.humanId) });
        break;
      case 'TaskStarted': {
        if (e.projectId !== ctx.projectId || e.mode === 'human') break;
        const hours = savedHumanHours(e.projectId, e.taskId, e.mode);
        if (hours >= fxRules.automationMinSavedHours) {
          out.push({ kind: 'automation', entityId: islandId(e.taskId), amount: hours });
        }
        break;
      }
      case 'EvalCaught':
        if (e.projectId !== ctx.projectId) break;
        out.push({ kind: 'autoRepair', entityId: islandId(e.taskId) });
        break;
      case 'FeatureUnlocked':
        out.push({ kind: 'unlock', entityId: null });
        break;
      case 'ProjectCompleted':
        if (e.projectId === ctx.projectId) out.push({ kind: 'projectComplete', entityId: null });
        break;
    }
  }
  return out;
}
