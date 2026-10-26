import { Index, onMount, Show } from 'solid-js';
import type { ToastLayout } from '../../content/look/layout';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import type { Advice } from '../../view/advice';
import { Icon } from '../Icon';
import { panel, primaryButton, smallButton } from '../parts';

const t = ja.advice;

/**
 * 「次に対応すべき問題」のトースト（D3：上に積み重ねる。PC は右上、スマホは上端に1件）。
 * 問題 → 原因 → 次の行動 の3段で見せ、「見に行く」で該当する島を選んでカメラを寄せる。
 * 「あとで」で閉じたものは、ドックの問題ボタンで出し直す。
 */
export function ProblemToasts(props: {
  problems: readonly Advice[];
  layout: ToastLayout;
  dismissible: boolean;
  onGo: (advice: Advice) => void;
  onLater: (advice: Advice) => void;
}) {
  return (
    <section
      aria-label={t.title}
      class={`pointer-events-none absolute top-2 flex flex-col gap-2 ${props.layout.width === null ? 'inset-x-2' : 'right-3 max-w-[calc(100%-1.5rem)]'}`}
      style={{ width: props.layout.width === null ? undefined : `${props.layout.width}px` }}
    >
      <Index each={props.problems.slice(0, props.layout.max)}>
        {(p) => <ProblemCard advice={p()} dismissible={props.dismissible} onGo={props.onGo} onLater={props.onLater} />}
      </Index>
    </section>
  );
}

function ProblemCard(props: {
  advice: Advice;
  dismissible: boolean;
  onGo: (advice: Advice) => void;
  onLater: (advice: Advice) => void;
}) {
  let el!: HTMLElement;
  onMount(() => enter(el, 'above'));
  return (
    <article
      ref={el}
      data-problem={props.advice.id}
      class={`${panel} pointer-events-auto flex items-center gap-2 p-2.5`}
      classList={{
        'border-danger-600': props.advice.severity === 'danger',
        'border-warning-600': props.advice.severity === 'warning',
      }}
    >
      <ol class="flex min-w-0 flex-1 flex-col gap-0.5 text-xs">
        <li class="flex items-start gap-1.5">
          <Icon name={props.advice.icon} class="mt-0.5 text-base" tone={props.advice.severity} />
          <span class="font-bold">
            <span class="sr-only">{t.problemLabel}：</span>
            {props.advice.problem}
          </span>
        </li>
        <li class="flex items-start gap-1.5 text-ink-muted">
          <span class="mt-px shrink-0 rounded bg-sunken px-1 text-[10px] font-bold">{t.causeLabel}</span>
          <span>{props.advice.cause}</span>
        </li>
        <li class="flex items-start gap-1.5">
          <span class="mt-px shrink-0 rounded bg-accent-200 px-1 text-[10px] font-bold">{t.actionLabel}</span>
          <span class="font-bold">{props.advice.action}</span>
        </li>
      </ol>
      <div class="flex shrink-0 flex-col items-center gap-1">
        <button type="button" class={`${primaryButton} px-3 text-sm`} onClick={() => props.onGo(props.advice)}>
          {t.go}
        </button>
        <Show when={props.dismissible}>
          <button type="button" class={smallButton} onClick={() => props.onLater(props.advice)}>
            {t.later}
          </button>
        </Show>
      </div>
    </article>
  );
}
