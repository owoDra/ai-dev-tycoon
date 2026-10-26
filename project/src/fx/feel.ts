import { createSignal } from 'solid-js';
import { settings, updateSettings } from '../app/settings';
import { defaultFeelChoice, type FeelChoice, type FeelMotionId, type FeelPreset, feelFor } from '../content/look/feel';

/**
 * いま使っている手触り。演出は起動するたびにここから読むので、実行中に差し替えると次の演出から反映する。
 * 演出の強さは設定画面の「演出の強さ」（app/settings.ts）に従い、モーションの性格は既定のものを使う。
 * `?dev=tweak` で値を直接いじったときは、その値を優先する（selectFeel で元に戻る）
 */
const [motionId, setMotionId] = createSignal<FeelMotionId>(defaultFeelChoice.motion);
const [tweaked, setTweaked] = createSignal<FeelPreset | null>(null);

export function feelChoice(): FeelChoice {
  return { intensity: settings().feelIntensity, motion: motionId() };
}

export function feel(): FeelPreset {
  return tweaked() ?? feelFor(feelChoice());
}

/** 調整パネルから値を直接差し替える */
export function setFeel(preset: FeelPreset): void {
  setTweaked(preset);
}

/** 軸の一部だけを替え、調整パネルでいじった値を捨てる。演出の強さは設定として保存する */
export function selectFeel(patch: Partial<FeelChoice>): void {
  if (patch.intensity !== undefined && patch.intensity !== settings().feelIntensity) {
    updateSettings({ feelIntensity: patch.intensity });
  }
  if (patch.motion !== undefined) setMotionId(patch.motion);
  setTweaked(null);
}
