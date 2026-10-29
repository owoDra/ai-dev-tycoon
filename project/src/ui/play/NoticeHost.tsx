import { createSignal, For, onMount, Show } from 'solid-js';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { Icon } from '../Icon';
import type { Notice } from '../notices';

/**
 * 短いお知らせの表示。お知らせの列に小さく出し、押せないので下のワールドやボタンの操作を妨げない。
 * action を添えたお知らせだけ、そのボタンを押せる。
 * 記録（level: record）はトーストに出さず、列の最後の「記録」のボタンにまとめ、押すと一覧を開く（まだ見ていない数を添える）
 */
export function NoticeHost(props: {
  notices: readonly Notice[];
  /** 記録（トーストに出さないお知らせ。新しい順） */
  records?: readonly Notice[];
  unread?: number;
  onReadAll?: () => void;
}) {
  const [open, setOpen] = createSignal(false);
  return (
    <div
      role="status"
      aria-label={ja.notices.region}
      class="pointer-events-none flex w-full shrink-0 flex-col items-end gap-1.5"
    >
      <For each={props.notices}>{(n) => <NoticeChip notice={n} />}</For>
      <Show when={(props.records?.length ?? 0) > 0}>
        <button
          type="button"
          data-fit-item
          data-records-toggle
          aria-expanded={open()}
          class="pointer-events-auto flex items-center gap-1 rounded-full border-2 border-line bg-surface px-2 text-xs font-bold"
          onClick={() => {
            setOpen((o) => !o);
            props.onReadAll?.();
          }}
        >
          <Icon name="board" class="text-sm" />
          {ja.notices.records}
          <Show when={(props.unread ?? 0) > 0}>
            <span class="rounded-full bg-accent-300 px-1 tabular-nums">{props.unread}</span>
          </Show>
        </button>
        <Show when={open()}>
          <ul
            data-fit-item
            data-records
            class="pointer-events-auto flex max-h-48 w-full max-w-80 flex-col gap-1 overflow-y-auto rounded-lg border-[3px] border-line bg-surface p-2 text-xs"
          >
            <For each={props.records}>
              {(n) => (
                <li class="flex items-center gap-1.5">
                  <Icon name={n.icon} tone={n.tone} class="shrink-0 text-sm" />
                  <span class="min-w-0">{n.text}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
}

function NoticeChip(props: { notice: Notice }) {
  let el!: HTMLDivElement;
  onMount(() => enter(el, 'above'));
  return (
    <div
      ref={el}
      data-fit-item
      class="flex max-w-full items-center gap-1.5 rounded-full border-[3px] border-line bg-surface px-3 py-1 text-sm font-bold shadow-pop"
    >
      <Icon name={props.notice.icon} tone={props.notice.tone} class="text-lg" />
      <span class="truncate">{props.notice.text}</span>
      <Show when={props.notice.action}>
        {(action) => (
          <button
            type="button"
            data-notice-action
            class="pointer-events-auto -my-0.5 -mr-1.5 shrink-0 rounded-full border-2 border-line bg-primary-200 px-2 text-xs font-bold hover:bg-primary-300"
            onClick={() => action().run()}
          >
            {action().label}
          </button>
        )}
      </Show>
    </div>
  );
}
