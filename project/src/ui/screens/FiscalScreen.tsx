import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import { encodeFiscalCode } from '../../core/resultCode';
import { feel } from '../../fx/feel';
import { countUp, enter, pop, prefersReducedMotion } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { type FiscalMetric, fiscalRecord, fiscalView } from '../../view/fiscal';
import { Icon } from '../Icon';
import { ghostButton, Meter, panel, primaryButton, smallButton } from '../parts';
import { ResultCodePanel } from './ResultCodePanel';

const t = ja.fiscal;

function formatMetric(key: FiscalMetric['key'], v: number): string {
  if (key === 'reputation') return Math.round(v).toString();
  if (key === 'delivered') return ja.company.deliveredCount(v);
  return ja.funds.oku(v);
}

/**
 * 決算の画面。期の終わりに一時停止して出し、数字を段階的に開示する（結果画面と同じ4段構成）。
 * 第1段：利益 / 人日 のカウントアップと前期比・増益 / 減益のスタンプ・規模（格付け）の変化
 * 第2段：売上・利益・評判・納品数の前期 → 今期と、決算の結果コード
 * 第3段（内訳を見る）：チームごとの内訳・いちばん稼いだ / 苦しんだ案件・後半の事件・この期の実績
 * 第4段（推移を見る）：直近の期の利益と時価総額の棒グラフ、次の目標
 */
