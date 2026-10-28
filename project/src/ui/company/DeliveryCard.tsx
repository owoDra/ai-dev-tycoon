import { For, onMount } from 'solid-js';
import { pop } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import type { DeliveryView } from '../../view/fiscal';
import { paceText } from '../../view/hud';
import { Icon } from '../Icon';
import { panel, smallButton } from '../parts';

const t = ja.delivery;

/**
 * 納品のカード。案件を納品するたびにお知らせの列へ積み、全画面に切り替えずに成果を知らせる（操作を止めない）。
 * 「振り返りを見る」で、その案件の結果画面（振り返りの4段構成）を開ける
 */
export function DeliveryCards(props: {
  cards: readonly DeliveryView[];
  onReview: (projectId: string) => void;
  onClose: (projectId: string) => void;
}) {
  return (
    <div class="pointer-events-none flex w-full shrink-0 flex-col items-end gap-2" aria-live="polite">
      <For each={props.cards}>{(c) => <Card card={c} onReview={props.onReview} onClose={props.onClose} />}</For>
    </div>
  );
}

function Card(props: { card: DeliveryView; onReview: (id: string) => void; onClose: (id: string) => void }) {
  let el!: HTMLElement;
  onMount(() => pop(el, 1));
  const c = () => props.card;
  return (
    <section
      ref={el}
      class={`${panel} pointer-events-auto flex w-full max-w-72 flex-col gap-1 p-3 text-sm`}
      data-delivery={c().projectId}
      data-fit-item
    >
      <p class="flex items-center gap-1 font-heading">
        <Icon name="trophy" /> {t.title(c().name)}
      </p>
      <p class="flex flex-wrap gap-x-2 tabular-nums">
        <span class="font-bold">{paceText(c().profitPerPersonDay)}</span>
        <span>{ja.score.yen(c().profit)}</span>
      </p>
      <p class="flex flex-wrap gap-x-2 text-xs">
        <span>
          <Icon name={c().onTime ? 'success' : 'warning'} /> {c().onTime ? t.onTime : t.late}
        </span>
        <span>
          {ja.score.quality} {ja.score.percent(c().quality)}
        </span>
        <span>{t.reputation(c().reputation)}</span>
      </p>
      <div class="flex justify-between">
        <button type="button" class={smallButton} data-review onClick={() => props.onReview(c().projectId)}>
          {t.review}
        </button>
        <button type="button" class={smallButton} data-close onClick={() => props.onClose(c().projectId)}>
          {t.close}
        </button>
      </div>
    </section>
  );
}
