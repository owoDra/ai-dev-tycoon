import { createMemo, createSignal, For, type JSX, onMount, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import type { DeadlineStep, PriceStep } from '../../core/bidding';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import {
  type BoardProjectView,
  bidPreview,
  boardView,
  deadlineOptions,
  type InquiryView,
  priceOptions,
} from '../../view/board';
import { paceText } from '../../view/hud';
import { Icon } from '../Icon';
import { Keyed } from '../Keyed';
import { ghostButton, Meter, panel, primaryButton } from '../parts';

const t = ja.board;
const focusIcon = { price: 'money', quality: 'qa', deadline: 'clock' } as const;

/**
 * 案件ボード。営業日ごとに届く引き合いに見積（価格と納期）を出し、締切のコンペに勝つと受注する。
 * 見積は出す前に勝率を Before / After で見せる（Before は出した見積か基準の見積）。
 * 進行中の案件・納品した案件・最近のコンペの結果も並べる。人と AI Worker は案件をまたいで共有する。
 */
export function ProjectBoard(props: {
  store: GameStore;
  /** 進行中の案件を開く */
  onOpen: (projectId: string) => void;
  onBack: () => void;
  /** パネルの上端に出す操作の列（日付と時刻・一時停止と速度。締切を見ながら考えるときに止められるようにする） */
  controls?: JSX.Element;
}) {
  const view = createMemo(() => boardView(props.store.state()));
  let el!: HTMLDivElement;
  onMount(() => {
    enter(el, 'below');
    el.querySelector<HTMLButtonElement>('[data-submit],[data-resume]')?.focus();
  });
  return (
    // 上端は左上の会社の帯（App.tsx）の下から始める。帯に見出しや操作が隠れないようにする
    <div class="absolute inset-0 flex justify-center bg-bg/40 px-4 pt-16 pb-4">
      <div ref={el} class={`${panel} flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto p-4 sm:p-6`}>
        {props.controls}
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h1 class="font-heading text-2xl">{t.board}</h1>
          <span class="flex items-center gap-1 text-sm font-bold tabular-nums" data-reputation>
            <Icon name="trophy" class="text-lg" />
            {t.reputation} {t.reputationValue(view().reputation)}
          </span>
        </div>
        <p class="text-xs text-ink-muted">{t.lead}</p>
        <section class="flex flex-col gap-2">
          <h2 class="text-sm font-bold text-ink-muted">{t.inquiries}</h2>
          <Show when={view().inquiries.length > 0} fallback={<p class="text-sm text-ink-muted">{t.none}</p>}>
            <ul class="flex flex-col gap-2">
              <Keyed each={view().inquiries} by={(i) => i.projectId}>
                {(inq) => <InquiryCard store={props.store} inquiry={inq} />}
              </Keyed>
            </ul>
          </Show>
        </section>
        <Section title={t.active} items={view().active}>
          {(p) => (
            <button type="button" data-resume class={ghostButton} onClick={() => props.onOpen(p.projectId)}>
              {t.resume}
            </button>
          )}
        </Section>
        <Section title={t.done} items={view().done} />
        <Show when={view().results.length > 0}>
          <section class="flex flex-col gap-1">
            <h2 class="text-sm font-bold text-ink-muted">{t.results}</h2>
            <ul class="flex flex-col gap-1 text-sm">
              <Keyed each={view().results} by={(r) => r.projectId}>
                {(r) => (
                  <li class="flex items-center gap-2" data-bid-result={r.won ? 'won' : 'lost'}>
                    <Icon name={r.won ? 'trophy' : 'failure'} class="shrink-0 text-lg" />
                    <span class="font-bold">{r.won ? t.wonLabel : t.lostLabel}</span>
                    <span class="min-w-0 flex-1 truncate">{r.name}</span>
                    <span class="text-xs text-ink-muted tabular-nums">
                      {t.amount(r.amount)}・{t.winChance} {ja.score.percent(r.winChance)}
                    </span>
                  </li>
                )}
              </Keyed>
            </ul>
          </section>
        </Show>
        <button type="button" class={`${ghostButton} self-start`} onClick={() => props.onBack()}>
          {ja.screens.select.back}
        </button>
      </div>
    </div>
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
            <span class="flex items-center gap-1">
              <Icon name="clock" class="text-sm" />
              {t.closesIn(i().closesIn / 60)}
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
        <For each={deadlineOptions}>
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

function Section(props: {
  title: string;
  items: readonly BoardProjectView[];
  children?: (p: BoardProjectView) => JSX.Element;
}) {
  return (
    <Show when={props.items.length > 0}>
      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-bold text-ink-muted">{props.title}</h2>
        <ul class="flex flex-col gap-2">
          <Keyed each={props.items} by={(p) => p.projectId}>
            {(p) => (
              <li
                class="flex flex-col gap-3 rounded-lg border-[3px] border-line bg-sunken p-3 sm:flex-row sm:items-center"
                data-board-project={p.projectId}
              >
                <div class="flex min-w-0 flex-1 items-center gap-3">
                  <Icon name={p.profitPerPersonDay === null ? 'project' : 'success'} class="shrink-0 text-3xl" />
                  <div class="flex min-w-0 flex-col gap-1">
                    <h3 class="font-heading text-base">{p.name}</h3>
                    <p class="flex flex-wrap gap-x-3 text-xs font-bold text-ink-muted">
                      <Show
                        when={p.profitPerPersonDay}
                        fallback={
                          <>
                            <span>{ja.project.deadline(p.deadlineDays)}</span>
                            <span>{ja.screens.select.revenue(p.revenue)}</span>
                            <span>{ja.screens.select.tasks(p.tasks)}</span>
                          </>
                        }
                      >
                        {(v) => <span>{paceText(v())}</span>}
                      </Show>
                    </p>
                    <Show when={p.progress > 0 && p.profitPerPersonDay === null}>
                      <Meter ratio={p.progress} label={ja.score.percent(p.progress)} color="bg-primary-400" />
                    </Show>
                  </div>
                </div>
                {props.children?.(p)}
              </li>
            )}
          </Keyed>
        </ul>
      </section>
    </Show>
  );
}
