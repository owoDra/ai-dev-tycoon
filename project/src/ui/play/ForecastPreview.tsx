import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from 'solid-js';
import type { AssignModeId } from '../../content/types';
import { morph } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import type { AssignForecast, ForecastMetrics } from '../../view/forecast';

const t = ja.forecast;

export type Direction = 'better' | 'worse' | 'same';

/** 小さすぎる差は「変わらない」とみなす（表示の丸めと合わせる） */
const EPSILON = { humanMinutes: 3, aiCost: 1, quality: 0.005 } as const;

interface Row {
  key: keyof ForecastMetrics;
  label: string;
  format: (v: number) => string;
  /** 小さいほどよいか */
  lowerIsBetter: boolean;
}

const rows: readonly Row[] = [
  { key: 'humanMinutes', label: t.humanTime, format: t.hours, lowerIsBetter: true },
  { key: 'aiCost', label: t.aiCost, format: t.yen, lowerIsBetter: true },
  { key: 'quality', label: t.quality, format: t.percent, lowerIsBetter: false },
];

function direction(row: Row, before: number, after: number): Direction {
  const diff = after - before;
  if (Math.abs(diff) < EPSILON[row.key]) return 'same';
  return diff < 0 === row.lowerIsBetter ? 'better' : 'worse';
}

/** 担当変更のプレビュー：人間時間・AIコスト・品質を Before → After で横に並べ、よくなるか悪くなるかを形と文字でも示す */
export function ForecastPreview(props: { forecast: (AssignForecast & { mode: AssignModeId }) | null }) {
  return (
    <Show when={props.forecast} fallback={<p class="text-xs text-ink-muted">{t.hint}</p>}>
      {(f) => (
        <section aria-live="polite" aria-label={t.title} class="min-w-0">
          <h3 class="text-xs font-bold text-ink-muted">
            {t.title}：{ja.modes[f().mode]}
          </h3>
          <dl class="flex flex-wrap gap-x-4 gap-y-1">
            <For each={rows}>
              {(row) => {
                const before = () => f().before?.[row.key];
                const after = () => f().after[row.key];
                const dir = (): Direction => {
                  const b = before();
                  return b === undefined ? 'same' : direction(row, b, after());
                };
                return (
                  <div class="flex flex-col">
                    <dt class="text-[11px] text-ink-muted">{row.label}</dt>
                    <dd class="flex items-center gap-1 text-sm whitespace-nowrap">
                      <span class="text-ink-muted tabular-nums">
                        {before() === undefined ? t.none : row.format(before() ?? 0)}
                      </span>
                      <span aria-hidden="true">→</span>
                      <span class="font-heading tabular-nums" data-dir={dir()}>
                        <MorphValue from={before()} to={after()} format={row.format} />
                      </span>
                      <Show when={before() !== undefined}>
                        <Trend dir={dir()} />
                      </Show>
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

/**
 * After の数字。予測が変わるたびに Before の値から After の値へ変形して見せる（企画書42章「Before → After が Morph」）。
 * 読み上げには最終的な値を渡す
 */
export function MorphValue(props: { from: number | undefined; to: number; format: (v: number) => string }) {
  const to = createMemo(() => props.to);
  const [shown, setShown] = createSignal(props.to);
  let stop = () => {};
  createEffect(
    on(
      to,
      (value) => {
        stop();
        stop = morph([props.from ?? shown()], [value], ([v]) => setShown(v ?? value));
      },
      { defer: true },
    ),
  );
  onCleanup(() => stop());
  return (
    <>
      <span class="sr-only">{props.format(props.to)}</span>
      <span aria-hidden="true">{props.format(shown())}</span>
    </>
  );
}

export function Trend(props: { dir: Direction }) {
  return (
    <span
      class="inline-flex items-center gap-0.5 rounded-full px-1.5 text-[11px] font-bold"
      classList={{
        'bg-success-soft text-success-ink': props.dir === 'better',
        'bg-danger-soft text-danger-ink': props.dir === 'worse',
        'bg-sunken text-ink-muted': props.dir === 'same',
      }}
    >
      <svg viewBox="0 0 12 12" class="size-3 fill-current" aria-hidden="true">
        <path d={props.dir === 'better' ? 'M6 2l4 6H2z' : props.dir === 'worse' ? 'M6 10L2 4h8z' : 'M2 5h8v2H2z'} />
      </svg>
      {t[props.dir]}
    </span>
  );
}
