import { createMemo, createSignal, For, type JSX, onMount, Show } from 'solid-js';
import { fromDrop, fromInput, type ReadFiles, readFileList } from '../../app/bringRead';
import { loadBringCards, mergeBringCards, saveBringCards } from '../../app/bringStore';
import type { IconName } from '../../assets/icons';
import type { BringCategory } from '../../content/bring';
import { battleWord } from '../../core/battle';
import { type BringCard, type BringSkip, readBring } from '../../core/bring';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { battleBoard, bringCardView } from '../../view/bring';
import { Icon } from '../Icon';
import { ghostButton, panel, primaryButton, smallButton } from '../parts';

const t = ja.bring;
const field = 'rounded-md border-2 border-line bg-surface px-2 py-1 text-sm font-normal';
const section = 'flex flex-col gap-2 rounded-lg border-[3px] border-line bg-surface p-3';

const categoryIcon: Record<BringCategory, IconName> = {
  skill: 'skill',
  subagent: 'subagent',
  hook: 'hook',
  permission: 'permission',
  mcp: 'tool',
  claudeMd: 'requirements',
  rules: 'context',
};

/** 読み込みの結果の知らせ */
interface Notice {
  readonly added: number;
  readonly plugin: string | null;
  readonly skipped: readonly BringSkip[];
  readonly failed: boolean;
}

/**
 * 持ち込みの画面（Phase 42）。自分の Claude Code の設定を読み込んで持ち込みカードにし、カードの点と理由を見せる。
 * 持ち寄りバトル（合言葉で同じ案件を遊ぶ）を始め、みんなの結果コードを並べて比べる。
 * 読み込みはこのブラウザの中だけで、中身はテキストとして扱い、HTML として描画しない（Solid のテキストとして出す）
 */
export function BringScreen(props: {
  onBack: () => void;
  /** 合言葉と持ち込みカードの部品の id で、持ち寄りバトルを始める */
  onBattle: (word: string, parts: readonly string[]) => void;
  /** プラグインの書き出し（Phase 43）を開く */
  onExport?: () => void;
}) {
  const [cards, setCards] = createSignal<BringCard[]>(loadBringCards());
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<Notice | null>(null);
  const [dragging, setDragging] = createSignal(false);
  const [confirmClear, setConfirmClear] = createSignal(false);
  let el!: HTMLDivElement;
  onMount(() => enter(el, 'below'));

  const update = (next: BringCard[]) => {
    setCards(next);
    saveBringCards(next);
  };

  const ingest = async (read: () => Promise<ReadFiles>) => {
    setBusy(true);
    try {
      const { files, skipped } = await read();
      const result = readBring(files);
      update(mergeBringCards(cards(), [...result.cards]));
      setNotice({
        added: result.cards.length,
        plugin: result.plugin,
        skipped: [...skipped, ...result.skipped],
        failed: false,
      });
    } catch {
      setNotice({ added: 0, plugin: null, skipped: [], failed: true });
    } finally {
      setBusy(false);
    }
  };

  const onInput: JSX.EventHandler<HTMLInputElement, Event> = (e) => {
    const list = fromInput(e.currentTarget.files);
    e.currentTarget.value = '';
    void ingest(() => readFileList(list));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const data = e.dataTransfer;
    if (data) void ingest(async () => readFileList(await fromDrop(data)));
  };

  return (
    <div class="absolute inset-0 overflow-y-auto bg-bg/60 p-3 sm:p-6" data-bring-screen>
      <div ref={el} class={`${panel} mx-auto flex w-full max-w-3xl flex-col gap-3 p-3 sm:p-5`}>
        <header class="flex flex-wrap items-center justify-between gap-2">
          <h1 class="flex items-center gap-2 font-heading text-2xl">
            <Icon name="handoff" />
            {t.title}
          </h1>
          <button type="button" class={ghostButton} onClick={() => props.onBack()} data-bring-back>
            {t.back}
          </button>
        </header>
        <p class="text-sm">{t.lead}</p>

        <section
          class={`${section} border-dashed ${dragging() ? 'bg-accent-300/40' : ''}`}
          aria-label={t.drop}
          data-bring-drop
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p class="flex items-center gap-1 text-xs font-bold">
            <Icon name="permission" />
            {t.privacy}
          </p>
          <div class="flex flex-wrap gap-2">
            <FilePick label={t.pickFolder} folder onChange={onInput} data="folder" />
            <FilePick label={t.pickZip} accept=".zip" onChange={onInput} data="zip" />
            <FilePick label={t.pickFile} accept=".md,.json" onChange={onInput} data="file" />
          </div>
          <p class="text-xs text-ink-muted">{t.drop}</p>
          <p class="text-[11px] text-ink-muted">{t.targets}</p>
          <p aria-live="polite" class="text-xs font-bold" data-bring-status>
            <Show when={busy()}>{t.reading}</Show>
            <Show when={!busy() && notice()}>{(n) => <NoticeText notice={n()} />}</Show>
          </p>
          <Show when={!busy() && (notice()?.skipped.length ?? 0) > 0}>
            <details class="text-xs" data-bring-skipped>
              <summary class="flex cursor-pointer items-center gap-1 font-bold">
                <Icon name="warning" />
                {t.skipped.title(notice()?.skipped.length ?? 0)}
              </summary>
              <ul class="mt-1 flex flex-col gap-0.5">
                <For each={notice()?.skipped}>
                  {(s) => (
                    <li data-skip={s.reason}>
                      <span class="font-mono break-all">{s.path}</span>：{skipText(s)}
                    </li>
                  )}
                </For>
              </ul>
            </details>
          </Show>
        </section>

        <section class={section} aria-label={t.cards} data-bring-cards>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-heading text-base">{t.cards}</h2>
            <Show when={cards().length > 0}>
              <button
                type="button"
                class={smallButton}
                data-bring-clear
                onClick={() => {
                  if (!confirmClear()) return setConfirmClear(true);
                  update([]);
                  setConfirmClear(false);
                }}
              >
                {confirmClear() ? t.confirmClear : t.clear}
              </button>
            </Show>
          </div>
          <p class="text-xs text-ink-muted">{t.unlockNote}</p>
          <Show when={cards().length > 0} fallback={<p class="text-sm">{t.empty}</p>}>
            <ul class="grid gap-2 sm:grid-cols-2">
              <For each={cards()}>
                {(card) => <CardItem card={card} onRemove={() => update(cards().filter((c) => c.id !== card.id))} />}
              </For>
            </ul>
          </Show>
          <Show when={props.onExport}>
            {(open) => (
              <button type="button" class={`${ghostButton} self-start`} onClick={() => open()()} data-open-export>
                <span class="flex items-center gap-1">
                  <Icon name="release" />
                  {ja.pluginExport.open}
                </span>
              </button>
            )}
          </Show>
        </section>

        <BattlePanel cards={cards()} onStart={props.onBattle} />
      </div>
    </div>
  );
}

