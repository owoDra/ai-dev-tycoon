import { deserialize, serialize } from '../core/serialize';
import type { GameState } from '../core/state';

/*
 * キャンペーンの自動セーブ（localStorage）。タイトルの「続きから」で読み込む。
 * 保存するのは GameState だけで、形式とバージョンの変換は core/serialize.ts が受け持つ。
 */

const SAVE_KEY = 'ai-dev-tycoon.campaign.v1';
/** 最後に保存した実時刻（ms）。閉じていた間の進行（core/away.ts）に使う。GameState には入れない（core は実時刻を使わない） */
const SAVED_AT_KEY = 'ai-dev-tycoon.campaign.savedAt';

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

/** キャンペーンを保存する（キャンペーンでない state は保存しない）。保存した実時刻も残す。保存できなければ何もしない */
export function saveCampaign(
  state: GameState,
  storage: Pick<Store, 'setItem'> | undefined = safeStorage(),
  now: number = Date.now(),
): void {
  if (!state.campaign) return;
  try {
    storage?.setItem(SAVE_KEY, serialize(state));
    storage?.setItem(SAVED_AT_KEY, String(now));
  } catch {
    // 保存できなくても、このセッションの間はそのまま遊べる
  }
}

/** 最後に保存した実時刻（ms）。ない・読めなければ null */
export function loadSavedAt(storage: Pick<Store, 'getItem'> | undefined = safeStorage()): number | null {
  try {
    const at = Number(storage?.getItem(SAVED_AT_KEY) ?? Number.NaN);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

export function clearCampaign(storage: Pick<Store, 'removeItem'> | undefined = safeStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY);
    storage?.removeItem(SAVED_AT_KEY);
  } catch {
    // 消せなくても、次の「はじめから」で上書きされる
  }
}
