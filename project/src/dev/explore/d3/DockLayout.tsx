import { createSignal, For, Index, onCleanup, onMount, Show } from 'solid-js';
import { ja } from '../../../i18n/ja';
import { Icon } from '../../../ui/Icon';
import {
  AssignCards,
  DetailFacts,
  DetailTitle,
  ghostButton,
  HudItem,
  ProblemSteps,
  type Proto,
  panel,
  primaryButton,
  t,
  usePicked,
} from './parts';

/**
 * D3 で採用した「ゲームのドック」のプロトタイプ：HUD は下部のドックにまとめ（先頭に案件名）、詳細はドックの上に
 * 下から出るシート（大きなカードで担当を選ぶ）、問題は上に積み重なるトーストで知らせる。
 * スマホではドックを画面幅いっぱいの2段にし、親指で届く下半分に操作を集める。
 * 領域・寸法・操作の流れは content/look/layout.ts に従う。Phase 06 で本実装に置き換える。
 */
export function DockLayout(props: { proto: Proto }) {
  const proto = props.proto;
  const picked = usePicked(proto);
  const [dismissed, setDismissed] = createSignal<ReadonlySet<string>>(new Set());
  const [dockHeight, setDockHeight] = createSignal(0);
  const [drag, setDrag] = createSignal(0);
  let dock!: HTMLElement;
  onMount(() => {
    const ro = new ResizeObserver(() => setDockHeight(dock.offsetHeight));
    ro.observe(dock);
    onCleanup(() => ro.disconnect());
  });

  const sheet = () => proto.form().sheet;
  const sheetHeight = () => proto.size().height * sheet().heightRatio;
  const toast = () => proto.form().toast;
  const toasts = () =>
    proto
      .problems()
      .filter((pr) => !dismissed().has(pr.id))
      .slice(0, toast().max);
  const dockBottom = () => proto.form().dock.bottom;

  let dragFrom: number | null = null;
  const onHandleDown = (e: PointerEvent) => {
    dragFrom = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: PointerEvent) => {
    if (dragFrom !== null) setDrag(Math.max(0, e.clientY - dragFrom));
  };
  const onHandleUp = () => {
    if (drag() > sheet().swipeClose) proto.select(null);
    dragFrom = null;
    setDrag(0);
  };

  return (
    <>
      <div
        class={`absolute top-2 flex flex-col gap-2 ${toast().width === null ? 'inset-x-2' : 'right-3'}`}
        style={{ width: toast().width === null ? undefined : `${toast().width}px` }}
        aria-live="polite"
      >
        <Index each={toasts()}>
          {(p) => (
            <section aria-label={t.problems.title} class={`${panel} flex items-center gap-2 border-danger-600 p-2.5`}>
              <div class="min-w-0 flex-1">
                <ProblemSteps problem={p()} dense />
              </div>
              <div class="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  class={`${primaryButton} min-h-9 px-3 text-sm`}
                  onClick={() => proto.goTo(p().entityId, { x: 0, y: -(sheetHeight() + dockHeight()) / 2 })}
                >
                  {p().action}
                </button>
                <Show when={proto.layout.flow.toastDismissible}>
                  <button
                    type="button"
                    class="text-xs font-bold text-ink-muted underline"
                    onClick={() => setDismissed((s) => new Set([...s, p().id]))}
                  >
                    {t.problems.later}
                  </button>
                </Show>
              </div>
            </section>
          )}
        </Index>
      </div>

      <Show when={picked()}>
        {(pk) => (
          <section
            aria-label={pk().label}
            class={`${panel} absolute left-1/2 flex w-full flex-col gap-3 overflow-y-auto rounded-b-none px-4 pt-1 pb-4`}
            style={{
              'max-width': `${sheet().maxWidth}px`,
              bottom: `${dockHeight() + dockBottom() - 3}px`,
              height: `${sheetHeight()}px`,
              transform: `translate(-50%, ${drag()}px)`,
            }}
          >
            <div
              class="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              aria-hidden="true"
            >
              <span class="h-1.5 w-12 rounded-full bg-line/30" />
            </div>
            <div class="flex items-start justify-between gap-2">
              <DetailTitle picked={pk()} />
              <button type="button" class={ghostButton} onClick={() => proto.select(null)}>
                {t.detail.close}
              </button>
            </div>
            <DetailFacts picked={pk()} />
            <Show when={pk().row}>
              {(row) => (
                <AssignCards
                  row={row()}
                  scroll={proto.form().assignCards === 'scroll'}
                  onPick={(m) => proto.assign(row().id, m)}
                />
              )}
            </Show>
          </section>
        )}
      </Show>

      <nav
        ref={dock}
        aria-label={t.hud.dock}
        class={`${panel} absolute left-1/2 flex -translate-x-1/2 items-center ${
          proto.compact()
            ? 'bottom-0 w-full flex-wrap justify-between gap-x-3 gap-y-2 rounded-b-none px-3 pt-2 pb-3'
            : 'gap-6 px-5 py-2.5'
        }`}
        style={{ bottom: `${dockBottom()}px` }}
      >
        <Show when={proto.form().dock.projectName}>
          <span
            class={`flex items-center gap-2 font-heading whitespace-nowrap ${proto.compact() ? 'basis-full text-sm' : 'text-base'}`}
          >
            <Icon name="project" class={proto.compact() ? 'text-lg' : 'text-2xl'} />
            {ja.projects.ecRenewal}
          </span>
        </Show>
        <For each={proto.form().dock.items}>
          {(id) => (
            <HudItem id={id} proto={proto} dense={proto.compact()} onProblems={() => setDismissed(new Set<string>())} />
          )}
        </For>
      </nav>
    </>
  );
}
