import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import { textureUrl } from '../../assets/registry';
import { attributeProject, type Impact } from '../../core/attribution';
import { deliveryRating } from '../../core/bidding';
import { encodeResultCode } from '../../core/resultCode';
import { feel } from '../../fx/feel';
import { countUp, enter, morph, pop, prefersReducedMotion } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { paceFormula, paceText } from '../../view/hud';
import {
  companyGrowth,
  type ResultMetric,
  resultRecord,
  resultView,
  type WorkflowSnapshot,
  workflowSnapshot,
} from '../../view/result';
import { type CounterfactualJob, counterfactualJobs, retrospective } from '../../view/retrospective';
import { Icon } from '../Icon';
import { ghostButton, panel, primaryButton, smallButton } from '../parts';
import { ResultCodePanel } from './ResultCodePanel';

const t = ja.screens.result;

/** 主要3指標の値の書式 */
function formatMetric(key: ResultMetric['key'], v: number): string {
  if (key === 'humanTime') return t.hours(v);
  if (key === 'aiCost') return ja.score.yen(v);
  return ja.score.percent(v);
}

/**
 * 結果画面（企画書40章・58〜60章）。数十個の数字を並べず、段階的に開示する。
 * 第1段：トロフィーと Profit / Person-Day のカウントアップ・伸び・ランクのスタンプ
 * 第2段：主要3指標の Before（人間だけの見込み）→ After の変形
 * 第3段（詳しく見る）：一番効いた改善・最大の無駄・次に改善できる場所の3枚のカード
 * 第4段（上級者向け）：工程別の時間・介入の時系列・AI コストの内訳。グラフは2つまでにとどめる
 * 第2段からは、結果を見せ合って比べるための結果コード（コピーと QR コード）を出す
 * 振り返りの「それが無かった場合」の再シミュレーションは、表示中に1件ずつ間を空けて実行する（操作を止めない）
 */
