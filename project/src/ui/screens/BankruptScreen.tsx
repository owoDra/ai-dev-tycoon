import { onMount, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import type { ValuationSample } from '../../core/state';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { bankruptView } from '../../view/fiscal';
import { Icon } from '../Icon';
import { ghostButton, panel, primaryButton } from '../parts';

const t = ja.funds;

/** グラフの描画範囲（viewBox の単位） */
const W = 320;
const H = 140;
const PAD = 8;

/** 時価総額（上場前は推定の企業価値）の推移の折れ線（SVG）。最高値に印を付け、ゼロの線を引く */
export function ValuationChart(props: {
  samples: readonly ValuationSample[];
  peak: ValuationSample | null;
  /** 上場しているか（時価総額と呼ぶか、企業価値と呼ぶか） */
  listed: boolean;
}) {
  const points = () => {
    const s = props.samples;
    if (s.length === 0) return [];
    const first = s[0]?.day ?? 0;
    const span = Math.max(1, (s.at(-1)?.day ?? first) - first);
    const max = Math.max(1, ...s.map((p) => p.valuation));
    return s.map((p) => ({
      x: PAD + ((p.day - first) / span) * (W - PAD * 2),
      y: H - PAD - (p.valuation / max) * (H - PAD * 2),
      p,
    }));
  };
  const path = () =>
    points()
      .map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)},${q.y.toFixed(1)}`)
      .join(' ');
  const peakPoint = () => points().find((q) => q.p === props.peak);
  const last = () => props.samples.at(-1);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      class="w-full rounded-md border-2 border-line bg-sunken"
      role="img"
      aria-label={t.chartLabel(props.listed, t.oku(props.peak?.valuation ?? 0), t.oku(last()?.valuation ?? 0))}
      data-valuation-chart
    >
      <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} class="stroke-ink-muted" stroke-width="1" />
      <path
        d={`${path()} L${(points().at(-1)?.x ?? PAD).toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`}
        class="fill-primary-200"
      />
      <path d={path()} class="fill-none stroke-primary-600" stroke-width="2.5" stroke-linejoin="round" />
      <Show when={peakPoint()}>
        {(q) => <circle cx={q().x} cy={q().y} r="4" class="fill-accent-400 stroke-line" stroke-width="2" data-peak />}
      </Show>
      <Show when={points().at(-1)}>
        {(q) => <circle cx={q().x} cy={q().y} r="4" class="fill-danger-400 stroke-line" stroke-width="2" />}
      </Show>
    </svg>
  );
}

/**
 * 倒産の画面（ゲームオーバー）。会社が最も輝いていたときから倒産までの時価総額の推移と、会社の歩みを見せる
 */
export function BankruptScreen(props: { store: GameStore; onRestart: () => void; onTitle: () => void }) {
  const view = bankruptView(props.store.state());
  let el!: HTMLDivElement;
  onMount(() => {
    enter(el, 'below');
    el.querySelector<HTMLButtonElement>('[data-restart]')?.focus();
  });
  return (
    <div
      class="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-line/40 p-4"
      data-bankrupt-screen
    >
      <div
        ref={el}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bankrupt-title"
        class={`${panel} flex w-full max-w-lg flex-col gap-3 p-5`}
      >
        <h2 id="bankrupt-title" class="flex items-center gap-2 font-heading text-2xl">
          <Icon name="failure" /> {t.bankruptTitle}
        </h2>
        <p class="text-sm text-ink-muted">{t.bankruptLead}</p>
        <h3 class="text-xs font-bold text-ink-muted">{t.chart(view.listed)}</h3>
        <ValuationChart samples={view.samples} peak={view.peak} listed={view.listed} />
        <Show when={view.peak}>
          {(p) => (
            <p class="text-sm font-bold" data-peak-text>
              <Icon name="trophy" /> {t.peak(t.oku(p().valuation), p().day)}
            </p>
          )}
        </Show>
        <ul class="flex flex-wrap gap-2 text-xs font-bold">
          <li class="rounded-full border-2 border-line bg-sunken px-2">{t.days(view.days)}</li>
          <li class="rounded-full border-2 border-line bg-sunken px-2">{t.delivered(view.delivered)}</li>
          <li class="rounded-full border-2 border-line bg-sunken px-2">{t.tier(view.tier)}</li>
          <li class="rounded-full border-2 border-line bg-sunken px-2">{t.fiscal(view.fiscalCount)}</li>
          <li class="rounded-full border-2 border-line bg-sunken px-2">{t.achievements(view.achievements)}</li>
        </ul>
        <div class="flex flex-wrap justify-end gap-2">
          <button type="button" class={ghostButton} data-title onClick={() => props.onTitle()}>
            {t.toTitle}
          </button>
          <button type="button" class={primaryButton} data-restart onClick={() => props.onRestart()}>
            {t.restart}
          </button>
        </div>
      </div>
    </div>
  );
}
