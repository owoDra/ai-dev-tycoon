import { createMemo, createSignal, For, type JSX, onCleanup, onMount, Show } from 'solid-js';
import { audio } from '../../audio/index';
import type { SheetLayout } from '../../content/look/layout';
import type { Command } from '../../core/commands';
import type { WorkerExpectation } from '../../core/expectation';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import type { HarnessForecast, HarnessOptionView, HarnessRowId, HarnessView } from '../../view/harness';
import { Icon } from '../Icon';
import { Keyed } from '../Keyed';
import { ghostButton, panel } from '../parts';
import { type Direction, MorphValue, Trend } from './ForecastPreview';
import { HarnessLane, RuleSort } from './HarnessLane';

const t = ja.harness;
const f = ja.forecast;

interface MetricRow {
  readonly key: keyof WorkerExpectation;
  readonly label: string;
  readonly format: (v: number) => string;
  readonly lowerIsBetter: boolean;
  /** 小さすぎる差は「変わらない」とみなす */
  readonly epsilon: number;
}

/** 予測する4つの値（企画書48章：人間時間・AIコスト・品質・自律時間） */
const metrics: readonly MetricRow[] = [
  { key: 'humanMinutes', label: f.humanTime, format: f.hours, lowerIsBetter: true, epsilon: 3 },
  { key: 'aiCost', label: f.aiCost, format: f.yen, lowerIsBetter: true, epsilon: 1 },
  { key: 'quality', label: f.quality, format: f.percent, lowerIsBetter: false, epsilon: 0.005 },
  { key: 'autonomyMinutes', label: t.autonomy, format: f.hours, lowerIsBetter: false, epsilon: 3 },
];

function direction(row: MetricRow, before: number, after: number): Direction {
  const diff = after - before;
  if (Math.abs(diff) < row.epsilon) return 'same';
  return diff < 0 === row.lowerIsBetter ? 'better' : 'worse';
}

/**
 * Harness Builder（企画書35章・D6 案D）。ノードエディタにせず、作業の流れの道（HarnessLane）にスロット・盾・鍵を並べる。
 * スロットや盾を押すと選択肢のパネルに替わり、選択肢にフォーカスするたびに Before → After の予測を出す（企画書48章）。
 * 押すと確定（Command を発行）し、トーストと演出は PlayScreen と FxHost が events から出す。
 * 補正の内部値は「詳しく見る」を開いたときだけ出す。
 */