function NoticeText(props: { notice: Notice }) {
  const n = () => props.notice;
  return (
    <span class="flex flex-col">
      <Show when={n().failed}>{t.readFailed}</Show>
      <Show when={!n().failed && n().plugin}>{(name) => <span>{t.plugin(name())}</span>}</Show>
      <Show when={!n().failed}>{n().added > 0 ? t.added(n().added) : t.none}</Show>
    </span>
  );
}

function skipText(s: BringSkip): string {
  const x = t.skipped;
  if (s.reason === 'secret') return x.secret(s.detail ?? '');
  if (s.reason === 'unusedHook') return x.unusedHook(s.detail ?? '');
  return x[s.reason];
}

/** ファイルの選択のボタン（input を label で包む） */
function FilePick(props: {
  label: string;
  accept?: string;
  folder?: boolean;
  data: string;
  onChange: JSX.EventHandler<HTMLInputElement, Event>;
}) {
  return (
    <label class={`${ghostButton} cursor-pointer focus-within:outline-2`} data-bring-pick={props.data}>
      {props.label}
      <input
        type="file"
        class="sr-only"
        accept={props.accept}
        multiple
        {...(props.folder ? { webkitdirectory: true } : {})}
        onChange={props.onChange}
      />
    </label>
  );
}

function CardItem(props: { card: BringCard; onRemove: () => void }) {
  const v = createMemo(() => bringCardView(props.card));
  return (
    <li
      class="flex flex-col gap-1.5 rounded-md border-2 border-line bg-sunken p-2"
      data-bring-card={props.card.category}
    >
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 flex-col">
          <span class="flex items-center gap-1 text-[11px] font-bold text-ink-muted">
            <Icon name={categoryIcon[props.card.category]} />
            {v().category}
          </span>
          <span class="font-heading text-sm break-all">{v().name}</span>
        </div>
        <span class="shrink-0 font-heading text-lg tabular-nums" data-bring-score>
          {t.score(v().score)}
        </span>
      </div>
      <p class="font-mono text-[11px] break-all text-ink-muted">{t.source(v().source)}</p>
      <Show when={v().good.length > 0}>
        <div class="text-xs" data-bring-good>
          <p class="flex items-center gap-1 font-bold">
            <Icon name="success" />
            {t.good}
          </p>
          <ul class="list-disc pl-5">
            <For each={v().good}>{(g) => <li>{g}</li>}</For>
          </ul>
        </div>
      </Show>
      <Show when={v().grow.length > 0}>
        <div class="text-xs" data-bring-grow>
          <p class="flex items-center gap-1 font-bold">
            <Icon name="sparkle" />
            {t.grow}
          </p>
          <ul class="list-disc pl-5">
            <For each={v().grow}>{(g) => <li>{g}</li>}</For>
          </ul>
        </div>
      </Show>
      <details data-bring-why>
        <summary class="cursor-pointer text-xs font-bold text-primary-700">{t.why}</summary>
        <ul class="mt-1 flex flex-col gap-1 rounded-md bg-surface p-2 text-xs leading-snug tabular-nums">
          <For each={v().why}>{(line) => <li>{line}</li>}</For>
          <Show when={v().modifiers.length > 0}>
            <li class="flex flex-wrap gap-x-3 font-bold">
              <For each={v().modifiers}>
                {(m) => (
                  <span>
                    {m.label} {m.value}
                  </span>
                )}
              </For>
            </li>
          </Show>
        </ul>
      </details>
      <button type="button" class={`${smallButton} self-end`} onClick={() => props.onRemove()} data-bring-remove>
        {t.remove}
      </button>
    </li>
  );
}

