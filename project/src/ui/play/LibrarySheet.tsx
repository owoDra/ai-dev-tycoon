import { createMemo, createSignal, For, type JSX, onCleanup, onMount, Show } from 'solid-js';
import { audio } from '../../audio/index';
import type { Rect } from '../../content/look/layout';
import type { Command } from '../../core/commands';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import type { HarnessForecast } from '../../view/harness';
import type { ImportView, LibraryEntryView, LibraryView, WorkflowSummary } from '../../view/library';
import { CopyButton, selectText } from '../CopyButton';
import { Icon } from '../Icon';
import { Keyed } from '../Keyed';
import { ghostButton, panel, primaryButton, rectStyle } from '../parts';
import { ForecastMetrics } from './HarnessSheet';

const t = ja.library;

/**
 * Workflow Library（企画書25章）。会社の資産として棚に並んだ Workflow（プレイヤーが保存したもの）の構成と実績を見せ、
 * 共有コードの書き出しと読み込みをする。Task から開いたとき（target があるとき）は、Workflow を Task に適用できる。
 * 適用ボタンにフォーカスすると、Harness Builder と同じ Before → After の予測を出す。
 */
export function LibrarySheet(props: {
  view: LibraryView;
  /** 適用先の Task の名前。null なら棚を見るだけ */
  target: string | null;
  /** モーダルの位置と大きさ（content/look/layout.ts の sheetRect） */
  frame: Rect;
  forecast: (command: Command) => HarnessForecast;
  readCode: (code: string) => ImportView;
  dispatch: (command: Command) => void;
  onClose: () => void;
  /** シートの上端に出すタブ（Harness Builder と Workflow Library の切り替え） */
  tabs?: JSX.Element;
}) {
  let el!: HTMLElement;
  onMount(() => {
    audio.play('panelOpen');
    onCleanup(() => audio.play('panelClose'));
    enter(el, 'below');
  });
  const [focused, setFocused] = createSignal<LibraryEntryView | null>(null);
  const preview = createMemo(() => {
    const e = focused();
    return e?.apply ? { option: { label: e.name }, forecast: props.forecast(e.apply) } : null;
  });

  return (
    <section
      ref={el}
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
      data-library-sheet
      class={`${panel} absolute flex flex-col gap-3 overflow-x-hidden overflow-y-auto px-4 pt-3 pb-4 *:shrink-0`}
      style={{
        ...rectStyle(props.frame),
      }}
    >
      {props.tabs}
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-md border-[3px] border-line bg-accent-200 text-2xl">
            <Icon name="workflow" />
          </span>
          <div class="flex min-w-0 flex-col leading-tight">
            <span class="text-[11px] font-bold text-ink-muted">{t.title}</span>
            <h2 class="truncate font-heading text-lg">{props.target ? t.apply : t.lead}</h2>
          </div>
        </div>
        <button type="button" class={ghostButton} onClick={() => props.onClose()}>
          {t.close}
        </button>
      </div>
      <Show when={props.target}>
        {(name) => (
          <p class="text-xs text-ink-muted">
            {name()}：{t.applyHint}
          </p>
        )}
      </Show>
      <Show when={props.target}>
        <ForecastMetrics preview={preview()} title={t.preview} />
      </Show>
      <Show when={!props.target}>
        <ol
          class="flex flex-col gap-1 rounded-lg border-[3px] border-line bg-sunken p-2 text-xs"
          aria-label={t.howTo}
          data-library-howto
        >
          <For each={t.howToSteps}>
            {(step, i) => (
              <li class="flex items-start gap-2">
                <span class="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-line bg-accent-200 font-heading text-[11px]">
                  {i() + 1}
                </span>
                <span>{step}</span>
              </li>
            )}
          </For>
        </ol>
      </Show>

      <Shelf
        title={t.custom}
        entries={props.view.saved}
        onFocus={setFocused}
        dispatch={props.dispatch}
        empty={t.empty}
      />
      <ImportForm readCode={props.readCode} dispatch={props.dispatch} />
    </section>
  );
}

function Shelf(props: {
  title: string;
  entries: readonly LibraryEntryView[];
  empty: string;
  onFocus: (e: LibraryEntryView) => void;
  dispatch: (command: Command) => void;
}) {
  return (
    <section class="flex flex-col gap-2" aria-label={props.title}>
      <h3 class="text-sm font-bold">{props.title}</h3>
      <Show when={props.entries.length > 0} fallback={<p class="text-xs text-ink-muted">{props.empty}</p>}>
        <ul class="grid gap-2" style={{ 'grid-template-columns': 'repeat(auto-fill, minmax(15rem, 1fr))' }}>
          <Keyed each={props.entries} by={(e) => e.id}>
            {(e) => (
              <li>
                <WorkflowCard entry={e} onFocus={() => props.onFocus(e)} dispatch={props.dispatch} />
              </li>
            )}
          </Keyed>
        </ul>
      </Show>
    </section>
  );
}

