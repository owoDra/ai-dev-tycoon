import { postInquiries } from './board';
import type { GameEvent } from './events';
import type { GameState } from './state';
import type { System } from './system';
import { advanceTutorial } from './tutorial';
import { applyUnlocks } from './unlocks';

/**
 * 機能の解放・用語の明かし・チュートリアルの進行・案件ボードの引き合いをまとめて判定する。Command の適用後と各ステップの最後に呼ぶ
 */
export function settleProgress(state: GameState, emit: (e: GameEvent) => void): GameState {
  return postInquiries(advanceTutorial(applyUnlocks(state, emit), emit), emit);
}

export const progressSystem: System = (state, ctx) => settleProgress(state, ctx.emit);
