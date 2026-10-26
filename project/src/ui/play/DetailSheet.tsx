import { createSignal, type JSX, onCleanup, onMount, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import { audio } from '../../audio/index';
import type { SheetLayout } from '../../content/look/layout';
import type { AssignModeId } from '../../content/types';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import type { DetailView } from '../../view/detail';
import { Icon } from '../Icon';
import { ghostButton, kindIcon, Meter, modeIcon, panel, StatusIcon } from '../parts';
import { AssignCards } from './AssignCards';

const t = ja.detail;

/**
 * 選んだものの詳細（D3：ドックの上に下から出るシート。企画書33章）。
 * 閉じる操作：閉じるボタン・取っ手を下へスワイプ・Esc（PlayScreen）・ワールドの何もない所をクリック（WorldCanvas）
 */
export function DetailSheet(props: {
  store: GameStore;
  projectId: string;
  detail: DetailView;
  layout: SheetLayout;
  scrollCards: boolean;
  /** シートの下端（px）。ドックのすぐ上 */
  bottom: number;
  /** 画面の高さ（px） */
  viewHeight: number;
  onClose: () => void;
  onAssign: (taskId: string, mode: AssignModeId) => void;
  ref?: (el: HTMLElement) => void;
}) {
  const [drag, setDrag] = createSignal(0);
  let dragFrom: number | null = null;
  let el!: HTMLElement;
  onMount(() => {
    audio.play('panelOpen');
    onCleanup(() => audio.play('panelClose'));
    enter(el, 'below');
  });

  const d = () => props.detail;
  return (
    <section
      ref={(e) => {
        el = e;
        props.ref?.(e);
      }}
      role="dialog"
      aria-modal="false"
      aria-label={d().label}
      data-detail-sheet
      class={`${panel} absolute inset-x-0 mx-auto flex w-full flex-col gap-3 overflow-x-hidden overflow-y-auto rounded-b-none px-4 pt-1 pb-4`}
      style={{
        'max-width': `${props.layout.maxWidth}px`,
        bottom: `${props.bottom}px`,
        height: `${props.viewHeight * props.layout.heightRatio}px`,
        // 出現の動き（motion）が transform を使うので、スワイプのずれは translate で別に持つ
        translate: `0 ${drag()}px`,
      }}
    >
      <div
        class="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
        aria-hidden="true"
        onPointerDown={(e) => {
          dragFrom = e.clientY;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (dragFrom !== null) setDrag(Math.max(0, e.clientY - dragFrom));
        }}
        onPointerUp={() => {
          if (drag() > props.layout.swipeClose) props.onClose();
          dragFrom = null;
          setDrag(0);
        }}
        onPointerCancel={() => {
          dragFrom = null;
          setDrag(0);
        }}
      >
        <span class="h-1.5 w-12 rounded-full bg-line/30" />
      </div>
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-md border-[3px] border-line bg-accent-200 text-2xl">
            <Icon name={kindIcon[d().kind]} />
          </span>
          <div class="flex min-w-0 flex-col leading-tight">
            <span class="text-[11px] font-bold text-ink-muted">{ja.world.kinds[d().kind]}</span>
            <h2 class="truncate font-heading text-lg">{d().label}</h2>
          </div>
        </div>
        <button type="button" class={ghostButton} onClick={() => props.onClose()}>
          {t.close}
        </button>
      </div>
      <Facts detail={d()} />
      <Show when={d().row}>
        {(row) => (
          <AssignCards
            store={props.store}
            projectId={props.projectId}
            row={row()}
            scroll={props.scrollCards}
            onAssign={(mode) => props.onAssign(row().id, mode)}
          />
        )}
      </Show>
    </section>
  );
}

/** 状態・担当・進み具合・品質の見込み・居場所など、選んだものの要点。シートの高さに収まるよう横に並べる */
function Facts(props: { detail: DetailView }) {
  const d = () => props.detail;
  return (
    <dl class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <Show when={d().row}>
        {(row) => (
          <>
            <Fact label={t.status}>
              <StatusIcon status={row().status} />
              {ja.project.status[row().status]}
              <Show when={row().stage}>
                {(s) => <span class="font-normal text-ink-muted">· {ja.stages[s()]}</span>}
              </Show>
            </Fact>
            <Fact label={t.assign}>
              <Show when={row().mode} fallback={<span class="text-danger-ink">{t.unassigned}</span>}>
                {(m) => (
                  <>
                    <Icon name={modeIcon[m()]} />
                    {ja.modes[m()]}
                  </>
                )}
              </Show>
            </Fact>
          </>
        )}
      </Show>
      <Show when={d().progress !== null}>
        <Fact label={t.progress}>
          <Meter ratio={d().progress ?? 0} label={t.progress} color="bg-primary-400" class="w-16" />
          <span class="tabular-nums">{ja.score.percent(d().progress ?? 0)}</span>
        </Fact>
      </Show>
      <Show when={d().row}>
        <Fact label={d().quality?.forecast === false ? t.quality : t.qualityForecast}>
          <span class="tabular-nums">{d().quality ? ja.score.percent(d().quality?.value ?? 0) : t.unassigned}</span>
        </Fact>
      </Show>
      <Show when={d().queue > 0}>
        <Fact label={t.queue} danger>
          <Icon name="bottleneck" />
          {ja.world.queue(d().queue)}
        </Fact>
      </Show>
      <Show when={d().place !== undefined}>
        <Fact label={t.place}>{d().place ?? t.rest}</Fact>
      </Show>
      <Show when={d().work}>
        {(w) => (
          <>
            <Fact label={t.work}>{w().task ?? t.nothing}</Fact>
            <Fact label={t.queue} danger={w().waiting > 0}>
              {t.queueCount(w().waiting)}
            </Fact>
          </>
        )}
      </Show>
    </dl>
  );
}

function Fact(props: { label: string; danger?: boolean; children: JSX.Element }) {
  return (
    <div class="flex items-center gap-1.5">
      <dt class="text-xs text-ink-muted">{props.label}</dt>
      <dd class="flex items-center gap-1 font-bold" classList={{ 'text-danger-ink': props.danger }}>
        {props.children}
      </dd>
    </div>
  );
}
