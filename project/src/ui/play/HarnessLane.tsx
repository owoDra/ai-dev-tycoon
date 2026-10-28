import { For, Show } from 'solid-js';
import { ja } from '../../i18n/ja';
import type {
  HarnessRowId,
  HarnessView,
  LaneItem,
  MistakeView,
  PresetView,
  RulePlace,
  RuleSortView,
  SlotView,
} from '../../view/harness';
import { Icon } from '../Icon';
import { Keyed } from '../Keyed';

const t = ja.harness;

/** ミスのカードの色・アイコン（色だけでなくアイコンと文字でも示す） */
const toneClass: Readonly<Record<MistakeView['tone'], string>> = {
  ok: 'bg-success-100 text-success-800',
  maybe: 'bg-warning-100 text-warning-800',
  human: 'bg-warning-100 text-warning-800',
  escape: 'bg-danger-100 text-danger-800',
};
const toneIcon = { ok: 'success', maybe: 'warning', human: 'human', escape: 'failure' } as const;

/**
 * Harness Builder の道（D6 案D）。受け取る → 計画 → 道具を使う → 書き換える → 確かめる → 渡す の地点に丸いスロットを置き、
 * 地点の間に Hook の盾、道の下に権限の鍵と Routine の時計を置く。幅が狭いときは道を縦にする（container query）。
 * ラベルは丸の外（下）に置き、丸の中はアイコンだけにする（文字が枠からはみ出さない）
 */
export function HarnessLane(props: {
  view: HarnessView;
  onOpen: (row: HarnessRowId) => void;
  onPreset: (preset: PresetView) => void;
  onPresetFocus: (preset: PresetView | null) => void;
}) {
  return (
    <div class="@container flex flex-col gap-3" data-harness-card>
      <Show when={props.view.presets.length > 0}>
        <fieldset class="flex flex-wrap items-center gap-1.5">
          <legend class="float-left mr-1.5 text-xs font-bold">{t.presetsTitle}</legend>
          <Keyed each={props.view.presets} by={(p) => p.id}>
            {(p) => (
              <button
                type="button"
                data-harness-preset={p.id}
                title={p.aim}
                class="min-h-9 rounded-full border-[3px] border-line bg-surface px-3 font-heading text-xs shadow-pop"
                onMouseEnter={() => props.onPresetFocus(p)}
                onFocus={() => props.onPresetFocus(p)}
                onMouseLeave={() => props.onPresetFocus(null)}
                onClick={() => props.onPreset(p)}
              >
                {p.label}
              </button>
            )}
          </Keyed>
        </fieldset>
      </Show>

      <section aria-label={t.lane.title} class="rounded-xl border-[3px] border-line bg-surface p-2 @2xl:p-3">
        <ol class="relative flex flex-col gap-1 @2xl:flex-row @2xl:items-start @2xl:justify-between @2xl:gap-0">
          <span
            aria-hidden="true"
            class="pointer-events-none absolute hidden rounded-full border-2 border-line bg-accent-100 @2xl:block @2xl:inset-x-6 @2xl:top-[2.1rem] @2xl:bottom-auto @2xl:left-6 @2xl:h-3 @2xl:w-auto"
          />
          <Keyed each={props.view.lane} by={laneKey}>
            {(item) => (
              <li
                class={`relative min-w-0 ${item.kind === 'shield' ? '@2xl:w-14 @2xl:flex-none' : item.slots.length > 1 ? '@2xl:flex-[2]' : '@2xl:flex-1'}`}
              >
                {item.kind === 'station' ? (
                  <Station item={item} onOpen={props.onOpen} />
                ) : (
                  <Shield item={item} onOpen={props.onOpen} />
                )}
              </li>
            )}
          </Keyed>
        </ol>
        <div class="mt-2 flex flex-wrap gap-2 border-t-[3px] border-line/15 pt-2">
          <Keyed each={props.view.under} by={(u) => u.row}>
            {(u) => (
              <button
                type="button"
                data-harness-row={u.row}
                disabled={u.locked}
                class="flex min-h-11 min-w-0 flex-1 basis-40 items-center gap-2 rounded-lg border-[3px] border-line bg-sunken px-2 text-left disabled:opacity-50"
                onClick={() => props.onOpen(u.row)}
              >
                <Icon name={u.locked ? 'permission' : u.icon} class="shrink-0 text-lg" />
                <span class="flex min-w-0 flex-col leading-tight">
                  <span class="text-[11px] font-bold text-ink-muted">{u.label}</span>
                  <span class="truncate font-heading text-sm">{u.locked ? t.lane.lockedSlot : u.summary}</span>
                </span>
              </button>
            )}
          </Keyed>
        </div>
      </section>

      <section aria-label={t.mistakesTitle} class="flex flex-col gap-1.5">
        <h3 class="text-sm font-bold">{t.mistakesTitle}</h3>
        <ul class="grid grid-cols-1 gap-1.5 @md:grid-cols-2 @2xl:grid-cols-5">
          <Keyed each={props.view.mistakes} by={(m) => m.id}>
            {(m) => (
              <li
                data-mistake={m.id}
                data-tone={m.tone}
                class="flex min-w-0 flex-col gap-1 rounded-lg border-2 border-line/30 bg-sunken p-2"
              >
                <span class="text-xs font-bold">{m.label}</span>
                <span
                  class={`flex items-start gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold ${toneClass[m.tone]}`}
                >
                  <Icon name={toneIcon[m.tone]} class="mt-px shrink-0" />
                  <span class="min-w-0 break-words">{m.where}</span>
                </span>
              </li>
            )}
          </Keyed>
        </ul>
      </section>
    </div>
  );
}

