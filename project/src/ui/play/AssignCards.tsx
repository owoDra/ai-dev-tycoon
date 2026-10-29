import { createMemo, createSignal, For, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import { assignModes, getAssignMode, primaryActor } from '../../content/assignModes';
import type { AssignModeId, FeatureId } from '../../content/types';
import { modeFeature } from '../../content/unlocks';
import { isAllowed } from '../../core/tutorial';
import { isUnlocked } from '../../core/unlocks';
import { ja } from '../../i18n/ja';
import { compareModes, forecastAssign, type ModeBars } from '../../view/forecast';
import { defaultWorkerFor, humanChoices, type TaskRowView } from '../../view/project';
import { Icon } from '../Icon';
import { Meter, modeIcon, NewBadge, primaryButton, stateColor } from '../parts';
import { ForecastPreview } from './ForecastPreview';

const t = ja.assign;

/**
 * 担当変更（D3：大きなカードから選ぶ。PC は1行、スマホは横スクロール）。今の担当が押された状態になるラジオ式の選択肢で、
 * Tab ではグループに1回だけ止まり、矢印キーでカードを移る（ローヴィング tabindex）。
 * - マウス：ホバーで予測を出し、クリックで決定
 * - キーボード：矢印キーでカードを移ると予測が出て、Enter / Space で決定
 * - タッチ：1回目のタップで予測を出し、同じカードをもう一度タップ（または決定ボタン）で決定
 * 予測は view/forecast.ts（core のヘッドレス実行）で出す。決定は onAssign から AssignTask の Command になる。
 * 解放済みのモードだけを並べ（isUnlocked）、チュートリアルの今のステップで許していないモードは押せない表示にする。
 * 解放されたばかりのモードには「NEW」バッジを付ける（fresh）。
 */
export function AssignCards(props: {
  store: GameStore;
  projectId: string;
  row: TaskRowView;
  scroll: boolean;
  /** 解放されたばかりで、まだ使っていない機能 */
  fresh?: ReadonlySet<FeatureId>;
  /** 担当を決める。人間が主な担い手のモードでは、選んだ社員（workerId）を渡す */
  onAssign: (mode: AssignModeId, workerId?: string) => void;
}) {
  // 人間に任せるときの担当者。既定は掛け持ちの最も少ない人（掛け持ちすると遅くなるので、誰が空いているかを見せる）
  const humans = createMemo(() => humanChoices(props.store.state()));
  const [human, setHuman] = createSignal<string | null>(null);
  const pickedHuman = () => human() ?? humans()[0]?.id;
  const humanMode = (mode: AssignModeId) => primaryActor(getAssignMode(mode)) === 'human';
  const commit = (mode: AssignModeId) => props.onAssign(mode, humanMode(mode) ? pickedHuman() : undefined);
  const modes = createMemo(() => assignModes.filter((m) => isUnlocked(props.store.state(), modeFeature(m.id))));
  /** そのモードを今選べるか（開始前で、チュートリアル中なら今のステップで許している） */
  const selectable = (mode: AssignModeId) =>
    props.row.editable &&
    isAllowed(props.store.state(), {
      type: 'AssignTask',
      projectId: props.projectId,
      taskId: props.row.id,
      mode,
      workerId: humanMode(mode) ? (pickedHuman() ?? '') : defaultWorkerFor(mode, props.store.state(), props.projectId),
    });
  const comparison = createMemo(() =>
    props.row.editable
      ? compareModes(
          props.store.state(),
          props.projectId,
          props.row.id,
          modes().map((m) => m.id),
        )
      : null,
  );
  const [preview, setPreview] = createSignal<AssignModeId | null>(null);
  const [touch, setTouch] = createSignal(false);
  let pointer = '';
  const cards: HTMLButtonElement[] = [];

  const forecast = createMemo(() => {
    const mode = preview();
    if (!mode || !selectable(mode)) return null;
    return { mode, ...forecastAssign(props.store.state(), props.projectId, props.row.id, mode) };
  });

  const focusable = () => {
    const p = preview() ?? props.row.mode;
    return p
      ? Math.max(
          0,
          modes().findIndex((m) => m.id === p),
        )
      : 0;
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
    if (!selectable(mode)) return;
    if (byTouch && preview() !== mode) {
      setPreview(mode);
      return;
    }
    commit(mode);
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
              <button type="button" class={`${primaryButton} text-sm`} onClick={() => commit(f().mode)}>
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
          props.scroll ? '-mx-4 flex min-w-0 snap-x gap-2 overflow-x-auto px-4 pt-1 pb-2' : 'grid min-w-0 gap-2 pt-1'
        }
        style={props.scroll ? undefined : { 'grid-template-columns': `repeat(${modes().length}, minmax(0, 1fr))` }}
        onKeyDown={onKeyDown}
      >
        <For each={modes()}>
          {(m, i) => (
            <button
              ref={(el) => {
                cards[i()] = el;
              }}
              type="button"
              data-mode={m.id}
              aria-pressed={props.row.mode === m.id}
              aria-disabled={!selectable(m.id)}
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
              <Show when={comparison()?.bars[m.id]}>{(b) => <ModeBarsView bars={b()} />}</Show>
              <Show when={comparison()?.recommended === m.id && props.row.mode !== m.id}>
                <span
                  class="absolute -top-2.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border-2 border-line bg-success-200 px-1.5 text-[10px] font-bold whitespace-nowrap"
                  data-recommended
                >
                  <Icon name="success" class="text-xs" />
                  {t.recommended}
                </span>
              </Show>
              <Show when={props.fresh?.has(modeFeature(m.id)) && props.row.mode !== m.id}>
                <NewBadge class="absolute -top-2.5 -right-1.5" />
              </Show>
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
      <Show when={props.row.editable && humans().length > 1 && modes().some((m) => humanMode(m.id))}>
        <label class="flex items-center gap-2 text-sm">
          <Icon name="human" class="text-lg" />
          <span class="font-bold whitespace-nowrap">{t.humanPick}</span>
          <select
            data-human-pick
            class="min-h-11 min-w-0 rounded-md border-[3px] border-line bg-surface px-2"
            value={pickedHuman()}
            onChange={(e) => setHuman(e.currentTarget.value)}
          >
            <For each={humans()}>{(h) => <option value={h.id}>{t.humanLoad(h.name, h.load)}</option>}</For>
          </select>
        </label>
      </Show>
      <Show when={!props.row.editable}>
        <p class="text-xs text-ink-muted">{t.locked}</p>
      </Show>
    </div>
  );
}

/** 担当カードの3本のバー（速さ・品質・人の手間）。数字は出さず、モードどうしの違いだけを長さとラベルで見せる */
function ModeBarsView(props: { bars: ModeBars }) {
  const rows = [
    { id: 'speed', color: stateColor.progress },
    { id: 'quality', color: stateColor.done },
    { id: 'effort', color: stateColor.human },
  ] as const;
  return (
    <span class="flex w-full flex-col gap-0.5" data-mode-bars>
      <For each={rows}>
        {(r) => (
          <span class="flex items-center gap-1 text-[10px] font-bold text-ink-muted">
            <span class="w-12 shrink-0 text-left whitespace-nowrap">{t.bars[r.id]}</span>
            <Meter ratio={props.bars[r.id]} label={t.bars[r.id]} color={r.color} class="min-w-6 flex-1" />
          </span>
        )}
      </For>
    </span>
  );
}
