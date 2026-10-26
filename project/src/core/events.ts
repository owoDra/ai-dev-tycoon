import type { GameSpeed } from '../content/balance';
import type { AssignModeId, FeatureId, TermId } from '../content/types';
import type { BottleneckRef } from './bottleneck';

/**
 * core が出力する出来事。描画・UI・演出・音はこれを読んで反応する。
 * 後続の Phase で種類を追加していく。
 */
export type GameEvent =
  | { readonly type: 'SpeedChanged'; readonly speed: GameSpeed }
  | { readonly type: 'PauseToggled'; readonly paused: boolean }
  | { readonly type: 'TaskStarted'; readonly projectId: string; readonly taskId: string; readonly mode: AssignModeId }
  | { readonly type: 'TaskCompleted'; readonly projectId: string; readonly taskId: string; readonly quality: number }
  /** 作業が失敗した（この時点では誰も気付いていない。レビューがあれば後で ReworkDetected になる） */
  | { readonly type: 'TaskFailed'; readonly projectId: string; readonly taskId: string }
  | { readonly type: 'ReworkDetected'; readonly projectId: string; readonly taskId: string; readonly humanId: string }
  /** AI の自動テストが失敗を見つけた（AI がそのまま修復する） */
  | { readonly type: 'EvalCaught'; readonly projectId: string; readonly taskId: string }
  | { readonly type: 'ProjectCompleted'; readonly projectId: string }
  | { readonly type: 'BottleneckChanged'; readonly bottleneck: BottleneckRef | null }
  /** 機能が解放された（Tier 2 の演出と「NEW」バッジ） */
  | { readonly type: 'FeatureUnlocked'; readonly feature: FeatureId }
  /** 用語の名前を明かした（体験の後に短いカードで知らせる） */
  | { readonly type: 'TermRevealed'; readonly term: TermId }
  /** チュートリアルのステップが進んだ */
  | { readonly type: 'TutorialStepChanged'; readonly stepId: string }
  /** チュートリアルが終わった（skipped: スキップした） */
  | { readonly type: 'TutorialEnded'; readonly skipped: boolean };

/** 指定したゲーム内時刻（分）に発火させる予約済みの出来事 */
export interface ScheduledEvent {
  readonly at: number;
  readonly event: GameEvent;
}
