import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import type { BringCard } from '../../core/bring';
import { PLUGIN_NAME, pluginArchive } from '../../core/pluginExport';
import type { GameState } from '../../core/state';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { createZip } from '../../lib/zip';
import { pluginExportView } from '../../view/pluginExport';
import { Icon } from '../Icon';
import { ghostButton, panel, primaryButton } from '../parts';

const t = ja.pluginExport;

/**
 * ハーネスを持ち帰る（Phase 43）。会社で育てたハーネスと持ち込みカードを、Claude Code のプラグインの zip にしてダウンロードする。
 * ハーネスのレベル・中身・次に増えるもの・入れ方を出す。zip はこの場で作り（外部依存なし・無圧縮）、外部には送らない
 */
export function PluginExportSheet(props: {
  state: GameState | null;
  cards: readonly BringCard[];
  onClose: () => void;
}) {
  const view = createMemo(() => pluginExportView(props.state, props.cards));
  const [done, setDone] = createSignal(false);
  let el!: HTMLDivElement;
  let close!: HTMLButtonElement;
  onMount(() => {
    enter(el, 'below');
    close.focus();
  });

  const download = () => {
    const encoder = new TextEncoder();
    const zip = createZip(pluginArchive(view().exp).map((f) => ({ path: f.path, data: encoder.encode(f.content) })));
    const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${PLUGIN_NAME}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setDone(true);
  };

  return (
    <div
      class="pointer-events-auto absolute inset-0 z-50 overflow-y-auto bg-bg/70 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
      data-plugin-export
      onKeyDown={(e) => e.key === 'Escape' && props.onClose()}
    >
      <div ref={el} class={`${panel} mx-auto flex w-full max-w-2xl flex-col gap-3 p-3 sm:p-5`}>
        <header class="flex items-center justify-between gap-2">
          <h2 class="flex items-center gap-2 font-heading text-xl">
            <Icon name="release" />
            {t.title}
          </h2>
          <button ref={close} type="button" class={ghostButton} onClick={() => props.onClose()} data-export-close>
            {t.close}
          </button>
        </header>
        <p class="text-sm">{t.lead}</p>
        <p class="flex items-start gap-1 rounded-md border-2 border-line bg-sunken p-2 text-xs" data-export-template>
          <Icon name="warning" class="shrink-0" />
          {t.templateNote}
        </p>
        <Show when={view().noCompany}>
          <p class="text-xs text-ink-muted">{t.noCompany}</p>
        </Show>
        <p class="font-heading text-lg" data-export-level>
          {view().level}
        </p>
        <div class="grid gap-2 sm:grid-cols-2">
          <For each={view().groups}>
            {(g) => (
              <section class="rounded-md border-2 border-line bg-surface p-2" data-export-group={g.kind}>
                <h3 class="text-xs font-bold">
                  {g.label}（{g.items.length}）
                </h3>
                <ul class="text-xs">
                  <For each={g.items}>
                    {(item) => (
                      <li class="flex items-start gap-1" data-export-item={item.origin}>
                        <Icon
                          name={
                            item.origin === 'brought' ? 'handoff' : item.origin === 'workflow' ? 'workflow' : 'skill'
                          }
                          class="mt-0.5 shrink-0"
                        />
                        <span class="min-w-0 break-all">
                          {item.name}
                          <span class="text-[11px] text-ink-muted">（{item.originLabel}）</span>
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            )}
          </For>
        </div>
        <section class="flex items-start gap-1 text-xs" data-export-next>
          <Icon name="sparkle" class="shrink-0" />
          <span>
            <span class="font-bold">{t.next.title}：</span>
            {view().next}
          </span>
        </section>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class={primaryButton}
            disabled={view().exp.components.length === 0}
            onClick={download}
            data-export-download
          >
            <span class="flex items-center gap-1">
              <Icon name={done() ? 'success' : 'release'} />
              {t.download}
            </span>
          </button>
          <span class="text-xs text-ink-muted" aria-live="polite">
            {done() ? t.downloaded : view().fileCount}
          </span>
        </div>
        <section class="rounded-md bg-sunken p-2 text-xs" data-export-install>
          <h3 class="font-bold">{t.install.title}</h3>
          <ol class="list-decimal pl-5">
            <For each={t.install.steps}>{(step) => <li class="break-all">{step}</li>}</For>
          </ol>
        </section>
      </div>
    </div>
  );
}
