import { createSignal } from 'solid-js';

/** 動きを減らす設定。system は OS の prefers-reduced-motion に合わせる */
export type MotionPreference = 'system' | 'reduce' | 'full';
export const motionPreferences = ['system', 'reduce', 'full'] as const satisfies readonly MotionPreference[];

export interface Settings {
  readonly motion: MotionPreference;
}

const STORAGE_KEY = 'ai-dev-tycoon.settings.v1';
const DEFAULTS: Settings = { motion: 'system' };

/** 保存された設定を読む。読めない（プライベートモード・壊れた値）ときは既定値にする */
export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Settings {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const motion = motionPreferences.find((m) => m === parsed.motion) ?? DEFAULTS.motion;
    return { motion };
  } catch {
    return DEFAULTS;
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * プレイヤーの設定（ゲームの state ではないので Command を通さない）。localStorage に保存する。
 * Phase 08 で音量をここに足す。
 */
const [settings, setSettingsSignal] = createSignal<Settings>(loadSettings());

export { settings };

export function updateSettings(patch: Partial<Settings>): void {
  const next = { ...settings(), ...patch };
  setSettingsSignal(next);
  try {
    safeStorage()?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても、このセッションの間は設定が効く
  }
}
