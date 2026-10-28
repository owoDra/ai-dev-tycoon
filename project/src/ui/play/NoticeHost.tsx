import { For, onMount } from 'solid-js';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { Icon } from '../Icon';
import type { Notice } from '../notices';

/** 短いお知らせの表示。お知らせの列に小さく出し、押せないので下のワールドやボタンの操作を妨げない */
export function NoticeHost(props: { notices: readonly Notice[] }) {
  return (
    <div
      role="status"
      aria-label={ja.notices.region}
      class="pointer-events-none flex w-full shrink-0 flex-col items-end gap-1.5"
    >
      <For each={props.notices}>{(n) => <NoticeChip notice={n} />}</For>
    </div>
  );
}

function NoticeChip(props: { notice: Notice }) {
  let el!: HTMLDivElement;
  onMount(() => enter(el, 'above'));
  return (
    <div
      ref={el}
      class="flex max-w-full items-center gap-1.5 rounded-full border-[3px] border-line bg-surface px-3 py-1 text-sm font-bold shadow-pop"
    >
      <Icon name={props.notice.icon} tone={props.notice.tone} class="text-lg" />
      <span class="truncate">{props.notice.text}</span>
    </div>
  );
}
