import type { GameSpeed } from '../../content/balance';
import type { GameEvent } from '../../core/events';

/** これ以上操作がなかった区間を「迷った時間」として数える（秒） */
export const IDLE_THRESHOLD_SECONDS = 3;

/** 1つのステップの記録。時刻はチュートリアル開始からの実時間（秒） */
export interface PlayLogStep {
  readonly id: string;
  readonly reachedAt: number;
  /** このステップにいた時間 */
  readonly seconds: number;
  /** ステップに着いてから最初の操作までの時間。操作がなければ null */
  readonly firstInputSeconds: number | null;
  /** 操作がなかった最も長い区間 */
  readonly longestIdleSeconds: number;
  /** 操作がなかった区間のうち IDLE_THRESHOLD_SECONDS 以上のものの合計（迷った時間） */
  readonly idleSeconds: number;
}

/** 誤って押した操作（選べない担当カード・照らしていない島など） */
export interface PlayLogMisclick {
  readonly at: number;
  readonly step: string;
  readonly target: string;
}

/** プレイログの JSON。フィードバックの回答に貼ってもらう */
export interface PlayLogJson {
  readonly version: 1;
  readonly totalSeconds: number;
  /** completed: 最後まで遊んだ / skipped: スキップした / null: まだ終わっていない */
  readonly ended: 'completed' | 'skipped' | null;
  readonly steps: readonly PlayLogStep[];
  readonly misclicks: readonly PlayLogMisclick[];
  readonly speedChanges: readonly { readonly at: number; readonly speed: GameSpeed }[];
  readonly pauses: number;
}

interface OpenStep {
  readonly id: string;
  readonly reachedAt: number;
  firstInput: number | null;
  lastInput: number;
  longestIdle: number;
  idle: number;
}

export interface PlayLog {
  /** プレイヤーの操作（押す・キー・ホイール）。迷った時間の区切りになる */
  input(at: number): void;
  misclick(at: number, target: string): void;
  events(at: number, events: readonly GameEvent[]): void;
  /** 今のステップ（終わっていれば null） */
  currentStep(): string | null;
  toJson(at: number): PlayLogJson;
}

/**
 * チュートリアルのプレイログ（開発用。D5 の通しプレイで使う）。
 * 各ステップに着いた実時間・迷った時間（操作がなかった時間）・誤って押した操作・スキップの有無を記録する。
 * 時刻は呼ぶ側が渡す（チュートリアル開始からの実時間の秒）。チュートリアルが終わった後の入力は記録しない。
 */
export function createPlayLog(firstStep: string): PlayLog {
  const steps: PlayLogStep[] = [];
  const misclicks: PlayLogMisclick[] = [];
  const speedChanges: { at: number; speed: GameSpeed }[] = [];
  let pauses = 0;
  let ended: PlayLogJson['ended'] = null;
  let endedAt = 0;
  let open: OpenStep | null = openStep(firstStep, 0);

  function openStep(id: string, at: number): OpenStep {
    return { id, reachedAt: at, firstInput: null, lastInput: at, longestIdle: 0, idle: 0 };
  }

  function gap(s: OpenStep, at: number) {
    const g = at - s.lastInput;
    s.longestIdle = Math.max(s.longestIdle, g);
    if (g >= IDLE_THRESHOLD_SECONDS) s.idle += g;
    s.lastInput = at;
  }

  function close(s: OpenStep, at: number): PlayLogStep {
    gap(s, at);
    return {
      id: s.id,
      reachedAt: round(s.reachedAt),
      seconds: round(at - s.reachedAt),
      firstInputSeconds: s.firstInput === null ? null : round(s.firstInput - s.reachedAt),
      longestIdleSeconds: round(s.longestIdle),
      idleSeconds: round(s.idle),
    };
  }

  return {
    input(at) {
      if (!open) return;
      if (open.firstInput === null) open.firstInput = at;
      gap(open, at);
    },
    misclick(at, target) {
      if (open) misclicks.push({ at: round(at), step: open.id, target });
    },
    events(at, events) {
      for (const e of events) {
        if (!open) return;
        if (e.type === 'SpeedChanged') speedChanges.push({ at: round(at), speed: e.speed });
        else if (e.type === 'PauseToggled' && e.paused) pauses++;
        else if (e.type === 'TutorialStepChanged') {
          steps.push(close(open, at));
          open = openStep(e.stepId, at);
        } else if (e.type === 'TutorialEnded') {
          steps.push(close(open, at));
          open = null;
          ended = e.skipped ? 'skipped' : 'completed';
          endedAt = at;
        }
      }
    },
    currentStep: () => open?.id ?? null,
    toJson(at) {
      const now = open ? at : endedAt;
      // 終わっていなければ、今のステップを今の時刻で締めた形で出す（記録そのものは続ける）
      const current = open ? close({ ...open }, now) : null;
      return {
        version: 1,
        totalSeconds: round(now),
        ended,
        steps: current ? [...steps, current] : [...steps],
        misclicks: [...misclicks],
        speedChanges: [...speedChanges],
        pauses,
      };
    },
  };
}

const round = (v: number) => Math.round(v * 10) / 10;
