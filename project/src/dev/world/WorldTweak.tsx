import { createSignal, For, Show } from 'solid-js';
import { type WorldLook, type WorldLookId, worldLooks } from '../../content/look/world';
import { ja } from '../../i18n/ja';
import { TweakPanel } from '../explore/TweakPanel';
import { getPath, setPath } from '../explore/tweak';
import { worldTweakGroups } from './fields';

/**
 * `?dev=tweak`：ゲーム画面の上で、ワールドの見た目のプリセットを切り替え、値をスライダーで調整する。
 * 変更は再読み込みなしでワールドに反映される。
 */
export function WorldTweak(props: {
  lookId: WorldLookId;
  look: WorldLook;
  onPreset: (id: WorldLookId) => void;
  onChange: (look: WorldLook) => void;
}) {
  const ids = Object.keys(worldLooks) as WorldLookId[];
  const [open, setOpen] = createSignal(true);
  const change = (path: string, value: unknown) => {
    // 真偽値は選択肢の文字列で受け取る
    const typed = typeof getPath(props.look, path) === 'boolean' ? value === 'true' : value;
    props.onChange(setPath(props.look, path, typed));
  };
  return (
    <>
      <nav
        aria-label={ja.world.lookSwitcher}
        class="fixed bottom-2 left-1/2 z-50 flex -translate-x-1/2 gap-1.5 rounded-2xl bg-slate-900/95 p-2 text-sm text-slate-100 shadow-2xl"
      >
        <For each={ids}>
          {(id) => (
            <button
              type="button"
              aria-pressed={id === props.lookId}
              class="rounded-lg px-3 py-1.5 font-bold ring-1 ring-slate-600 hover:bg-slate-700 aria-pressed:bg-white aria-pressed:text-slate-900"
              onClick={() => props.onPreset(id)}
            >
              {ja.world.looks[id]}
            </button>
          )}
        </For>
        <button
          type="button"
          aria-pressed={open()}
          class="rounded-lg px-3 py-1.5 font-bold ring-1 ring-slate-600 hover:bg-slate-700 aria-pressed:bg-white aria-pressed:text-slate-900"
          onClick={() => setOpen(!open())}
        >
          {ja.explore.tweak}
        </button>
      </nav>
      <Show when={open()}>
        <TweakPanel
          value={props.look}
          groups={worldTweakGroups}
          onChange={change}
          onReset={() => props.onPreset(props.lookId)}
          onClose={() => setOpen(false)}
        />
      </Show>
    </>
  );
}
