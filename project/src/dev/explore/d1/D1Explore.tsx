import { createSignal } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { type VisualPreset, type VisualPresetId, visualPresets } from '../../../content/look/visual';
import { ja } from '../../../i18n/ja';
import { ExploreShell } from '../ExploreShell';
import { createVariantSelection } from '../selection';
import { TweakPanel } from '../TweakPanel';
import { setPath } from '../tweak';
import { visualTweakGroups } from './fields';
import { StyleBoard } from './StyleBoard';

const t = ja.explore.d1;
const ids = Object.keys(visualPresets) as VisualPresetId[];

/** D1「ビジュアルの方向性」の比較ページ */
export function D1Explore(props: { tweak: boolean }) {
  const [selected, select] = createVariantSelection('d1', ids, ids[0] as VisualPresetId);
  const [tweakOpen, setTweakOpen] = createSignal(props.tweak);
  const [presets, setPresets] = createStore<Record<VisualPresetId, VisualPreset>>(structuredClone(visualPresets));
  const preset = () => presets[selected()];

  return (
    <ExploreShell
      title={t.title}
      options={ids.map((id) => ({ id, label: t.presets[id].name, aim: t.presets[id].aim }))}
      selected={selected()}
      onSelect={select}
      tweakOpen={tweakOpen()}
      onToggleTweak={() => setTweakOpen((v) => !v)}
      tweak={
        <TweakPanel
          value={preset()}
          groups={visualTweakGroups}
          onChange={(path, value) => setPresets(selected(), reconcile(setPath(presets[selected()], path, value)))}
          onReset={() => setPresets(selected(), reconcile(structuredClone(visualPresets[selected()])))}
          onClose={() => setTweakOpen(false)}
        />
      }
    >
      <StyleBoard preset={preset()} presetName={t.presets[selected()].name} />
    </ExploreShell>
  );
}