export function ResultScreen(props: {
  store: GameStore;
  projectId: string;
  /** もう一度（単発のプレイ）。会社（案件ボード）では渡さない */
  onRetry?: () => void;
  /** 案件ボードへ戻る（会社） */
  onNext?: () => void;
  onTitle: () => void;
  /** 「この構成を保存する」（Workflow Library への保存は Phase 16） */
  onSaveWorkflow?: (snapshot: WorkflowSnapshot) => void;
}) {
  // 結果画面の表示中に state は変わらないので、開いた時点の値で計算する
  const state = props.store.state();
  const rating = state.board ? deliveryRating(state, props.projectId) : null;
  const view = resultView(state, props.projectId);
  const record = resultRecord(state, props.projectId);
  const attribution = attributeProject(state, props.projectId);
  const [counterfactual, setCounterfactual] = createSignal<ReadonlyMap<string, Impact>>(new Map());
  const [refining, setRefining] = createSignal(true);
  const retro = createMemo(() =>
    view ? retrospective(state, props.projectId, view.score, attribution, counterfactual()) : null,
  );
  const growth = state.board ? companyGrowth(state) : [];
  const [stage, setStage] = createSignal(1);
  const [saved, setSaved] = createSignal(false);

  let el!: HTMLDivElement;
  let big: HTMLSpanElement | undefined;
  let stamp: HTMLSpanElement | undefined;
  const [metricValues, setMetricValues] = createSignal<number[]>(view?.metrics.map((m) => m.before) ?? []);
  const timers: ReturnType<typeof setTimeout>[] = [];
  const stops: (() => void)[] = [];
  const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));

  /** 再シミュレーションを1件ずつ、次のフレーム以降に回して実行する */
  function refine(jobs: readonly CounterfactualJob[]) {
    const acc = new Map<string, Impact>();
    let i = 0;
    const next = () => {
      const job = jobs[i++];
      if (!job) {
        setCounterfactual(acc);
        setRefining(false);
        return;
      }
      const r = job.run();
      const prev = acc.get(job.key);
      acc.set(
        job.key,
        prev
          ? {
              humanMinutes: prev.humanMinutes + r.humanMinutes,
              cost: prev.cost + r.cost,
              quality: prev.quality + r.quality,
            }
          : r,
      );
      later(next, 0);
    };
    later(next, 0);
  }

  onMount(() => {
    enter(el, 'below');
    el.querySelector<HTMLButtonElement>('[data-next], [data-retry]')?.focus();
    if (!view) return;
    const duration = prefersReducedMotion() ? 0 : feel().countUpMs;
    if (big) stops.push(countUp(big, 0, view.score.profitPerPersonDay, paceText));
    later(() => {
      if (stamp) pop(stamp, 2);
      setStage((s) => Math.max(s, 2));
      stops.push(
        morph(
          view.metrics.map((m) => m.before),
          view.metrics.map((m) => m.after),
          setMetricValues,
        ),
      );
      // カウントアップの後に、振り返りの再シミュレーションを始める
      refine(counterfactualJobs(state, props.projectId, attribution));
    }, duration);
  });
  onCleanup(() => {
    for (const id of timers) clearTimeout(id);
    for (const stop of stops) stop();
  });

  const save = () => {
    const snapshot = workflowSnapshot(state, props.projectId);
    if (!snapshot) return;
    props.onSaveWorkflow?.(snapshot);
    setSaved(true);
  };

  return (
    <div
      class="absolute inset-0 flex items-start justify-center overflow-y-auto bg-cover bg-center p-4"
      style={{ 'background-image': `url(${textureUrl('resultBg')})` }}
    >
      <div ref={el} class={`${panel} my-auto flex w-full max-w-lg flex-col items-center gap-4 p-6 text-center`}>
        <Show when={view}>
          {(v) => (
            <>
              <section class="flex flex-col items-center gap-2" data-stage="1">
                <Icon name="trophy" label={t.trophy} class="text-6xl" />
                <p class="font-heading text-2xl">{t.title}</p>
                <Show when={rating !== null}>
                  <p
                    class="flex items-center gap-1 rounded-full border-[3px] border-line bg-accent-200 px-4 py-1 font-heading text-lg"
                    data-reputation
                  >
                    <Icon name={(rating ?? 0) >= 0 ? 'success' : 'warning'} class="text-xl" />
                    {ja.board.reputationChanged(rating ?? 0)}
                  </p>
                </Show>
                <span class="text-xs font-bold text-ink-muted">{t.profitPerPersonDay}</span>
                <div class="flex items-center gap-3">
                  <span ref={big} class="font-heading text-4xl tabular-nums" data-pph>
                    {paceText(v().score.profitPerPersonDay)}
                  </span>
                  <span
                    ref={stamp}
                    class="grid size-12 -rotate-12 place-items-center rounded-full border-4 border-danger-500 font-heading text-2xl text-danger-ink"
                    role="img"
                    aria-label={t.rank(v().rank)}
                    data-rank={v().rank}
                  >
                    {v().rank}
                  </span>
                </div>
                <p class="text-xs text-ink-muted tabular-nums" data-pace-formula>
                  {paceFormula(v().score.profit, v().score.humanMinutes)}
                </p>
                <Show when={v().vsBaseline}>
                  {(ratio) => (
                    <p
                      class="flex flex-wrap items-center justify-center gap-2 text-sm font-bold text-ink-muted"
                      data-baseline
                    >
                      {t.vsBaseline}
                      <span class="rounded-full border-2 border-line bg-accent-200 px-2 font-heading text-lg text-ink">
                        {t.change(ratio())}
                      </span>
                      <span class="tabular-nums">
                        （{t.baseline} {paceText(v().baseline)}）
                      </span>
                    </p>
                  )}
                </Show>
                <Show when={v().previous}>
                  {(prev) => (
                    <p class="text-xs font-bold text-ink-muted" data-previous>
                      {t.vsPrevious(prev().name)} {t.change(prev().ratio)}
                    </p>
                  )}
                </Show>
              </section>

              <Show when={stage() >= 2}>
                <section class="w-full" data-stage="2">
                  <p class="mb-1 text-xs font-bold text-ink-muted">{t.metricsTitle}</p>
                  <dl class="grid grid-cols-3 gap-2">
                    <For each={v().metrics}>
                      {(m, i) => (
                        <div class="rounded-md border-2 border-line bg-sunken p-2" data-metric={m.key}>
                          <dt class="text-xs font-bold text-ink-muted">{t[m.key]}</dt>
                          <dd class="font-heading text-xl tabular-nums">
                            {formatMetric(m.key, metricValues()[i()] ?? m.after)}
                          </dd>
                          <dd class="text-xs text-ink-muted tabular-nums">
                            {formatMetric(m.key, m.before)} → {formatMetric(m.key, m.after)}
                          </dd>
                        </div>
                      )}
                    </For>
                  </dl>
                  <Show when={stage() === 2}>
                    <button type="button" class={`${ghostButton} mt-3`} data-more onClick={() => setStage(3)}>
                      {t.more}
                    </button>
                  </Show>
                </section>
              </Show>

              <Show when={stage() >= 3 && retro()}>
                {(r) => (
                  <section class="flex w-full flex-col gap-2 text-left" data-stage="3">
                    <RetroCardView icon="success" label={t.cards.best} card={r().best} />
                    <RetroCardView icon="warning" label={t.cards.waste} card={r().waste} />
                    <RetroCardView icon="bottleneck" label={t.cards.next} card={r().next} />
                    <p class="text-xs text-ink-muted" aria-live="polite" data-refining={refining()}>
                      {refining() ? t.refining : t.refined}
                    </p>
                    <Show when={stage() === 3}>
                      <button type="button" class={smallButton} data-advanced onClick={() => setStage(4)}>
                        {t.advanced}
                      </button>
                    </Show>
                  </section>
                )}
              </Show>

              <Show when={stage() >= 4}>
                <Details view={v()} />
              </Show>

              <Show when={stage() >= 2 && record}>{(r) => <ResultCodePanel code={encodeResultCode(r())} />}</Show>

              <Show when={growth.length > 1}>
                <section class="w-full text-left" data-campaign>
                  <p class="font-heading">{t.campaignTitle}</p>
                  <p class="text-xs text-ink-muted">{t.campaignLead}</p>
                  <ol class="mt-1 flex flex-col gap-1">
                    <For each={growth}>
                      {(g) => (
                        <li class="grid grid-cols-[1fr_auto] items-center gap-x-2 text-sm" data-growth={g.projectId}>
                          <span class="font-bold">{g.name}</span>
                          <span class="tabular-nums">{paceText(g.profitPerPersonDay)}</span>
                          <span class="h-2 rounded-full bg-sunken">
                            <span
                              class="block h-2 rounded-full bg-primary-500"
                              style={{ width: `${Math.min(100, g.humanShare * 100)}%` }}
                            />
                          </span>
                          <span class="text-xs text-ink-muted tabular-nums">
                            {t.humanTime} {t.hours(g.humanMinutes)}（{ja.score.percent(g.humanShare)}）
                          </span>
                        </li>
                      )}
                    </For>
                  </ol>
                </section>
              </Show>
            </>
          )}
        </Show>
        <div class="flex flex-wrap justify-center gap-2">
          <Show when={props.onNext}>
            {(next) => (
              <button type="button" data-next class={primaryButton} onClick={() => next()()}>
                {t.next}
              </button>
            )}
          </Show>
          <Show when={props.onRetry}>
            {(retry) => (
              <button type="button" data-retry class={primaryButton} onClick={() => retry()()}>
                {t.retry}
              </button>
            )}
          </Show>
          {/* 保存先（onSaveWorkflow）を渡されたときだけ出す（押しても何も残らないボタンにしない） */}
          <Show when={view && props.onSaveWorkflow}>
            <button type="button" class={ghostButton} data-save-workflow disabled={saved()} onClick={save}>
              <Icon name={saved() ? 'success' : 'workflow'} />
              {saved() ? t.savedWorkflow : t.saveWorkflow}
            </button>
          </Show>
          <button type="button" class={ghostButton} onClick={() => props.onTitle()}>
            {t.toTitle}
          </button>
        </div>
      </div>
    </div>
  );
}