/** 持ち寄りバトル：合言葉で始め、みんなの結果コードを並べて比べる */
function BattlePanel(props: {
  cards: readonly BringCard[];
  onStart: (word: string, parts: readonly string[]) => void;
}) {
  const x = t.battle;
  const [word, setWord] = createSignal('');
  const [codes, setCodes] = createSignal('');
  const normalized = () => battleWord(word());
  const rows = createMemo(() => battleBoard(codes(), word()));
  return (
    <section class={section} aria-label={x.title} data-bring-battle>
      <h2 class="flex items-center gap-1 font-heading text-base">
        <Icon name="trophy" />
        {x.title}
      </h2>
      <p class="text-xs">{x.lead}</p>
      <div class="flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-0.5 text-xs font-bold">
          {x.word}
          <input
            class={field}
            value={word()}
            placeholder={x.placeholder}
            maxLength={32}
            onInput={(e) => setWord(e.currentTarget.value)}
            data-battle-word
          />
        </label>
        <button
          type="button"
          class={primaryButton}
          disabled={normalized() === null}
          onClick={() => {
            const w = normalized();
            if (w)
              props.onStart(
                w,
                props.cards.map((c) => c.id),
              );
          }}
          data-battle-start
        >
          {x.start}
        </button>
      </div>
      <Show when={word().trim().length > 0 && normalized() === null}>
        <p class="text-xs text-danger-700">{x.invalid}</p>
      </Show>
      <details class="text-xs" data-battle-compare>
        <summary class="cursor-pointer font-bold">{x.compare}</summary>
        <p class="mt-1 text-ink-muted">{x.compareHint}</p>
        <textarea
          class={`${field} mt-1 h-24 w-full font-mono`}
          value={codes()}
          onInput={(e) => setCodes(e.currentTarget.value)}
          data-battle-codes
        />
        <Show when={rows().length > 0}>
          <div class="mt-1 overflow-x-auto">
            <table class="w-full text-left tabular-nums" data-battle-board>
              <thead>
                <tr class="border-b-2 border-line">
                  <th class="p-1">{x.rank}</th>
                  <th class="p-1">{x.profit}</th>
                  <th class="p-1">{x.perDay}</th>
                  <th class="p-1">{x.quality}</th>
                  <th class="p-1">{x.cardsColumn}</th>
                </tr>
              </thead>
              <tbody>
                <For each={rows()}>
                  {(r) => (
                    <tr
                      class={`border-b border-line/30 ${r.rank === 1 ? 'font-bold' : ''}`}
                      data-battle-row={r.rank ?? ''}
                    >
                      <td class="p-1">
                        <Show when={r.rank === 1}>
                          <Icon name="trophy" />
                        </Show>
                        {r.rank ?? '-'}
                      </td>
                      <Show
                        when={r.record}
                        fallback={
                          <td class="p-1" colSpan={4}>
                            <span class="font-mono break-all">{r.code}</span>：{r.note}
                          </td>
                        }
                      >
                        {(rec) => (
                          <>
                            <td class="p-1">¥{rec().profit.toLocaleString('ja-JP')}</td>
                            <td class="p-1">¥{rec().profitPerPersonDay.toLocaleString('ja-JP')}</td>
                            <td class="p-1">{Math.round(rec().quality * 100)}%</td>
                            <td class="p-1">
                              {r.cards}
                              <Show when={r.note}>
                                <span class="block text-ink-muted">
                                  <Icon name="warning" /> {r.note}
                                </span>
                              </Show>
                            </td>
                          </>
                        )}
                      </Show>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </details>
    </section>
  );
}
