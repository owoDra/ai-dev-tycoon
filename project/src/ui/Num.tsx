import { createEffect, createSignal, on, onCleanup, Show } from 'solid-js';
import { feel } from '../fx/feel';
import { pop, tween } from '../fx/motion';

/**
 * 数値の表示。値が変わったら前の値から自動でカウントアップし、増減に応じて「+/-」のチップを短く出す。
 * チップは色だけでなく矢印の形と符号でも増減を示す。カウント中も読み上げには最終的な値を渡す。
 * 動きを減らす設定では、すぐに新しい値に切り替える（チップは出すが動かさない）。
 */
export function Num(props: {
  value: number;
  format: (value: number) => string;
  /** チップの文字（既定は format に符号を付けたもの） */
  formatDelta?: (delta: number) => string;
  /** この大きさ未満の変化ではチップを出さない（既定は 0：どんな変化でも出す） */
  chipMin?: number;
  /** 増えるのが悪いことか（コストなど）。チップの色を逆にする */
  higherIsWorse?: boolean;
  /** チップを出さない */
  noChip?: boolean;
  class?: string;
}) {
  const [shown, setShown] = createSignal(props.value);
  const [chip, setChip] = createSignal<{ delta: number; key: number } | null>(null);
  let stop = () => {};
  let chipTimer: ReturnType<typeof setTimeout> | undefined;
  let chipKey = 0;

  createEffect(
    on(
      () => props.value,
      (value, prev) => {
        if (prev === undefined) return;
        stop();
        stop = tween(shown(), value, setShown);
        const delta = value - prev;
        if (props.noChip || Math.abs(delta) < (props.chipMin ?? 0) || delta === 0) return;
        // 続けて変わったときは差を足し合わせて1つのチップにする
        const sum = (chip()?.delta ?? 0) + delta;
        setChip({ delta: sum, key: ++chipKey });
        clearTimeout(chipTimer);
        chipTimer = setTimeout(() => setChip(null), feel().chipMs);
      },
    ),
  );
  onCleanup(() => {
    stop();
    clearTimeout(chipTimer);
  });

  const formatDelta = (d: number) =>
    props.formatDelta ? props.formatDelta(d) : `${d > 0 ? '+' : '−'}${props.format(Math.abs(d))}`;
  const good = (d: number) => d > 0 !== (props.higherIsWorse ?? false);

  return (
    <span class={`relative inline-flex items-center ${props.class ?? ''}`}>
      <span class="sr-only">{props.format(props.value)}</span>
      <span aria-hidden="true" class="tabular-nums">
        {props.format(shown())}
      </span>
      <Show when={chip()} keyed>
        {(c) => (
          <span
            ref={(chipEl) => queueMicrotask(() => pop(chipEl))}
            aria-hidden="true"
            data-num-chip={c.delta > 0 ? 'up' : 'down'}
            class="pointer-events-none absolute bottom-full left-0 mb-0.5 inline-flex items-center gap-0.5 rounded-full border-2 border-line px-1.5 font-heading text-[11px] leading-4 whitespace-nowrap shadow-pop"
            classList={{
              'bg-success-soft text-success-ink': good(c.delta),
              'bg-danger-soft text-danger-ink': !good(c.delta),
            }}
          >
            <svg viewBox="0 0 12 12" class="size-2.5 fill-current" aria-hidden="true">
              <path d={c.delta > 0 ? 'M6 2l4 6H2z' : 'M6 10L2 4h8z'} />
            </svg>
            {formatDelta(c.delta)}
          </span>
        )}
      </Show>
    </span>
  );
}