function RetroCardView(props: {
  icon: 'success' | 'warning' | 'bottleneck';
  label: string;
  card: { readonly kind: string; readonly title: string; readonly body: string };
}) {
  return (
    <article class="flex items-start gap-2 rounded-md border-2 border-line bg-surface p-3" data-card={props.card.kind}>
      <Icon name={props.icon} class="mt-1 text-2xl" />
      <div>
        <p class="text-xs font-bold text-ink-muted">{props.label}</p>
        <p class="font-heading text-lg">{props.card.title}</p>
        <p class="text-sm">{props.card.body}</p>
      </div>
    </article>
  );
}

/** 第4段：工程別の時間（棒）・介入の時系列（帯）・AI コストの内訳（一覧） */
function Details(props: { view: NonNullable<ReturnType<typeof resultView>> }) {
  const maxStage = () => Math.max(1, ...props.view.stages.map((s) => s.minutes));
  return (
    <section class="flex w-full flex-col gap-4 text-left text-sm" data-stage="4">
      <div>
        <p class="font-bold">{t.stagesTitle}</p>
        <ul class="mt-1 flex flex-col gap-1">
          <For each={props.view.stages}>
            {(s) => (
              <li class="grid grid-cols-[8rem_1fr_auto] items-center gap-2">
                <span class="truncate" title={s.name}>
                  <Icon name={s.stage === 'review' ? 'review' : 'implementation'} /> {s.name}
                </span>
                <span class="h-2 rounded-full bg-sunken">
                  <span
                    class="block h-2 rounded-full bg-primary-500"
                    style={{ width: `${(s.minutes / maxStage()) * 100}%` }}
                  />
                </span>
                <span class="tabular-nums">{t.hours(s.minutes)}</span>
              </li>
            )}
          </For>
        </ul>
      </div>
      <div>
        <p class="font-bold">{t.timelineTitle}</p>
        <Show when={props.view.timeline.length > 0} fallback={<p class="text-ink-muted">{t.noInterventions}</p>}>
          <ul class="mt-1 flex flex-col gap-1">
            <For each={props.view.timeline}>
              {(m) => (
                <li
                  class="grid grid-cols-[8rem_1fr] items-center gap-2"
                  title={t.timelineItem(m.name, m.interventions)}
                >
                  <span class="truncate">{t.timelineItem(m.name, m.interventions)}</span>
                  <span class="relative h-3 rounded-full bg-sunken">
                    <span
                      class="absolute top-0 h-3 rounded-full bg-warning-400"
                      style={{ left: `${m.start * 100}%`, width: `${Math.max(1, (m.end - m.start) * 100)}%` }}
                    />
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
      <div>
        <p class="font-bold">
          {t.costTitle}（{t.costTotal(props.view.costs.reduce((sum, c) => sum + c.yen, 0))}）
        </p>
        <dl class="mt-1 grid grid-cols-[1fr_auto] gap-x-4">
          <For each={props.view.costs}>
            {(c) => (
              <>
                <dt class="truncate text-ink-muted">{c.label}</dt>
                <dd class="text-right tabular-nums">{ja.score.yen(c.yen)}</dd>
              </>
            )}
          </For>
        </dl>
      </div>
    </section>
  );
}
