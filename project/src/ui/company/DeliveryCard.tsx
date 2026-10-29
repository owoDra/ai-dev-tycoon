import { For, onCleanup, onMount, Show } from 'solid-js';
import { balance } from '../../content/balance';
import { countUp, enter, pop } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import type { DeliveryBreakdown } from '../../view/evaluation';
import type { DeliveryView } from '../../view/fiscal';
import { paceText } from '../../view/hud';
import { Icon } from '../Icon';
import { ghostButton, Meter, panel, primaryButton, smallButton, stateColor } from '../parts';

const t = ja.delivery;
const e = ja.evaluation;

/**
 * 直轄の案件の納品のモーダル。一時停止した上に出し、利益 / 人日 をカウントアップして、利益・納期・品質・評判の変化を見せる。
 * 「振り返りを見る」でその案件の結果画面を開き、「続ける」で閉じて再開する
 */
export function DeliveryModal(props: { delivery: DeliveryView; onReview: () => void; onNext: () => void }) {
  let el!: HTMLDivElement;
  let big!: HTMLSpanElement;
  let stop = () => {};
  const d = () => props.delivery;
  onMount(() => {
    enter(el, 'below');
    el.querySelector<HTMLButtonElement>('[data-next]')?.focus();
    stop = countUp(big, 0, d().profitPerPersonDay, paceText);
  });
  onCleanup(() => stop());
  return (
    <div class="absolute inset-0 z-40 flex items-center justify-center bg-line/30 p-4" data-delivery-modal>
      <div
        ref={el}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delivery-title"
        class={`${panel} flex max-h-full w-full max-w-sm flex-col gap-3 overflow-y-auto p-5`}
      >
        <p class="text-xs font-bold text-ink-muted">{t.heading}</p>
        <h2 id="delivery-title" class="flex items-center gap-2 font-heading text-xl">
          <Icon name="trophy" /> {t.title(d().name)}
        </h2>
        <section class="flex flex-col items-center gap-1 text-center">
          <span class="text-xs font-bold text-ink-muted">{ja.score.profitPerPersonDay}</span>
          <span ref={big} class="font-heading text-3xl tabular-nums" data-delivery-ppd>
            {paceText(d().profitPerPersonDay)}
          </span>
          <span class="text-sm tabular-nums">
            {ja.score.profit} {ja.score.yen(d().profit)}
          </span>
        </section>
        <dl class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
          <dt class="font-bold">{t.deadline}</dt>
          <dd class="flex items-center gap-1" data-delivery-on-time={d().onTime}>
            <Icon name={d().onTime ? 'success' : 'warning'} /> {d().onTime ? t.onTime : t.late}
          </dd>
          <dt class="font-bold">{ja.score.quality}</dt>
          <dd class="flex flex-col gap-1" data-delivery-quality={d().qualityGood ? 'good' : 'low'}>
            <Meter
              ratio={d().quality}
              label={ja.score.percent(d().quality)}
              color={d().qualityGood ? stateColor.done : stateColor.caution}
              class="w-full"
            />
            <span class="flex items-center gap-1 text-xs">
              <Icon name={d().qualityGood ? 'success' : 'warning'} />
              {d().qualityGood ? ja.score.percent(d().quality) : t.qualityLow}
            </span>
          </dd>
          <dt class="font-bold">{ja.board.reputation}</dt>
          <dd class="flex flex-col" data-delivery-reputation>
            <span class="flex items-center gap-1">
              <Icon name={d().reputation >= 0 ? 'success' : 'warning'} /> {t.reputation(d().reputation)}
            </span>
            <Show when={d().breakdown?.reputation}>
              {(r) => (
                <span class="text-xs text-ink-muted" data-reputation-why>
                  {e.reputationWhy(r().timing, r().quality, ja.score.percent(d().quality))}
                </span>
              )}
            </Show>
          </dd>
        </dl>
        <Show when={d().breakdown}>{(b) => <Breakdown breakdown={b()} />}</Show>
        <div class="flex flex-wrap justify-end gap-2">
          <button type="button" class={ghostButton} data-review onClick={() => props.onReview()}>
            {t.review}
          </button>
          <button type="button" class={primaryButton} data-next onClick={() => props.onNext()}>
            {t.next}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 管理者に任せた案件の納品のカード。案件を納品するたびにお知らせの列へ積み、全画面に切り替えずに成果を知らせる（操作を止めない）。
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

/**
 * 納品の評価の内訳：利益の式（売上から費用を引いて利益）と、それを人日で割って月の利益ペースにする式、
 * 品質が基準を下回った工程のうち一番低いもの（次に直す場所）とその任せ方に合った次の一手
 */
function Breakdown(props: { breakdown: DeliveryBreakdown }) {
  const b = () => props.breakdown;
  return (
    <section class="flex flex-col gap-2 text-sm" data-breakdown>
      <h3 class="text-xs font-bold text-ink-muted">{e.breakdown}</h3>
      <dl class="grid grid-cols-[1fr_auto] gap-x-3 tabular-nums">
        <For each={b().lines.filter((l) => l.id === 'revenue' || l.amount !== 0)}>
          {(l) => (
            <>
              <dt>{e.lines[l.id]}</dt>
              <dd class="text-right" data-line={l.id}>
                {e.signed(l.amount, l.id !== 'revenue')}
              </dd>
            </>
          )}
        </For>
        <dt class="border-t-2 border-line font-bold">{e.profit}</dt>
        <dd class="border-t-2 border-line text-right font-bold" data-line="profit">
          {ja.score.yen(b().profit)}
        </dd>
      </dl>
      <p class="text-xs text-ink-muted" data-formula>
        {e.formula(b().personDays, balance.score.workDaysPerMonth)}
      </p>
      <div class="flex flex-col gap-0.5 rounded-md border-2 border-line bg-sunken p-2 text-xs" data-weakest>
        <Show
          when={b().weakest}
          fallback={
            <span class="flex items-center gap-1">
              <Icon name="success" /> {e.allGood(ja.score.percent(b().qualityPivot))}
            </span>
          }
        >
          {(w) => (
            <>
              <span class="flex items-center gap-1 font-bold">
                <Icon name="warning" /> {e.weakest}：
                {e.weakestLine(w().task, ja.modes[w().mode], ja.score.percent(w().quality))}
              </span>
              <span>{e.fix[w().mode]}</span>
            </>
          )}
        </Show>
      </div>
    </section>
  );
}