export function HarnessSheet(props: {
  view: HarnessView;
  layout: SheetLayout;
  bottom: number;
  viewHeight: number;
  /** 高さの上限（上の帯とドックの間。content/look/layout.ts の screenRegions） */
  maxHeight?: number;
  /** 選択肢の Command を確定した場合の予測 */
  forecast: (command: Command | null) => HarnessForecast;
  dispatch: (command: Command) => void;
  onClose: () => void;
  /** カード（行の一覧）の下に出すもの（Workflow として保存するフォームなど） */
  footer?: JSX.Element;
  /** 見出しの小さな文字（既定は Harness Builder） */
  kicker?: string;
  /** 予測の見出し（既定はゲームの「この案件の AI の仕事」） */
  previewTitle?: string;
  /** シートの上端に出すタブ（Harness Builder と Workflow Library の切り替え） */
  tabs?: JSX.Element;
}) {
  let el!: HTMLElement;
  onMount(() => {
    audio.play('panelOpen');
    onCleanup(() => audio.play('panelClose'));
    enter(el, 'below');
  });
  const [rowId, setRowId] = createSignal<HarnessRowId | null>(null);
  /** 予測を出している選択肢（部品の選択肢・ルールの移動・おすすめ構成） */
  const [focused, setFocused] = createSignal<{ label: string; command: Command | null } | null>(null);
  const row = () => props.view.rows.find((r) => r.id === rowId()) ?? null;
  const preview = createMemo(() => {
    const option = focused();
    return option ? { option, forecast: props.forecast(option.command) } : null;
  });
  const open = (id: HarnessRowId | null) => {
    setFocused(null);
    setRowId(id);
  };

  return (
    <section
      ref={el}
      role="dialog"
      aria-modal="false"
      aria-label={t.title}
      data-harness-sheet
      class={`${panel} absolute inset-x-0 mx-auto flex w-full flex-col gap-3 overflow-x-hidden overflow-y-auto rounded-b-none px-4 pt-3 pb-4 *:shrink-0`}
      style={{
        'max-width': `${props.layout.maxWidth}px`,
        bottom: `${props.bottom}px`,
        height: `${Math.min(props.viewHeight * props.layout.heightRatio, props.maxHeight ?? Number.POSITIVE_INFINITY)}px`,
      }}
    >
      {props.tabs}
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-md border-[3px] border-line bg-accent-200 text-2xl">
            <Icon name={row()?.icon ?? 'ai'} />
          </span>
          <div class="flex min-w-0 flex-col leading-tight">
            <span class="text-[11px] font-bold text-ink-muted">{props.kicker ?? t.title}</span>
            <h2 class="truncate font-heading text-lg">{row()?.label ?? props.view.workerName}</h2>
          </div>
        </div>
        <div class="flex gap-2">
          <Show when={row()}>
            <button type="button" class={ghostButton} data-harness-back onClick={() => open(null)}>
              {t.back}
            </button>
          </Show>
          <button type="button" class={ghostButton} onClick={() => props.onClose()}>
            {t.close}
          </button>
        </div>
      </div>

      <Show
        when={row()}
        fallback={
          <>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs text-ink-muted">{t.lane.hint}</p>
              <Show when={props.view.rows.some((r) => r.id === 'model')}>
                <button
                  type="button"
                  data-harness-row="model"
                  class="flex min-h-9 items-center gap-1.5 rounded-full border-[3px] border-line bg-surface px-3 text-xs shadow-pop"
                  onClick={() => open('model')}
                >
                  <Icon name="model" />
                  <span class="text-ink-muted">{t.lane.model}</span>
                  <span class="font-heading">{props.view.rows.find((r) => r.id === 'model')?.summary}</span>
                </button>
              </Show>
            </div>
            <HarnessLane
              view={props.view}
              onOpen={open}
              onPresetFocus={(p) => setFocused(p ? { label: p.label, command: p.command } : null)}
              onPreset={(p) => {
                props.dispatch(p.command);
                setFocused(null);
              }}
            />
            <Show when={focused()}>
              <ForecastMetrics preview={preview()} title={props.previewTitle ?? t.preview} />
            </Show>
            {props.footer}
          </>
        }
      >
        {(r) => (
          <>
            <p class="text-xs text-ink-muted">{t.rowHints[r().id]}</p>
            <Show when={r().sort}>
              {(sort) => (
                <div class="@container">
                  <RuleSort
                    sort={sort()}
                    onFocus={(command, label) => setFocused({ label, command })}
                    onMove={(command) => {
                      props.dispatch(command);
                      setFocused(null);
                    }}
                  />
                </div>
              )}
            </Show>
            <Keyed each={r().groups} by={(g) => g.title ?? g.options[0]?.id ?? ''}>
              {(group) => (
                <fieldset class="flex flex-col gap-1.5">
                  <Show when={group.title}>
                    <legend class="mb-1 text-sm font-bold">{group.title}</legend>
                  </Show>
                  <div class="grid gap-2" style={{ 'grid-template-columns': 'repeat(auto-fill, minmax(9.5rem, 1fr))' }}>
                    <Keyed each={group.options} by={(o) => o.id}>
                      {(option) => (
                        <OptionCard
                          option={option}
                          onFocus={() => setFocused(option)}
                          onPick={() => {
                            if (option.command) props.dispatch(option.command);
                            setFocused(null);
                          }}
                        />
                      )}
                    </Keyed>
                  </div>
                </fieldset>
              )}
            </Keyed>
            <ForecastMetrics preview={preview()} title={props.previewTitle ?? t.preview} />
          </>
        )}
      </Show>
    </section>
  );
}

