import { reduce } from '../../src/core/commands';
import type { GameState } from '../../src/core/state';
import { usageLimit } from '../../src/core/team';
import { isUnlocked } from '../../src/core/unlocks';

/** 今日の使用量が上限のこの割合を超えたら買い足す（30分ごとに見るので、止まる前に買えるよう余裕を持たせる） */
const HEADROOM = 0.7;

/**
 * 自動戦略の Seat の買い方。今日の使用量が上限の HEADROOM を下回るまで Premium を1枚ずつ買い足す（減らさない）。
 * 使用量は営業日ごとに戻るので、枚数はその会社の1日の使用量の山に合わせて増えていく。買えなければ（解放前）そのまま
 */
export function topUpSeats(state: GameState): GameState {
  if (!isUnlocked(state, 'team')) return state;
  let s = state;
  while (s.usage >= usageLimit(s) * HEADROOM) {
    s = reduce(s, { type: 'SetSeats', seat: 'premium', count: s.seats.premium + 1 }).state;
  }
  return s;
}
