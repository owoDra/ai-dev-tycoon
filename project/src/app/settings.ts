import { createSignal } from 'solid-js';
import type { AudioVolumes } from '../audio/engine';
import { defaultFeelChoice, type FeelIntensityId, feelIntensities } from '../content/look/feel';

/** 動きを減らす設定。system は OS の prefers-reduced-motion に合わせる */
export type MotionPreference = 'system' | 'reduce' | 'full';
export const motionPreferences = ['system', 'reduce', 'full'] as const satisfies readonly MotionPreference[];

export interface Settings {
  readonly motion: MotionPreference;
  /** 演出の強さ（content/look/feel.ts の feelIntensities） */
  readonly feelIntensity: FeelIntensityId;
  /** 音量（0〜1）とミュート。初期値は控えめにする */
  readonly audio: AudioVolumes;
}

const STORAGE_KEY = 'ai-dev-tycoon.settings.v1';
const DEFAULTS: Settings = {
  motion: 'system',
  feelIntensity: defaultFeelChoice.intensity,
  audio: { master: 0.6, sfx: 0.8, music: 0.45, muted: false },
};

/** 0〜1 の数でなければ既定値にする */
function volume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

/** 保存された設定を読む。読めない（プライベートモード・壊れた値）ときは既定値にする */
export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Settings {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const motion = motionPreferences.find((m) => m === parsed.motion) ?? DEFAULTS.motion;
    const feelIntensity =
      (Object.keys(feelIntensities) as FeelIntensityId[]).find((id) => id === parsed.feelIntensity) ??
      DEFAULTS.feelIntensity;
    const a: Partial<AudioVolumes> = parsed.audio ?? {};
    const audio: AudioVolumes = {
      master: volume(a.master, DEFAULTS.audio.master),
      sfx: volume(a.sfx, DEFAULTS.audio.sfx),
      music: volume(a.music, DEFAULTS.audio.music),
      muted: typeof a.muted === 'boolean' ? a.muted : DEFAULTS.audio.muted,
    };
    return {
      motion,
      feelIntensity,
      audio,
    };
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