function OptionCard(props: { option: HarnessOptionView; onFocus: () => void; onPick: () => void }) {
  const o = () => props.option;
  return (
    <div class="flex flex-col gap-1">
      <button
        type="button"
        data-harness-option={o().id}
        aria-pressed={o().selected}
        class="flex min-h-11 flex-col items-start gap-0.5 rounded-lg border-[3px] border-line bg-surface p-2 text-left shadow-pop aria-pressed:bg-accent-300"
        onMouseEnter={() => props.onFocus()}
        onFocus={() => props.onFocus()}
        onClick={() => props.onPick()}
      >
        <span class="flex items-center gap-1 font-heading text-sm leading-tight">
          <Show when={o().selected}>
            <Icon name="success" />
            <span class="sr-only">{ja.harness.equipped}</span>
          </Show>
          {o().label}
        </span>
        <Show when={o().hint}>
          <span class="text-[11px] leading-snug text-ink-muted">{o().hint}</span>
        </Show>
        <Show when={o().part}>
          {(p) => (
            <span class="text-[11px] leading-snug text-ink-muted">
              {p().owned ? t.owned : t.install(p().installCost)}
            </span>
          )}
        </Show>
      </button>
      <Show when={o().part}>
        {(p) => (
          <details class="text-[11px] leading-snug" data-harness-details>
            <summary class="cursor-pointer text-ink-muted">{t.details}</summary>
            <dl class="mt-1 flex flex-col gap-0.5">
              <Show when={p().modifiers.length > 0}>
                <dt class="font-bold">
                  {t.appliesTo}：{p().appliesTo.join('・') || t.always}
                </dt>
                <For each={p().modifiers}>
                  {(m) => (
                    <dd>
                      {m.label} {m.value}
                    </dd>
                  )}
                </For>
              </Show>
              <Show when={p().burden.length > 0}>
                <dt class="font-bold">{t.burden}</dt>
                <For each={p().burden}>
                  {(m) => (
                    <dd>
                      {m.label} {m.value}
                    </dd>
                  )}
                </For>
              </Show>
              <Show when={p().runningCost > 0}>
                <dd>{t.running(p().runningCost)}</dd>
              </Show>
            </dl>
          </details>
        )}
      </Show>
    </div>
  );
}

/** Before → After の予測。よくなるか悪くなるかを形と文字でも示す（Workflow Library の適用でも使う） */
export function ForecastMetrics(props: {
  preview: { option: { label: string }; forecast: HarnessForecast } | null;
  title: string;
}) {
  return (
    <Show when={props.preview} fallback={<p class="text-xs text-ink-muted">{t.previewHint}</p>}>
      {(p) => (
        <section aria-live="polite" aria-label={props.title} class="min-w-0" data-harness-preview>
          <h3 class="text-xs font-bold text-ink-muted">
            {props.title}：{p().option.label}
          </h3>
          <dl class="flex flex-wrap gap-x-4 gap-y-1">
            <For each={metrics}>
              {(m) => {
                const before = () => p().forecast.before[m.key];
                const after = () => p().forecast.after[m.key];
                const dir = () => direction(m, before(), after());
                return (
                  <div class="flex flex-col" data-metric={m.key}>
                    <dt class="text-[11px] text-ink-muted">{m.label}</dt>
                    <dd class="flex items-center gap-1 text-sm whitespace-nowrap">
                      <span class="text-ink-muted tabular-nums">{m.format(before())}</span>
                      <span aria-hidden="true">→</span>
                      <span class="font-heading tabular-nums" data-dir={dir()}>
                        <MorphValue from={before()} to={after()} format={m.format} />
                      </span>
                      <Trend dir={dir()} />
                    </dd>
                  </div>
                );
              }}
            </For>
          </dl>
        </section>
      )}
    </Show>
  );
}