/** Workflow の構成（担当・モデル・渡す情報・部品）と、未解放の警告 */
function Composition(props: { summary: WorkflowSummary }) {
  const s = () => props.summary;
  return (
    <>
      <p class="text-[11px] leading-snug text-ink-muted">
        {t.mode}：{s().mode}・{t.model}：{s().model}・{t.context}：{s().context}
      </p>
      <ul class="flex flex-wrap gap-1" aria-label={t.parts}>
        <For each={s().parts} fallback={<li class="text-[11px] text-ink-muted">{t.noParts}</li>}>
          {(name) => <li class="rounded border-2 border-line bg-surface px-1 text-[11px] font-bold">{name}</li>}
        </For>
      </ul>
      <Show when={s().locked.length > 0}>
        <p class="flex items-start gap-1 text-[11px] font-bold text-danger-ink" data-locked-warning>
          <Icon name="warning" />
          {t.lockedWarning(s().locked.join('・'))}
        </p>
      </Show>
    </>
  );
}

function WorkflowCard(props: { entry: LibraryEntryView; onFocus: () => void; dispatch: (c: Command) => void }) {
  const e = () => props.entry;
  let code!: HTMLElement;
  return (
    <article
      class="flex h-full flex-col gap-1.5 rounded-lg border-[3px] border-line bg-surface p-2 shadow-pop"
      data-workflow-card={e().id}
    >
      <h4 class="flex items-center gap-1 font-heading text-sm leading-tight">
        <Icon name="workflow" />
        {e().name}
      </h4>
      <Composition summary={e()} />
      <p class="flex flex-wrap gap-x-2 text-[11px] font-bold" data-workflow-stats>
        <span>{t.uses(e().uses)}</span>
        <span>{e().savedHours > 0 ? t.saved(e().savedHours) : t.savedNone}</span>
      </p>
      <Show when={e().apply}>
        {(command) => (
          <button
            type="button"
            class={`${primaryButton} min-h-9 text-sm`}
            data-apply-workflow={e().id}
            onMouseEnter={() => props.onFocus()}
            onFocus={() => props.onFocus()}
            onClick={() => props.dispatch(command())}
          >
            {t.applyTo(e().name)}
          </button>
        )}
      </Show>
      <details class="text-[11px]">
        <summary class="cursor-pointer text-ink-muted">{t.share}</summary>
        <p class="text-ink-muted">{t.shareHint}</p>
        <code
          ref={code}
          class="my-1 block select-all break-all rounded-md border-2 border-line bg-sunken px-1 font-mono tracking-wider"
          data-workflow-code
        >
          {e().code}
        </code>
        <CopyButton
          text={() => e().code}
          label={t.copy}
          copied={t.copied}
          failed={t.copyFailed}
          onFail={() => selectText(code)}
        />
      </details>
    </article>
  );
}

/** 共有コードの読み込み。読めたら構成と未解放の警告を見せてから、ライブラリに追加する */
function ImportForm(props: { readCode: (code: string) => ImportView; dispatch: (c: Command) => void }) {
  const [code, setCode] = createSignal('');
  const [result, setResult] = createSignal<ImportView | null>(null);
  return (
    <form
      class="flex flex-col gap-2 rounded-lg border-[3px] border-line bg-sunken p-3"
      aria-label={t.import}
      data-import-workflow
      onSubmit={(ev) => {
        ev.preventDefault();
        setResult(props.readCode(code()));
      }}
    >
      <label class="flex flex-col gap-1 text-sm font-bold">
        {t.import}
        <input
          class="rounded-md border-2 border-line bg-surface px-2 py-1 font-mono text-sm font-normal"
          placeholder={t.importPlaceholder}
          value={code()}
          onInput={(ev) => {
            setCode(ev.currentTarget.value);
            setResult(null);
          }}
          data-import-code
        />
      </label>
      <button type="submit" class={`${ghostButton} self-start`} data-import-read>
        {t.importAction}
      </button>
      <Show when={result()}>
        {(r) => {
          const view = r();
          return view.ok ? (
            <div class="flex flex-col gap-1.5 rounded-lg border-[3px] border-line bg-surface p-2" data-import-preview>
              <p class="font-heading text-sm">{view.summary.name}</p>
              <Composition summary={view.summary} />
              <button
                type="button"
                class={`${primaryButton} self-start`}
                data-import-add
                onClick={() => {
                  props.dispatch(view.command);
                  setCode('');
                  setResult(null);
                }}
              >
                {t.importAdd}
              </button>
            </div>
          ) : (
            <p class="flex items-center gap-1 text-xs font-bold text-danger-ink" role="alert" data-import-error>
              <Icon name="warning" />
              {view.message}
            </p>
          );
        }}
      </Show>
    </form>
  );
}