export function FiscalScreen(props: { store: GameStore; no: number; onNext: () => void; onTitle: () => void }) {
  // 表示中は一時停止しているので、開いた時点の値で計算する
  const state = props.store.state();
  const view = fiscalView(state, props.no);
  const [stage, setStage] = createSignal(1);
  let el!: HTMLDivElement;
  let big: HTMLSpanElement | undefined;
  let stamp: HTMLSpanElement | undefined;
  const stops: (() => void)[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];

  onMount(() => {
    enter(el, 'below');
    el.querySelector<HTMLButtonElement>('[data-next]')?.focus();
    if (!view) return;
    if (big) stops.push(countUp(big, 0, view.report.profitPerPersonDay, ja.hud.yenPerPersonDay));
    const duration = prefersReducedMotion() ? 0 : feel().countUpMs;
    timers.push(
      setTimeout(() => {
        if (stamp) pop(stamp, 2);
        setStage((s) => Math.max(s, 2));
      }, duration),
    );
  });
  onCleanup(() => {
    for (const s of stops) s();
    for (const id of timers) clearTimeout(id);
  });

  return (
    <div
      class="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-line/30 p-4"
      data-fiscal-screen
    >
      <div
        ref={el}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fiscal-title"
        class={`${panel} my-auto flex w-full max-w-lg flex-col gap-3 p-5`}
      >
        <Show when={view} fallback={<p>{t.first}</p>}>
          {(v) => (
            <>
              <header class="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="fiscal-title" class="font-heading text-xl">
                  <Icon name="trophy" /> {t.title(v().report.no)}
                </h2>
                <span class="text-xs text-ink-muted">{t.period(v().report.startDay, v().report.endDay)}</span>
              </header>
              {/* 第1段 */}
              <section class="flex flex-col items-center gap-1 text-center" data-stage="1">
                <span class="text-xs font-bold text-ink-muted">{t.ppd}</span>
                <span ref={big} class="font-heading text-3xl tabular-nums" data-fiscal-ppd>
                  {ja.hud.yenPerPersonDay(v().report.profitPerPersonDay)}
                </span>
                <span class="flex items-center gap-2 text-sm">
                  <span
                    ref={stamp}
                    class="rounded-full border-2 border-line px-2 font-heading"
                    classList={{ 'bg-success-200': v().report.profit >= 0, 'bg-danger-200': v().report.profit < 0 }}
                    data-stamp={v().report.profit >= 0 ? 'up' : 'down'}
                  >
                    <Icon name={v().report.profit >= 0 ? 'success' : 'failure'} />{' '}
                    {v().report.profit >= 0 ? t.up : t.down}
                  </span>
                  <span data-vs-previous>{v().vsPrevious === null ? t.first : t.vsPrevious(v().vsPrevious ?? 1)}</span>
                </span>
                <span class="text-sm font-bold" data-fiscal-tier>
                  <Show when={v().tier.promoted} fallback={v().tier.after}>
                    <Icon name="trophy" /> {t.promoted(v().tier.before ?? '', v().tier.after)}
                  </Show>
                </span>
              </section>
              {/* 第2段 */}
              <Show when={stage() >= 2}>
                <dl class="grid grid-cols-2 gap-2" data-stage="2">
                  <For each={v().metrics}>
                    {(m) => (
                      <div class="rounded-md border-2 border-line bg-sunken p-2" data-metric={m.key}>
                        <dt class="text-xs font-bold text-ink-muted">{t.metrics[m.key]}</dt>
                        <dd class="flex flex-wrap items-baseline gap-1 tabular-nums">
                          <span class="text-xs text-ink-muted">
                            {m.before === null ? t.noPrevious : formatMetric(m.key, m.before)}
                          </span>
                          <span aria-hidden="true">→</span>
                          <strong class="font-heading">{formatMetric(m.key, m.after)}</strong>
                        </dd>
                      </div>
                    )}
                  </For>
                  <div class="rounded-md border-2 border-line bg-sunken p-2">
                    <dt class="text-xs font-bold text-ink-muted">{t.cash}</dt>
                    <dd class="font-heading tabular-nums" classList={{ 'text-danger-ink': v().report.cash < 0 }}>
                      {ja.funds.oku(v().report.cash)}
                    </dd>
                  </div>
                  <div class="rounded-md border-2 border-line bg-sunken p-2">
                    <dt class="text-xs font-bold text-ink-muted">{t.valuation}</dt>
                    <dd class="font-heading tabular-nums">{ja.funds.oku(v().report.valuation)}</dd>
                  </div>
                </dl>
                <ResultCodePanel code={encodeFiscalCode(fiscalRecord(state, v().report))} />
                <div class="flex flex-wrap gap-2">
                  <Show when={stage() < 3}>
                    <button type="button" class={smallButton} data-more onClick={() => setStage(3)}>
                      {t.more}
                    </button>
                  </Show>
                  <Show when={stage() === 3}>
                    <button type="button" class={smallButton} data-advanced onClick={() => setStage(4)}>
                      {t.advanced}
                    </button>
                  </Show>
                </div>
              </Show>
              {/* 第3段 */}
              <Show when={stage() >= 3}>
                <section class="flex flex-col gap-2 text-sm" data-stage="3">
                  <h3 class="text-xs font-bold text-ink-muted">{t.teams}</h3>
                  <ul class="flex flex-col gap-1">
                    <For each={v().teams}>
                      {(row) => (
                        <li class="flex flex-wrap justify-between gap-x-2" data-team-row={row.teamId}>
                          <span class="font-bold">{row.name}</span>
                          <span class="tabular-nums">
                            {t.teamRow(row.delivered)} · {ja.funds.oku(row.profit)} ·{' '}
                            {ja.hud.yenPerPersonDay(row.profitPerPersonDay)}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show when={v().best}>
                    {(b) => (
                      <p data-best>
                        <Icon name="success" /> {t.best}：{b().name}（{ja.hud.yenPerPersonDay(b().profitPerPersonDay)}）
                      </p>
                    )}
                  </Show>
                  <Show when={v().worst}>
                    {(w) => (
                      <p data-worst>
                        <Icon name="warning" /> {t.worst}：{w().name}（{ja.hud.yenPerPersonDay(w().profitPerPersonDay)}
                        ）
                      </p>
                    )}
                  </Show>
                  <p class="text-xs text-ink-muted">{t.events(v().report.outages, v().report.poached)}</p>
                  <Show when={v().achievements.length > 0}>
                    <h3 class="text-xs font-bold text-ink-muted">{t.achievements}</h3>
                    <ul class="flex flex-wrap gap-1">
                      <For each={v().achievements}>
                        {(a) => (
                          <li
                            class="rounded-full border-2 border-line bg-accent-200 px-2 text-xs font-bold"
                            data-fiscal-achievement={a.id}
                          >
                            <Icon name={a.icon} /> {a.name}
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </section>
              </Show>
              {/* 第4段 */}
              <Show when={stage() >= 4}>
                <section class="flex flex-col gap-2 text-xs" data-stage="4">
                  <h3 class="font-bold text-ink-muted">{t.trend}</h3>
                  <TrendBars
                    rows={v().trend.map((r) => ({ label: ja.fiscal.period2(r.no), value: r.profit }))}
                    title={t.trendProfit}
                  />
                  <TrendBars
                    rows={v().trend.map((r) => ({ label: ja.fiscal.period2(r.no), value: r.valuation }))}
                    title={t.trendValuation}
                  />
                  <p class="font-bold">{ja.company.next(v().goal.tier.name)}</p>
                </section>
              </Show>
            </>
          )}
        </Show>
        <div class="flex flex-wrap justify-end gap-2">
          <button type="button" class={ghostButton} data-title onClick={() => props.onTitle()}>
            {t.title2}
          </button>
          <button type="button" class={primaryButton} data-next onClick={() => props.onNext()}>
            {t.next}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 期ごとの値の横棒（マイナスは赤で、ラベルの数字も添える） */
function TrendBars(props: { title: string; rows: readonly { label: string; value: number }[] }) {
  const max = () => Math.max(1, ...props.rows.map((r) => Math.abs(r.value)));
  return (
    <div data-trend={props.title}>
      <p class="font-bold">{props.title}</p>
      <ul class="flex flex-col gap-0.5">
        <For each={props.rows}>
          {(r) => (
            <li class="flex items-center gap-2">
              <span class="w-12 shrink-0">{r.label}</span>
              <Meter
                ratio={Math.abs(r.value) / max()}
                label={`${r.label} ${ja.funds.oku(r.value)}`}
                color={r.value >= 0 ? 'bg-primary-400' : 'bg-danger-400'}
                class="w-full flex-1"
              />
              <span class="w-20 shrink-0 text-right tabular-nums">{ja.funds.oku(r.value)}</span>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
