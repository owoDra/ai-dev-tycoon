import type { GameSpeed } from '../content/balance';
import type {
  AssignModeId,
  CompanyTierId,
  FeatureId,
  HandoffItemId,
  IncidentId,
  SeatId,
  TermId,
} from '../content/types';
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
  | { readonly type: 'TutorialEnded'; readonly skipped: boolean }
  /** AI Worker の Session を始め直した。lost は Handoff で残さず失った項目 */
  | { readonly type: 'SessionReset'; readonly workerId: string; readonly lost: readonly HandoffItemId[] }
  /** 事件が起きた（「次に対応すべき問題」の先頭に出る） */
  | {
      readonly type: 'IncidentStarted';
      readonly incident: IncidentId;
      readonly workerId: string;
      readonly projectId: string;
      readonly taskId: string;
    }
  | { readonly type: 'IncidentResolved'; readonly incident: IncidentId; readonly workerId: string }
  /**
   * AI Worker の Harness を変えた（企画書35章）。change: equip 部品を付けた / remove 外した / model Model を変えた。id は部品か Model。
   * savedHumanHours は、変更で減る人間時間の見込み（h、進行中の案件のこの AI Worker の仕事）。大きければ Tier 3 の演出
   */
  | {
      readonly type: 'HarnessChanged';
      readonly workerId: string;
      readonly change: 'equip' | 'remove' | 'model';
      readonly id: string;
      readonly savedHumanHours?: number;
    }
  /** AI の作業で事故（権限・Tool の誤用）が起きた。作業は失敗扱いになる */
  | { readonly type: 'HarnessAccident'; readonly projectId: string; readonly taskId: string; readonly workerId: string }
  /**
   * AI Worker の Autonomy Streak（人間が介入せずに AI が処理を続けた時間）がしきい値 minutes（分）を越えた（企画書23章。Tier 4 の演出）
   */
  | { readonly type: 'AutonomyMilestone'; readonly workerId: string; readonly minutes: number }
  /** 複数の Task を Workflow にまとめて AI に任せた（企画書5章） */
  | { readonly type: 'WorkflowAssigned'; readonly projectId: string; readonly taskIds: readonly string[] }
  /** 社員の Seat を変えた */
  | { readonly type: 'SeatChanged'; readonly staffId: string; readonly seat: SeatId }
  /** 社員が入社した（採用市場から採用した） */
  | { readonly type: 'StaffJoined'; readonly staffId: string }
  /** 社員が退職した */
  | { readonly type: 'StaffReleased'; readonly staffId: string }
  /** 案件ボードに引き合いが届いた（営業日ごと） */
  | { readonly type: 'InquiriesPosted'; readonly projectIds: readonly string[] }
  /** 引き合いに見積を出した（出し直しを含む） */
  | { readonly type: 'BidSubmitted'; readonly projectId: string; readonly amount: number; readonly winChance: number }
  /** コンペに勝って受注した。案件が始まる */
  | { readonly type: 'BidWon'; readonly projectId: string; readonly amount: number }
  | { readonly type: 'BidLost'; readonly projectId: string }
  /** 納品で評判が変わった（delta は変化量、reputation は変化後の値） */
  | {
      readonly type: 'ReputationChanged';
      readonly projectId: string;
      readonly delta: number;
      readonly reputation: number;
    }
  /** Workflow Library に Workflow を保存した（オフィスのライブラリ棚にバインダーが1冊増える） */
  /** 会社の規模が昇格した（core/company.ts）。Tier 4 の演出と、新しく解放された要素の案内 */
  | { readonly type: 'CompanyPromoted'; readonly from: CompanyTierId; readonly tier: CompanyTierId }
  /** AI Worker を増やした */
  | { readonly type: 'AiWorkerAdded'; readonly workerId: string }
  /** チームを作った */
  | { readonly type: 'TeamCreated'; readonly teamId: string }
  /** チームの管理者を置いた・替えた・外した（null） */
  | { readonly type: 'ManagerAssigned'; readonly teamId: string; readonly manager: 'human' | 'ai' | null }
  | { readonly type: 'WorkflowSaved'; readonly workflowId: string }
  /**
   * Workflow Library の Workflow を Task に適用した。skipped はまだ解放されていないので付けなかった部品。
   * savedHumanHours は適用で減る人間時間の見込み（h）
   */
  | {
      readonly type: 'LibraryWorkflowApplied';
      readonly workflowId: string;
      readonly projectId: string;
      readonly taskId: string;
      readonly skipped: readonly string[];
      readonly savedHumanHours: number;
    };

/** 指定したゲーム内時刻（分）に発火させる予約済みの出来事 */
export interface ScheduledEvent {
  readonly at: number;
  readonly event: GameEvent;
}
