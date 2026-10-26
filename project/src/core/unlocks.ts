import { glossary } from '../content/glossary';
import type { FeatureId, TermId } from '../content/types';
import { unlockDefs } from '../content/unlocks';
import { holds } from './conditions';
import type { GameEvent } from './events';
import type { GameState } from './state';

/** 機能が解放済みか。UI はこれだけを見て表示・非表示を切り替える */
export function isUnlocked(state: GameState, feature: FeatureId): boolean {
  return state.unlocked.includes(feature);
}

/** 用語の名前を明かし済みか */
export function isRevealed(state: GameState, term: TermId): boolean {
  return state.revealed.includes(term);
}

/**
 * 条件を満たした機能を解放し、用語の名前を明かす。解放は他の解放を条件にできるので、新しく解放がなくなるまで繰り返す。
 * Command の適用後と、時間を進めた各ステップの最後に呼ぶ（core/progress.ts）。
 */
export function applyUnlocks(state: GameState, emit: (e: GameEvent) => void): GameState {
  let unlocked = state.unlocked;
  for (let changed = true; changed; ) {
    changed = false;
    for (const u of unlockDefs) {
      if (unlocked.includes(u.feature) || !holds({ ...state, unlocked }, u.when)) continue;
      unlocked = [...unlocked, u.feature];
      emit({ type: 'FeatureUnlocked', feature: u.feature });
      changed = true;
    }
  }
  let revealed = state.revealed;
  for (const term of glossary) {
    if (revealed.includes(term.id) || !holds({ ...state, unlocked }, term.reveal)) continue;
    revealed = [...revealed, term.id];
    emit({ type: 'TermRevealed', term: term.id });
  }
  if (unlocked === state.unlocked && revealed === state.revealed) return state;
  return { ...state, unlocked, revealed };
}
