import { createMemo, createSignal, For, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import { assignModes } from '../../content/assignModes';
import type { AssignModeId } from '../../content/types';
import { ja } from '../../i18n/ja';
import { forecastAssign } from '../../view/forecast';
import type { TaskRowView } from '../../view/project';
import { Icon } from '../Icon';
import { modeIcon, primaryButton } from '../parts';
import { ForecastPreview } from './ForecastPreview';

const t = ja.assign;

/**
 * 担当変更（D3：大きなカードから選ぶ。PC は1行、スマホは横スクロール）。今の担当が押された状態になるラジオ式の選択肢で、
 * Tab ではグループに1回だけ止まり、矢印キーでカードを移る（ローヴィング tabindex）。
 * - マウス：ホバーで予測を出し、クリックで決定
 * - キーボード：矢印キーでカードを移ると予測が出て、Enter / Space で決定
 * - タッチ：1回目のタップで予測を出し、同じカードをもう一度タップ（または決定ボタン）で決定
 * 予測は view/forecast.ts（core のヘッドレス実行）で出す。決定は onAssign から AssignTask の Command になる。
 */
export function AssignCards(props: {
  store: GameStore;
  projectId: string;
  row: TaskRowView;
  scroll: boolean;
  onAssign: (mode: AssignModeId) => void;
}) {
  const [preview, setPreview] = createSignal<AssignModeId | null>(null);
  const [touch, setTouch] = createSignal(false);
  let pointer = '';
  const cards: HTMLButtonElement[] = [];

  const forecast = createMemo(() => {
    const mode = preview();
    if (!mode || !props.row.editable) return null;
    return { mode, ...forecastAssign(props.store.state(), props.projectId, props.row.id, mode) };
  });

  const focusable = () => {
    const p = preview() ?? props.row.mode;
    return p ? assignModes.findIndex((m) => m.id === p) : 0;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const delta = keys[e.key];
    const i = cards.indexOf(document.activeElement as HTMLButtonElement);
    if (delta === undefined && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    e.stopPropagation();
    const n = cards.length;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (Math.max(0, i) + (delta ?? 0) + n) % n;
    cards[next]?.focus();
  };

  const onClick = (mode: AssignModeId) => {
    const byTouch = pointer === 'touch';
    pointer = '';
    if (!props.row.editable) return;
    if (byTouch && preview() !== mode) {
      setPreview(mode);
      return;
    }
    props.onAssign(mode);
  };

  return (
    <div class="flex min-w-0 flex-col gap-2">
      <p id={`assign-${props.row.id}`} class="text-sm font-bold">
        {t.title}
      </p>
      <Show when={props.row.editable}>
        <div class="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2">
          <ForecastPreview forecast={forecast()} />
          <Show when={forecast()}>
            {(f) => (
              <button type="button" class={`${primaryButton} text-sm`} onClick={() => props.onAssign(f().mode)}>
                {t.confirm(ja.modes[f().mode])}
              </button>
            )}
          </Show>
        </div>
      </Show>
      <fieldset
        data-assign-cards
        aria-labelledby={`assign-${props.row.id}`}
        class={
          props.scroll
            ? '-mx-4 flex min-w-0 snap-x gap-2 overflow-x-auto px-4 pt-1 pb-2'
            : 'grid min-w-0 grid-cols-5 gap-2 pt-1'
        }
        onKeyDown={onKeyDown}
      >
        <For each={assignModes}>
          {(m, i) => (
            <button
              ref={(el) => {
                cards[i()] = el;
              }}
              type="button"
              data-mode={m.id}
              aria-pressed={props.row.mode === m.id}
              aria-disabled={!props.row.editable}
              tabindex={i() === focusable() ? 0 : -1}
              class="relative flex min-h-11 shrink-0 snap-start flex-col items-center gap-1 rounded-lg border-[3px] border-line bg-surface p-3 text-center shadow-pop transition-transform active:translate-y-1 active:shadow-none aria-pressed:bg-accent-300 aria-disabled:opacity-50 aria-disabled:shadow-none"
              classList={{ 'w-32': props.scroll, 'ring-4 ring-primary-300': preview() === m.id }}
              onPointerDown={(e) => {
                pointer = e.pointerType;
                setTouch(e.pointerType === 'touch');
              }}
              onFocus={() => {
                if (pointer !== 'touch') setPreview(m.id);
              }}
              onPointerEnter={(e) => {
                // タッチの互換イベントでは予測にしない（タッチは1回目のタップで予測を出す）
                if (e.pointerType === 'mouse') setPreview(m.id);
              }}
              onClick={() => onClick(m.id)}
            >
              <span class="text-4xl">
                <Icon name={modeIcon[m.id]} />
              </span>
              <span class="font-heading text-sm leading-tight text-balance">{m.name}</span>
              <span class="text-[11px] leading-snug text-ink-muted">{t.hints[m.id]}</span>
              <Show when={props.row.mode === m.id}>
                <span class="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border-2 border-line bg-surface px-1.5 text-[10px] font-bold whitespace-nowrap">
                  {t.current}
                </span>
              </Show>
              <Show when={touch() && preview() === m.id && props.row.editable}>
                <span class="text-[11px] font-bold text-primary-700">{t.tapAgain}</span>
              </Show>
            </button>
          )}
        </For>
      </fieldset>
      <Show when={!props.row.editable}>
        <p class="text-xs text-ink-muted">{t.locked}</p>
      </Show>
    </div>
  );
}
