import { deserialize, serialize } from '../core/serialize';
import type { GameState } from '../core/state';

/*
 * キャンペーンの自動セーブ（localStorage）。タイトルの「続きから」で読み込む。
 * 保存するのは GameState だけで、形式とバージョンの変換は core/serialize.ts が受け持つ。
 */

const SAVE_KEY = 'ai-dev-tycoon.campaign.v1';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function safeStorage(): Store | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** 保存されたキャンペーンを読む。ない・読めない（壊れた値・未対応のバージョン）なら null */
export function loadCampaign(storage: Pick<Store, 'getItem'> | undefined = safeStorage()): GameState | null {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return null;
    const state = deserialize(raw);
    return state.campaign ? state : null;
  } catch {
    return null;
  }
}

/** キャンペーンを保存する（キャンペーンでない state は保存しない）。保存できなければ何もしない */
export function saveCampaign(state: GameState, storage: Pick<Store, 'setItem'> | undefined = safeStorage()): void {
  if (!state.campaign) return;
  try {
    storage?.setItem(SAVE_KEY, serialize(state));
  } catch {
    // 保存できなくても、このセッションの間はそのまま遊べる
  }
}

export function clearCampaign(storage: Pick<Store, 'removeItem'> | undefined = safeStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // 消せなくても、次の「はじめから」で上書きされる
  }
}
