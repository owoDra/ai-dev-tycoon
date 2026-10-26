import { createSignal } from 'solid-js';
import { defaultFeelId, type FeelId, type FeelPreset, feelPresets } from '../content/look/feel';

/**
 * いま使っている手触りのプリセット。演出は起動するたびにここから読むので、
 * 実行中に差し替えると次の演出から反映する（`?dev=tweak` と `?dev=fx` から変える。D4 で比較に使う）
 */
const [feelId, setFeelId] = createSignal<FeelId>(defaultFeelId);
const [feel, setFeel] = createSignal<FeelPreset>(feelPresets[defaultFeelId]);

export { feel, feelId, setFeel };

export function selectFeelPreset(id: FeelId): void {
  setFeelId(id);
  setFeel(feelPresets[id]);
}