const laneKey = (item: LaneItem) => (item.kind === 'station' ? item.id : item.row);

function Station(props: { item: Extract<LaneItem, { kind: 'station' }>; onOpen: (row: HarnessRowId) => void }) {
  return (
    <div class="flex items-center gap-2 @2xl:flex-col @2xl:gap-1">
      <span class="w-[4.3rem] shrink-0 text-[11px] font-bold text-ink-muted @2xl:w-auto @2xl:text-center @2xl:text-[10px] @2xl:whitespace-nowrap">
        {props.item.no}. {props.item.title}
      </span>
      <div class="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1.5 @2xl:flex-none @2xl:flex-nowrap @2xl:justify-center @2xl:gap-1.5">
        <Keyed each={props.item.slots} by={(s) => s.chip}>
          {(slot) => <Slot slot={slot} onOpen={props.onOpen} />}
        </Keyed>
      </div>
    </div>
  );
}

function Slot(props: { slot: SlotView; onOpen: (row: HarnessRowId) => void }) {
  const s = () => props.slot;
  const filled = () => s().count > 0;
  return (
    <button
      type="button"
      data-harness-row={s().row}
      data-slot={s().chip}
      disabled={s().locked}
      aria-label={`${s().chip}：${s().locked ? t.lane.lockedSlot : s().summary || t.lane.empty}`}
      class="group flex shrink-0 items-center gap-1.5 text-left disabled:opacity-45 @2xl:w-[5rem] @2xl:flex-none @2xl:flex-col @2xl:gap-1 @2xl:text-center"
      onClick={() => props.onOpen(s().row)}
    >
      <span
        class={`relative flex size-11 shrink-0 items-center justify-center rounded-full border-[3px] border-line text-xl @2xl:size-14 @2xl:text-2xl ${
          filled() ? 'bg-accent-300 shadow-pop' : 'border-dashed bg-surface'
        }`}
      >
        <Icon name={s().locked ? 'permission' : s().icon} />
        <Show when={s().count > 1}>
          <span class="absolute -top-1 -right-1 rounded-full border-2 border-line bg-surface px-1 font-heading text-[10px] leading-tight">
            {s().count}
          </span>
        </Show>
      </span>
      <span class="flex min-w-0 flex-col items-start gap-0.5 @2xl:w-full @2xl:items-center">
        <span
          data-slot-chip
          class="w-max shrink-0 rounded-full border-2 border-line bg-surface px-1.5 font-heading text-[10px] leading-tight whitespace-nowrap"
        >
          {s().chip}
        </span>
        <span class="line-clamp-2 max-w-full text-[11px] leading-tight break-all text-ink-muted">
          {s().locked ? t.lane.lockedSlot : s().summary || `＋ ${t.lane.add}`}
        </span>
      </span>
    </button>
  );
}

function Shield(props: { item: Extract<LaneItem, { kind: 'shield' }>; onOpen: (row: HarnessRowId) => void }) {
  const it = () => props.item;
  const state = () =>
    it().state === 'hook' ? t.lane.shieldHook : it().state === 'request' ? t.lane.shieldRequest : t.lane.shieldNone;
  return (
    <button
      type="button"
      data-harness-row={it().row}
      data-shield={it().state}
      disabled={it().locked}
      aria-label={`${t.rows[it().row]}：${it().locked ? t.lane.lockedSlot : state()}`}
      onClick={() => props.onOpen(it().row)}
      class="flex w-full items-center gap-2 py-0.5 pl-[1.15rem] text-left disabled:opacity-45 @2xl:flex-col @2xl:gap-0.5 @2xl:pt-4 @2xl:pl-0 @2xl:text-center"
    >
      <svg viewBox="0 0 56 64" class="h-9 w-8 shrink-0 @2xl:h-11 @2xl:w-10" aria-hidden="true">
        <path
          d="M28 4l22 8v18c0 15-10 26-22 30C16 56 6 45 6 30V12z"
          class={
            it().state === 'hook' ? 'fill-warning-300' : it().state === 'request' ? 'fill-warning-100' : 'fill-surface'
          }
          stroke="currentColor"
          stroke-width="4"
          stroke-dasharray={it().state === 'hook' ? undefined : '6 5'}
          stroke-linejoin="round"
        />
        <Show when={it().state !== 'none'}>
          <path
            d="M19 32l7 7 12-14"
            fill="none"
            stroke="currentColor"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </Show>
      </svg>
      <span class="flex min-w-0 flex-col leading-tight @2xl:items-center">
        <span class="text-[11px] font-bold break-words @2xl:max-w-[3.5rem]">{it().title}</span>
        <span class="text-[10px] text-ink-muted">{it().locked ? t.lane.lockedSlot : state()}</span>
      </span>
    </button>
  );
}

