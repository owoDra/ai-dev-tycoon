import { createMemo, createSignal, For, type JSX, onCleanup, onMount, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import { audio } from '../../audio/index';
import type { SheetLayout } from '../../content/look/layout';
import type { DeadlineStep, PriceStep } from '../../core/bidding';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { bidPreview, boardView, deadlineOptions, type InquiryView, priceOptions } from '../../view/board';
import { Icon } from '../Icon';
import { Keyed } from '../Keyed';
import { ghostButton, Meter, panel, primaryButton } from '../parts';

const t = ja.board;
const focusIcon = { price: 'money', quality: 'qa', deadline: 'clock' } as const;
const outcomeIcon = { won: 'trophy', lost: 'failure', passed: 'clock' } as const;

/**
 * 案件ボードのシート（ホームとプレイの上に、ほかのシートと同じ場所に開く）。営業日ごとに届く引き合いに見積（価格と納期）を出し、
 * その日の夕方の締切のコンペに勝つと受注する。見積は出す前に勝率を Before / After で見せる（Before は出した見積か基準の見積）。
 * 最近のコンペの結果も並べる。進行中の案件はドックのタブで、納品した案件は社員と Seat のシートの「実績」で見る。
 * 「もどる」はシートを閉じるだけ（タイトルへ戻るのは設定のメニューから）
 */
export function BoardSheet(props: {
  store: GameStore;
  layout: SheetLayout;
  bottom: number;
  viewHeight: number;
  /** 高さの上限（上の帯とドックの間。content/look/layout.ts の screenRegions） */
  maxHeight?: number;
  onClose: () => void;
}) {
  const view = createMemo(() => boardView(props.store.state()));
  let el!: HTMLElement;
  onMount(() => {
    audio.play('panelOpen');
    onCleanup(() => audio.play('panelClose'));
    enter(el, 'below');
    el.querySelector<HTMLButtonElement>('[data-submit]')?.focus();
  });
  return (
    <section
      ref={el}
      role="dialog"
      aria-modal="false"
      aria-label={t.board}
      data-board-sheet
      class={`${panel} absolute inset-x-0 mx-auto flex w-full flex-col gap-4 overflow-x-hidden overflow-y-auto rounded-b-none px-4 pt-3 pb-4`}
      style={{
        'max-width': `${props.layout.maxWidth}px`,
        bottom: `${props.bottom}px`,
        height: `${Math.min(props.viewHeight * props.layout.heightRatio, props.maxHeight ?? Number.POSITIVE_INFINITY)}px`,
      }}
    >
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-md border-[3px] border-line bg-accent-200 text-2xl">
            <Icon name="board" />
          </span>
          <div class="flex min-w-0 flex-col leading-tight">
            <h2 class="truncate font-heading text-lg">{t.board}</h2>
            <span class="flex items-center gap-1 text-xs font-bold tabular-nums" data-reputation>
              <Icon name="trophy" class="text-sm" />
              {t.reputation} {t.reputationValue(view().reputation)}
            </span>
          </div>
        </div>
        <button type="button" data-board-close class={ghostButton} onClick={() => props.onClose()}>
          {t.close}
        </button>
      </div>
      <p class="text-xs text-ink-muted">{t.lead}</p>
      <section class="flex flex-col gap-2">
        <h3 class="text-sm font-bold text-ink-muted">{t.inquiries}</h3>
        <Show when={view().inquiries.length > 0} fallback={<p class="text-sm text-ink-muted">{t.none}</p>}>
          <ul class="flex flex-col gap-2">
            <Keyed each={view().inquiries} by={(i) => i.projectId}>
              {(inq) => <InquiryCard store={props.store} inquiry={inq} />}
            </Keyed>
          </ul>
        </Show>
      </section>
      <Show when={view().results.length > 0}>
        <section class="flex flex-col gap-1">
          <h3 class="text-sm font-bold text-ink-muted">{t.results}</h3>
          <ul class="flex flex-col gap-1 text-sm">
            <Keyed each={view().results} by={(r) => r.projectId}>
              {(r) => (
                <li class="flex items-center gap-2" data-bid-result={r.outcome}>
                  <Icon name={outcomeIcon[r.outcome]} class="shrink-0 text-lg" />
                  <span class="font-bold">{t.outcomeLabel[r.outcome]}</span>
                  <span class="min-w-0 flex-1 truncate">{r.name}</span>
                  <Show when={r.outcome !== 'passed'}>
                    <span class="text-xs text-ink-muted tabular-nums">
                      {t.amount(r.amount)}・{t.winChance} {ja.score.percent(r.winChance)}
                    </span>
                  </Show>
                </li>
              )}
            </Keyed>
          </ul>
        </section>
      </Show>
    </section>
  );
}

/** 引き合い1件：条件・見積の選択（価格5段階 × 納期3段階）・勝率の Before / After・見積を出すボタン */
function InquiryCard(props: { store: GameStore; inquiry: InquiryView }) {
  const [price, setPrice] = createSignal<PriceStep>(props.inquiry.bid?.price ?? 'base');
  const [deadline, setDeadline] = createSignal<DeadlineStep>(props.inquiry.bid?.deadline ?? 'standard');
  const preview = createMemo(() => bidPreview(props.store.state(), props.inquiry.projectId, price(), deadline()));
  const submit = () =>
    props.store.dispatch({
      type: 'SubmitBid',
      projectId: props.inquiry.projectId,
      price: price(),
      deadline: deadline(),
    });
  const i = () => props.inquiry;
  return (
    <li class="flex flex-col gap-3 rounded-lg border-[3px] border-line bg-sunken p-3" data-inquiry={i().projectId}>
      <div class="flex items-start gap-3">
        <Icon name="project" class="shrink-0 text-3xl" />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <h3 class="font-heading text-base">{i().name}</h3>
          <p class="flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-ink-muted">
            <span>{ja.projectGen.industries[i().industry]}</span>
            <span>{t.size(i().size)}</span>
            <span class="flex items-center gap-1" data-focus={i().focus}>
              <Icon name={focusIcon[i().focus]} class="text-sm" />
              {t.focus[i().focus]}
            </span>
            <span>{t.rivals(i().rivals)}</span>
            <span>{ja.screens.select.tasks(i().tasks)}</span>
          </p>
          <p class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted tabular-nums">
            <span data-labor-estimate>{t.laborEstimate(ja.funds.oku(i().laborEstimate))}</span>
            <span>{t.base(i().base)}</span>
            <span>{t.budget(i().budget)}</span>
            <span>{t.standardDeadline(i().deadlineDays)}</span>
            <span class="flex items-center gap-1 font-bold" data-closes>
              <Icon name="clock" class="text-sm" />
              {t.closes(i().closes.day, i().closes.time)}
            </span>
          </p>
        </div>
      </div>
      <Choice label={t.price}>
        <For each={priceOptions}>
          {(o) => (
            <Option selected={price() === o.id} onClick={() => setPrice(o.id)} data={{ 'data-price': o.id }}>
              {t.priceOption[o.id]}
            </Option>
          )}
        </For>
      </Choice>
      <Choice label={t.deadline}>
        <For each={deadlineOptions.filter((o) => o.offered(i().deadlineDays))}>
          {(o) => (
            <Option selected={deadline() === o.id} onClick={() => setDeadline(o.id)} data={{ 'data-deadline': o.id }}>
              {t.deadlineOption[o.id]} {t.days(o.days(i().deadlineDays))}
            </Option>
          )}
        </For>
      </Choice>
      <div class="flex flex-col gap-1 rounded-md bg-surface p-2" data-win>
        <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span class="font-bold">
            {t.amountLabel} <span class="tabular-nums">{t.amount(preview().after.amount)}</span>
          </span>
          <span class="font-bold tabular-nums">
            {t.winChance} {ja.score.percent(preview().before.winChance)} →{' '}
            <span data-win-after>{ja.score.percent(preview().after.winChance)}</span>
          </span>
        </div>
        <Meter
          ratio={preview().after.winChance}
          label={ja.score.percent(preview().after.winChance)}
          color="bg-primary-400"
        />
        <Show when={preview().overBudget}>
          <p class="flex items-center gap-1 text-xs font-bold" data-over-budget>
            <Icon name="warning" class="text-sm" />
            {t.overBudget}
          </p>
        </Show>
        <p class="text-xs text-ink-muted">
          {t.proposal}：{t.proposalParts.reputation} {ja.score.percent(preview().proposal.reputation)}・
          {t.proposalParts.track} {ja.score.percent(preview().proposal.track)}・{t.proposalParts.ai}{' '}
          {ja.score.percent(preview().proposal.ai)}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" data-submit class={primaryButton} onClick={submit}>
          {i().bid ? t.resubmit : t.submit}
        </button>
        <Show when={i().bid}>
          {(bid) => (
            <span class="flex items-center gap-1 text-xs font-bold" data-submitted>
              <Icon name="success" class="text-sm" />
              {t.submitted(ja.score.percent(bid().winChance))}
            </span>
          )}
        </Show>
      </div>
    </li>
  );
}

function Choice(props: { label: string; children: JSX.Element }) {
  return (
    <fieldset class="flex flex-wrap items-center gap-2">
      <legend class="float-left w-10 text-xs font-bold text-ink-muted">{props.label}</legend>
      {props.children}
    </fieldset>
  );
}

function Option(props: {
  selected: boolean;
  onClick: () => void;
  data: Record<string, string>;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.selected}
      {...props.data}
      class="inline-flex min-h-9 items-center gap-1 rounded-md border-[3px] border-line px-2 text-xs font-bold"
      classList={{ 'bg-accent-300': props.selected, 'bg-surface': !props.selected }}
      onClick={() => props.onClick()}
    >
      <Show when={props.selected}>
        <Icon name="success" class="text-sm" />
      </Show>
      {props.children}
    </button>
  );
}
