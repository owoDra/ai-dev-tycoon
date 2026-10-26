import { createSignal, For, Match, Switch } from 'solid-js';
import { ja } from '../../i18n/ja';
import { getPath, type TweakGroup } from './tweak';

/**
 * `?dev=tweak` の調整パネル。プリセットの値をスライダー・色選択・選択肢で変え、JSON として書き出す。
 * 変更はメモリ上だけに持つ（コードの値を変えたときに古い調整値が残って見えるのを避けるため）。
 */
export function TweakPanel(props: {
  value: object;
  groups: readonly TweakGroup[];
  onChange: (path: string, value: unknown) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = createSignal(false);
  const json = () => JSON.stringify(props.value, null, 2);
  let textarea: HTMLTextAreaElement | undefined;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json());
    } catch {
      textarea?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <aside
      aria-label={ja.explore.tweakTitle}
      class="fixed top-2 right-2 bottom-48 z-50 flex w-[min(22rem,calc(100vw-1rem))] flex-col rounded-2xl bg-slate-900/95 font-sans text-xs text-slate-100 shadow-2xl ring-1 ring-white/10 sm:top-4 sm:right-4"
    >
      <header class="flex items-center justify-between gap-2 border-b border-white/10 p-3">
        <h2 class="text-sm font-bold">{ja.explore.tweakTitle}</h2>
        <button
          type="button"
          class="rounded px-2 py-1 ring-1 ring-slate-600 hover:bg-slate-700"
          onClick={() => props.onClose()}
        >
          {ja.explore.close}
        </button>
      </header>
      <div class="flex-1 overflow-y-auto p-3">
        <For each={props.groups}>
          {(group) => (
            <fieldset class="mb-4">
              <legend class="mb-1 font-bold text-slate-300">{group.title}</legend>
              <For each={group.fields}>
                {(field) => {
                  const current = () => getPath(props.value, field.path);
                  const label = field.path.split('.').slice(1).join('.');
                  return (
                    <label class="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2 py-0.5">
                      <span class="truncate text-slate-400" title={field.path}>
                        {label}
                      </span>
                      <Switch>
                        <Match when={field.kind === 'color' && field}>
                          <input
                            type="color"
                            class="h-6 w-full cursor-pointer rounded bg-transparent"
                            value={String(current())}
                            onInput={(e) => props.onChange(field.path, e.currentTarget.value)}
                          />
                        </Match>
                        <Match when={field.kind === 'range' && field}>
                          {(f) => (
                            <input
                              type="range"
                              min={f().min}
                              max={f().max}
                              step={f().step}
                              value={Number(current())}
                              onInput={(e) => props.onChange(field.path, Number(e.currentTarget.value))}
                            />
                          )}
                        </Match>
                        <Match when={field.kind === 'select' && field}>
                          {(f) => (
                            <select
                              class="rounded bg-slate-800 px-1 py-0.5"
                              value={String(current())}
                              onChange={(e) => props.onChange(field.path, e.currentTarget.value)}
                            >
                              <For each={f().options}>{(o) => <option value={o}>{o}</option>}</For>
                            </select>
                          )}
                        </Match>
                      </Switch>
                      <span class="truncate text-right font-mono text-slate-300">{String(current())}</span>
                    </label>
                  );
                }}
              </For>
            </fieldset>
          )}
        </For>
        <textarea
          ref={textarea}
          readOnly
          class="h-32 w-full rounded bg-slate-950 p-2 font-mono text-[11px] text-slate-300"
          value={json()}
        />
      </div>
      <footer class="flex gap-2 border-t border-white/10 p-3">
        <button type="button" class="flex-1 rounded-lg bg-white px-3 py-1.5 font-bold text-slate-900" onClick={copy}>
          {copied() ? ja.explore.copied : ja.explore.copyJson}
        </button>
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 font-bold ring-1 ring-slate-600 hover:bg-slate-700"
          onClick={() => props.onReset()}
        >
          {ja.explore.reset}
        </button>
      </footer>
    </aside>
  );
}