/** 受け取る：ルールのカードを CLAUDE.md・Rules・渡さないに仕分ける。CLAUDE.md の長さを目安と比べて示す */
export function RuleSort(props: {
  sort: RuleSortView;
  onMove: (command: import('../../core/commands').Command, label: string) => void;
  onFocus: (command: import('../../core/commands').Command, label: string) => void;
}) {
  const columns: readonly { place: RulePlace; title: string; sub: string }[] = [
    { place: 'claudeMd', title: t.sort.claudeMd, sub: t.sort.claudeMdSub },
    { place: 'rules', title: t.sort.rules, sub: t.sort.rulesSub },
    { place: 'none', title: t.sort.none, sub: t.sort.noneSub },
  ];
  const over = () => props.sort.claudeMdSize > props.sort.budget;
  return (
    <div class="grid grid-cols-1 gap-2 @2xl:grid-cols-3" data-rule-sort>
      <For each={columns}>
        {(col) => (
          <section
            data-rule-column={col.place}
            class={`flex min-w-0 flex-col gap-1.5 rounded-xl border-[3px] border-line p-2 ${
              col.place === 'claudeMd'
                ? 'bg-accent-100'
                : col.place === 'rules'
                  ? 'bg-success-100'
                  : 'border-dashed bg-surface'
            }`}
          >
            <h3 class="flex flex-wrap items-baseline gap-x-2 font-heading text-sm">
              {col.title}
              <span class="font-sans text-[11px] font-normal text-ink-muted">{col.sub}</span>
            </h3>
            <Show when={col.place === 'claudeMd'}>
              <div class="flex flex-col gap-0.5" data-claude-md-length data-over={over()}>
                <span class="h-2.5 overflow-hidden rounded-full border-2 border-line bg-surface">
                  <span
                    class={`block h-full ${over() ? 'bg-danger-400' : 'bg-success-400'}`}
                    style={{ width: `${Math.min(100, (props.sort.claudeMdSize / (props.sort.budget * 2)) * 100)}%` }}
                  />
                </span>
                <span
                  class={`flex items-center gap-1 text-[11px] font-bold ${over() ? 'text-danger-800' : 'text-success-800'}`}
                >
                  <Icon name={over() ? 'warning' : 'success'} />
                  {t.sort.length(props.sort.claudeMdSize, props.sort.budget)}：{over() ? t.sort.over : t.sort.ok}
                </span>
              </div>
            </Show>
            <Keyed each={props.sort.cards.filter((c) => c.place === col.place)} by={(c) => c.key}>
              {(card) => (
                <article
                  data-rule-card={card.key}
                  data-place={card.place}
                  class="flex flex-col gap-1 rounded-lg border-[3px] border-line bg-surface p-1.5"
                >
                  <div class="flex items-baseline justify-between gap-1">
                    <span class="min-w-0 text-xs font-bold">{card.name}</span>
                    <span class="shrink-0 text-[10px] text-ink-muted">{t.sort.size(card.size)}</span>
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <For each={card.kinds}>
                      {(k) => (
                        <span class="rounded-full border border-line bg-warning-100 px-1.5 text-[10px] font-bold">
                          {k}
                        </span>
                      )}
                    </For>
                  </div>
                  <div class="flex gap-1">
                    <For each={card.moves}>
                      {(m) => (
                        <button
                          type="button"
                          data-rule-move={m.place}
                          class="min-h-8 flex-1 rounded-md border-2 border-line bg-sunken px-1 text-[11px] font-bold"
                          onMouseEnter={() => props.onFocus(m.command, `${card.name} → ${t.sort.moveTo[m.place]}`)}
                          onFocus={() => props.onFocus(m.command, `${card.name} → ${t.sort.moveTo[m.place]}`)}
                          onClick={() => props.onMove(m.command, card.name)}
                        >
                          {t.sort.moveTo[m.place]}
                        </button>
                      )}
                    </For>
                  </div>
                </article>
              )}
            </Keyed>
          </section>
        )}
      </For>
    </div>
  );
}
