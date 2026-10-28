import { For, onMount } from 'solid-js';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { Icon } from '../Icon';
import { panel, smallButton } from '../parts';

const t = ja.unlocks;

/**
 * 新しくできること（解放）のカード。一度に解放された機能を1枚にまとめ、閉じるまで残す
 * （短いお知らせに積むと、納品の瞬間などに押し出されて読めないため）。置き場所はお知らせの列
 */
export function UnlockCard(props: { messages: readonly string[]; onClose: () => void }) {
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
        <For each={props.messages}>
          {(m) => (
            <li class="flex items-start gap-1.5">
              <span class="mt-0.5 shrink-0 rounded border-2 border-line bg-accent-200 px-1 text-[10px] font-bold">
                {t.badge}
              </span>
              <span>{m}</span>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
