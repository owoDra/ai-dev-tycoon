import { For, onMount, Show } from 'solid-js';
import type { MenuSpot } from '../../content/unlocks';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { Icon } from '../Icon';
import { panel, smallButton } from '../parts';

const t = ja.unlocks;

/** 解放のカードの1行。spot はその機能を開くメニューの入口（ないものは文言だけ） */
export interface UnlockNote {
  readonly text: string;
  readonly spot?: MenuSpot;
}

/**
 * 新しくできること（解放）のカード。一度に解放された機能を1枚にまとめ、閉じるまで残す
 * （短いお知らせに積むと、納品の瞬間などに押し出されて読めないため）。置き場所はお知らせの列。
 * 入口のある機能には「開く」を添え、いま開けない（案件を開いていないと使えない）ものはその旨を添える
 */
export function UnlockCard(props: {
  notes: readonly UnlockNote[];
  /** その入口を今開く関数（開けなければ null） */
  opener: (spot: MenuSpot) => (() => void) | null;
  onOpen: (note: UnlockNote) => void;
  onClose: () => void;
}) {
  let el!: HTMLElement;
  onMount(() => enter(el, 'above'));
  return (
    <section
      ref={el}
      role="status"
      data-unlock-card
      data-fit-item
      class={`${panel} pointer-events-auto flex w-full max-w-80 flex-col gap-1 px-4 py-3`}
    >
      <div class="flex items-center justify-between gap-2">
        <span class="flex items-center gap-1 text-[11px] font-bold text-ink-muted">
          <Icon name="success" tone="success" />
          {t.cardTitle}
        </span>
        <button type="button" class={smallButton} onClick={() => props.onClose()}>
          {t.close}
        </button>
      </div>
      <ul class="flex flex-col gap-1 text-sm leading-snug">
        <For each={props.notes}>
          {(note) => {
            const open = () => (note.spot ? props.opener(note.spot) : null);
            return (
              <li class="flex items-start gap-1.5" data-unlock-note={note.spot ?? ''}>
                <span class="mt-0.5 shrink-0 rounded border-2 border-line bg-accent-200 px-1 text-[10px] font-bold">
                  {t.badge}
                </span>
                <span class="min-w-0 flex-1">
                  {note.text}
                  <Show when={note.spot && !open()}>
                    <span class="block text-[11px] text-ink-muted">{t.needsProject}</span>
                  </Show>
                </span>
                <Show when={open()}>
                  {(run) => (
                    <button
                      type="button"
                      class="shrink-0 rounded-full border-2 border-line bg-primary-200 px-2 text-xs font-bold hover:bg-primary-300"
                      data-unlock-open={note.spot}
                      onClick={() => {
                        run()();
                        props.onOpen(note);
                      }}
                    >
                      {t.open}
                    </button>
                  )}
                </Show>
              </li>
            );
          }}
        </For>
      </ul>
    </section>
  );
}
