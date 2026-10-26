import { Index, onCleanup, onMount, Show } from 'solid-js';
import { audio } from '../../audio/index';
import type { SheetLayout } from '../../content/look/layout';
import type { Command } from '../../core/commands';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import type { MemberView, SeatOptionView, SeatPreview, TeamView } from '../../view/team';
import { Icon } from '../Icon';
import { ghostButton, Meter, panel } from '../parts';

const t = ja.team;

/** 差分の1行（AI 容量と費用）。増えるものは色だけでなく符号でも示す */
export function SeatPreviewLine(props: { preview: SeatPreview }) {
  return (
    <span class="flex flex-wrap gap-x-2 text-xs font-bold tabular-nums" data-seat-preview>
      <span class={props.preview.capacity > 0 ? 'text-success-700' : 'text-danger-700'}>
        {t.capacity(props.preview.capacity)}
      </span>
      <span class={props.preview.monthlyCost > 0 ? 'text-danger-700' : 'text-success-700'}>
        {t.cost(props.preview.monthlyCost)}
      </span>
    </span>
  );
}

/**
 * 社員と Seat の画面（企画書6章・47章）。社員ごとに Seat（Standard / Premium）を選ぶ。
 * 選んでいない方の選択肢には、選んだときの差分「AI 容量 +400% / 費用 +¥XX,XXX / 月」を常に出し、押すと確定する
 * （確定のトースト「✓ Premiumへ変更」は PlayScreen が SeatChanged から出す）。
 * AI ワーカーを運用している人だけが Seat の使用量を使うので、その人にだけ今日の使用量のメーターを出す。
 * 使用量は時間とともに変わるので、行は Index で並べて要素を作り直さない（押したボタンのフォーカスを保つ）。
 */
export function TeamSheet(props: {
  view: TeamView;
  layout: SheetLayout;
  bottom: number;
  viewHeight: number;
  dispatch: (command: Command) => void;
  onClose: () => void;
}) {
  let el!: HTMLElement;
  onMount(() => {
    audio.play('panelOpen');
    onCleanup(() => audio.play('panelClose'));
    enter(el, 'below');
  });
  return (
    <section
      ref={el}
      role="dialog"
      aria-modal="false"
      aria-label={t.title}
      data-team-sheet
      class={`${panel} absolute inset-x-0 mx-auto flex w-full flex-col gap-3 overflow-x-hidden overflow-y-auto rounded-b-none px-4 pt-3 pb-4`}
      style={{
        'max-width': `${props.layout.maxWidth}px`,
        bottom: `${props.bottom}px`,
        height: `${props.viewHeight * props.layout.heightRatio}px`,
      }}
    >
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-md border-[3px] border-line bg-accent-200 text-2xl">
            <Icon name="seat" />
          </span>
          <div class="flex min-w-0 flex-col leading-tight">
            <h2 class="truncate font-heading text-lg">{t.title}</h2>
            <span class="text-xs font-bold text-ink-muted">{t.lead}</span>
          </div>
        </div>
        <button type="button" class={ghostButton} onClick={() => props.onClose()}>
          {t.close}
        </button>
      </div>
      <ul class="flex flex-col gap-2">
        <Index each={props.view.members}>
          {(m) => <MemberCard member={m()} editable={props.view.editable} dispatch={props.dispatch} />}
        </Index>
      </ul>
      <dl class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <div class="flex items-center gap-2">
          <dt class="text-ink-muted">{t.total}</dt>
          <dd class="font-bold tabular-nums" data-team-total>
            {t.monthly(props.view.monthlyTotal)}
          </dd>
        </div>
        <Show when={props.view.model}>
          {(model) => (
            <div class="flex items-center gap-2">
              <dt class="flex items-center gap-1 text-ink-muted">
                <Icon name="model" />
                {t.model}
              </dt>
              <dd class="font-bold">
                {model().name}（{t.modelUsage(model().usagePerMinute)}）
              </dd>
            </div>
          )}
        </Show>
      </dl>
    </section>
  );
}

function MemberCard(props: { member: MemberView; editable: boolean; dispatch: (command: Command) => void }) {
  const m = () => props.member;
  return (
    <li class="flex flex-col gap-2 rounded-lg border-[3px] border-line bg-sunken p-3" data-member={m().id}>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <Icon name="human" class="shrink-0 text-2xl" />
          <div class="flex min-w-0 flex-col leading-tight">
            <span class="truncate font-bold">{t.member(m().name, m().role)}</span>
            <Show when={m().strengths.length > 0}>
              <span class="text-xs text-ink-muted">{t.strengths(m().strengths.join('・'))}</span>
            </Show>
          </div>
        </div>
        <Show when={m().operator}>
          <span class="flex items-center gap-1 rounded-full border-2 border-line bg-accent-200 px-2 text-xs font-bold">
            <Icon name="ai" />
            {t.operator}
          </span>
        </Show>
      </div>
      <Show when={m().usage} fallback={<span class="text-xs text-ink-muted">{t.noUsage}</span>}>
        {(u) => (
          <div class="flex flex-wrap items-center gap-2 text-xs font-bold" data-usage>
            <span class="text-ink-muted">{t.usage}</span>
            <Meter
              ratio={Math.min(1, u().used / u().limit)}
              label={t.usageValue(u().used, u().limit)}
              color={u().over ? 'bg-danger-500' : 'bg-primary-400'}
              class="w-24"
            />
            <span class="tabular-nums">{t.usageValue(u().used, u().limit)}</span>
            <Show when={u().over}>
              <span class="flex items-center gap-1 text-danger-700" data-over-limit>
                <Icon name="warning" />
                {t.overLimit}
              </span>
            </Show>
          </div>
        )}
      </Show>
      <fieldset class="grid grid-cols-2 gap-2">
        <legend class="sr-only">{t.seatGroup(m().name)}</legend>
        <Index each={m().options}>
          {(o) => <SeatButton option={o()} editable={props.editable} dispatch={props.dispatch} />}
        </Index>
      </fieldset>
    </li>
  );
}

function SeatButton(props: { option: SeatOptionView; editable: boolean; dispatch: (command: Command) => void }) {
  const o = () => props.option;
  return (
    <button
      type="button"
      aria-pressed={o().selected}
      disabled={!props.editable && !o().selected}
      data-seat-option={o().id}
      class={`flex min-h-11 flex-col items-start justify-center rounded-md border-[3px] border-line px-3 py-1 text-left text-sm font-bold disabled:opacity-60 ${
        o().selected ? 'bg-accent-200' : 'bg-surface'
      }`}
      onClick={() => {
        const command = o().command;
        if (command) props.dispatch(command);
      }}
    >
      <span class="flex items-center gap-1">
        <Show when={o().selected}>
          <Icon name="success" />
        </Show>
        {o().label}
      </span>
      <Show when={o().preview} fallback={<span class="text-[11px] text-ink-muted">{t.current}</span>}>
        {(p) => <SeatPreviewLine preview={p()} />}
      </Show>
    </button>
  );
}
