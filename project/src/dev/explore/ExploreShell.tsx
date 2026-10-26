import { For, type JSX, Show } from 'solid-js';
import { ja } from '../../i18n/ja';

export interface ExploreOption<T extends string> {
  id: T;
  label: string;
  /** 案の狙い（1行） */
  aim: string;
}

/**
 * 案を比較するためのシェル。画面の隅に切り替えボタンを常に表示する（Artifact ではクエリパラメータを使えないため）。
 * 見た目は比較対象の案から切り離し、どの案を表示していても同じ見た目にする。
 */
export function ExploreShell<T extends string>(props: {
  title: string;
  options: readonly ExploreOption<T>[];
  selected: T;
  onSelect: (id: T) => void;
  tweakOpen: boolean;
  onToggleTweak: () => void;
  tweak: JSX.Element;
  children: JSX.Element;
}) {
  const current = () => props.options.find((o) => o.id === props.selected);
  return (
    <>
      {props.children}
      <Show when={props.tweakOpen}>{props.tweak}</Show>
      <nav
        aria-label={ja.explore.switcher}
        class="fixed inset-x-2 bottom-2 z-50 rounded-2xl bg-slate-900/95 p-3 font-sans text-sm text-slate-100 shadow-2xl ring-1 ring-white/10 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-md"
      >
        <div class="mb-2 flex items-center justify-between gap-3">
          <span class="text-xs font-bold tracking-wide text-slate-400">{props.title}</span>
          <button
            type="button"
            aria-pressed={props.tweakOpen}
            class="rounded-lg px-2 py-1 text-xs font-bold ring-1 ring-slate-600 hover:bg-slate-700 aria-pressed:bg-slate-100 aria-pressed:text-slate-900"
            onClick={() => props.onToggleTweak()}
          >
            {ja.explore.tweak}
          </button>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <For each={props.options}>
            {(o) => (
              <button
                type="button"
                aria-pressed={o.id === props.selected}
                class="rounded-lg px-3 py-1.5 font-bold ring-1 ring-slate-600 hover:bg-slate-700 aria-pressed:bg-white aria-pressed:text-slate-900 aria-pressed:ring-white"
                onClick={() => props.onSelect(o.id)}
              >
                {o.label}
              </button>
            )}
          </For>
        </div>
        <Show when={current()}>{(c) => <p class="mt-2 text-xs leading-relaxed text-slate-300">{c().aim}</p>}</Show>
      </nav>
    </>
  );
}
