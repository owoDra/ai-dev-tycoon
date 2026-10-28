import { createMemo, onCleanup, onMount, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import { audio } from '../../audio/index';
import type { SheetLayout } from '../../content/look/layout';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { boardView, type InquiryView } from '../../view/board';
import { Icon } from '../Icon';
import { Keyed } from '../Keyed';
import { ghostButton, panel, primaryButton } from '../parts';

const t = ja.board;
const contractIcon = { strict: 'warning', lenient: 'clock' } as const;

/**
 * 案件ボードのシート（ホームとプレイの上に、ほかのシートと同じ場所に開く）。営業日ごとに届く引き合いを見て、選べば必ず受注できる
 * （core/orders.ts）。条件は報酬・納期・規模・契約（期限厳守か、炎上しても続行か）で、契約はアイコンとラベルで示す。
 * 同時に進められる数に達していたら受注のボタンを押せない表示にして、理由を添える。「閉じる」はシートを閉じるだけ
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
    el.querySelector<HTMLButtonElement>('[data-accept]')?.focus();
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
        <h3 class="flex items-center justify-between text-sm font-bold text-ink-muted">
          {t.inquiries}
          <span class="tabular-nums" data-running>
            {t.running(view().running, view().max)}
          </span>
        </h3>
        <Show when={view().inquiries.length > 0} fallback={<p class="text-sm text-ink-muted">{t.none}</p>}>
          <ul class="flex flex-col gap-2">
            <Keyed each={view().inquiries} by={(i) => i.projectId}>
              {(inq) => <InquiryCard store={props.store} inquiry={inq} />}
            </Keyed>
          </ul>
        </Show>
      </section>
    </section>
  );
}

/** 引き合い1件：条件（報酬・納期・規模・契約）と、受注するボタン */
function InquiryCard(props: { store: GameStore; inquiry: InquiryView }) {
  const i = () => props.inquiry;
  return (
    <li class="flex flex-col gap-2 rounded-lg border-[3px] border-line bg-sunken p-3" data-inquiry={i().projectId}>
      <div class="flex items-start gap-3">
        <Icon name="project" class="shrink-0 text-3xl" />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <h3 class="font-heading text-base">{i().name}</h3>
          <p class="flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-ink-muted">
            <span>{ja.projectGen.industries[i().industry]}</span>
            <span>{t.size(i().size)}</span>
            <span>{ja.screens.select.tasks(i().tasks)}</span>
          </p>
          <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums">
            <span class="font-bold">{t.amount(i().revenue)}</span>
            <span>{t.deadlineDays(i().deadlineDays)}</span>
            <span
              class="flex items-center gap-1 rounded-full border-2 border-line px-2 text-xs font-bold"
              classList={{ 'bg-danger-200': i().contract === 'strict', 'bg-surface': i().contract !== 'strict' }}
              title={t.contractHint[i().contract]}
              data-contract={i().contract}
            >
              <Icon name={contractIcon[i().contract]} class="text-sm" />
              {t.contract[i().contract]}
            </span>
            <span class="flex items-center gap-1 text-xs text-ink-muted" data-closes>
              <Icon name="clock" class="text-sm" />
              {t.closes(i().closes.day, i().closes.time)}
            </span>
          </p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-accept
          class={`${primaryButton} aria-disabled:opacity-50`}
          aria-disabled={i().blocked !== null}
          onClick={() => {
            if (i().blocked === null) props.store.dispatch({ type: 'AcceptOrder', projectId: i().projectId });
          }}
        >
          {t.accept}
        </button>
        <Show when={i().blocked === 'full'}>
          <span class="flex items-center gap-1 text-xs font-bold text-ink-muted" data-blocked>
            <Icon name="warning" class="text-sm" />
            {t.full}
          </span>
        </Show>
      </div>
    </li>
  );
}
