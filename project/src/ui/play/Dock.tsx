import { animate } from 'motion';
import { createEffect, createMemo, For, type JSX, Match, onCleanup, Show, Switch } from 'solid-js';
import type { GameStore } from '../../app/store';
import { getProject } from '../../content/index';
import type { DockLayout, HudItemId } from '../../content/look/layout';
import { dockFeature } from '../../content/unlocks';
import { isUnlocked } from '../../core/unlocks';
import { reducedMotion } from '../../fx/reduced';
import { ja } from '../../i18n/ja';
import type { ProjectTabsView } from '../../view/board';
import { contextView } from '../../view/context';
import { type HudView, hudView, paceText, type StreakView } from '../../view/hud';
import { Icon } from '../Icon';
import { Num } from '../Num';
import { Meter, panel } from '../parts';
import { contextStatusIcon } from './ContextSheet';
import { ProjectTabs } from './ProjectTabs';

const t = ja.hud;
/** Profit / Person-Day の増減チップを出す最小の変化（円/人日）。見込みの細かな揺れでは出さない */
const PROFIT_CHIP_MIN = 100;

/**
 * 下部のドック（D3「ゲームのドック」）。いま見ている案件の状態だけを出す：先頭に案件名（見出しで、常時表示の項目には数えない）か案件のタブ、
 * 続けて dock.items の項目を並べる。スマホ（compact）では画面幅いっぱいの2段にし、上部に出せない操作の列（controls）を最後に入れる。
 * 値は view/hud.ts から読む。解放の対象になっている項目（content/unlocks.ts の dockFeature）は、解放されるまで出さない。
 */
export function Dock(props: {
  store: GameStore;
  projectId: string;
  layout: DockLayout;
  compact: boolean;
  problemCount: number;
  onProblems: () => void;
  /** Context のシートを開く */
  onContext?: () => void;
  /** 案件のタブ（複数の案件を進めているか、新しい依頼があるときに案件名の代わりに出す） */
  tabs?: ProjectTabsView;
  onSwitch?: (projectId: string) => void;
  onBoard?: () => void;
  /** ドックの最後に入れる操作の列（スマホで、時計・速度・メニューを入れる） */
  controls?: JSX.Element;
  ref?: (el: HTMLElement) => void;
}) {
  const showTabs = () => {
    const tabs = props.tabs;
    return tabs !== undefined && (tabs.tabs.length > 1 || tabs.offers > 0) ? tabs : null;
  };
  const hud = createMemo(() => hudView(props.store.state(), props.projectId));
  const items = createMemo(() =>
    props.layout.items.filter((id) => {
      const feature = dockFeature[id];
      return feature === undefined || isUnlocked(props.store.state(), feature);
    }),
  );
  return (
    <nav
      ref={props.ref}
      aria-label={t.dock}
      class={`${panel} absolute left-1/2 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center ${
        props.compact
          ? 'w-full max-w-full flex-wrap justify-between gap-x-3 gap-y-2 rounded-b-none px-3 pt-2 pb-3'
          : 'gap-5 px-5 py-2.5'
      }`}
      style={{ bottom: `${props.layout.bottom}px` }}
    >
      <Show when={showTabs()}>
        {(tabs) => (
          <ProjectTabs
            view={tabs()}
            compact={props.compact}
            onSwitch={(id) => props.onSwitch?.(id)}
            onBoard={() => props.onBoard?.()}
          />
        )}
      </Show>
      <Show when={props.layout.projectName && !showTabs()}>
        <h1
          class={`flex min-w-0 items-center gap-2 font-heading whitespace-nowrap ${props.compact ? 'basis-full text-sm' : 'text-base'}`}
        >
          <Icon name="project" class={props.compact ? 'text-lg' : 'text-2xl'} />
          <span class="truncate">{getProject(props.projectId).name}</span>
        </h1>
      </Show>
      <Show when={hud()}>
        {(h) => (
          <For each={items()}>
            {(id) => (
              <div data-hud-item={id} class="flex min-w-0 items-center">
                <HudItem
                  id={id}
                  hud={h()}
                  store={props.store}
                  dense={props.compact}
                  problemCount={props.problemCount}
                  onProblems={props.onProblems}
                  projectId={props.projectId}
                  onContext={props.onContext}
                />
              </div>
            )}
          </For>
        )}
      </Show>
      {props.controls}
    </nav>
  );
}

function HudItem(props: {
  id: HudItemId;
  hud: HudView;
  store: GameStore;
  dense: boolean;
  problemCount: number;
  onProblems: () => void;
  projectId: string;
  onContext?: () => void;
}) {
  return (
    <Switch>
      <Match when={props.id === 'spend'}>
        <SpendItem hud={props.hud} dense={props.dense} />
      </Match>
      <Match when={props.id === 'profitPerPersonDay'}>
        <Figure
          icon="money"
          label={props.hud.projected ? `${t.profit}（${t.projected}）` : t.profit}
          value={<Num value={props.hud.profitPerPersonDay} format={paceText} chipMin={PROFIT_CHIP_MIN} />}
          dense={props.dense}
        />
      </Match>
      <Match when={props.id === 'remaining'}>
        <Figure
          icon={props.hud.remaining.overdue ? 'warning' : 'clock'}
          label={props.hud.remaining.overdue ? t.overdue : t.remaining}
          value={t.remainingValue(props.hud.remaining.days, props.hud.remaining.time)}
          dense={props.dense}
          danger={props.hud.remaining.overdue}
        />
      </Match>
      <Match when={props.id === 'utilization'}>
        <fieldset class="flex flex-col gap-0.5" aria-label={t.utilization}>
          <Bar label={t.human} icon="human" ratio={props.hud.human} color="bg-primary-400" dense={props.dense} />
          <div class="flex items-center gap-1.5">
            <Bar label={t.ai} icon="ai" ratio={props.hud.ai} color="bg-success-400" dense={props.dense} />
            <ContextBadge store={props.store} projectId={props.projectId} onOpen={props.onContext} />
            <Show when={isUnlocked(props.store.state(), 'harness')}>
              <StreakBadge streak={props.hud.streak} dense={props.dense} />
            </Show>
          </div>
        </fieldset>
      </Match>
      <Match when={props.id === 'problems'}>
        <button
          type="button"
          class="relative flex size-11 items-center justify-center rounded-md border-[3px] border-line bg-surface text-2xl"
          aria-label={t.problemsCount(props.problemCount)}
          onClick={() => props.onProblems()}
        >
          <Icon name="warning" />
          <Show when={props.problemCount > 0}>
            <span
              class="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border-2 border-line bg-danger-500 font-heading text-[11px] text-ink"
              aria-hidden="true"
            >
              {props.problemCount}
            </span>
          </Show>
        </button>
      </Match>
    </Switch>
  );
}

/**
 * AI の稼働バーの横に出す Context の状態（企画書41章：数字ではなく意味を出す）。押すと Context のシートを開く。
 * 資料のない案件や、Context が未解放なら出さない
 */
const badgeBg = { good: 'bg-surface', cluttered: 'bg-warning-200', overflow: 'bg-danger-200' } as const;

function ContextBadge(props: { store: GameStore; projectId: string; onOpen?: () => void }) {
  const view = createMemo(() => contextView(props.store.state(), props.projectId));
  return (
    <Show when={view()}>
      {(v) => (
        <button
          type="button"
          data-context-badge={v().status}
          class={`flex min-h-6 items-center gap-1 rounded-full border-2 border-line px-1.5 text-[11px] font-bold whitespace-nowrap ${badgeBg[v().status]}`}
          aria-label={ja.context.open(ja.context.status[v().status])}
          onClick={() => props.onOpen?.()}
        >
          <Icon name={contextStatusIcon[v().status]} />
          {ja.context.status[v().status]}
        </button>
      )}
    </Show>
  );
}

/**
 * Autonomy Streak の小さなメーター（企画書23章）。次の節目までの進み具合を細い棒で見せ、
 * 最初の節目を越えると「燃え上がる」（暖色の地と脈動。動きを減らす設定では脈動しない）。色だけでなく文言も変わる
 */
function StreakBadge(props: { streak: StreakView; dense: boolean }) {
  let el!: HTMLDivElement;
  const fire = () => props.streak.level > 0;
  createEffect(() => {
    if (!fire() || reducedMotion() || typeof el.animate !== 'function') return;
    const pulse = animate(el, { scale: [1, 1.08, 1] }, { duration: 0.9, repeat: Number.POSITIVE_INFINITY });
    onCleanup(() => pulse.stop());
  });
  return (
    <div
      ref={el}
      role="img"
      data-streak={fire() ? 'fire' : 'calm'}
      aria-label={t.streakLabel(props.streak.minutes, props.streak.next)}
      class="flex min-h-6 items-center gap-1 rounded-full border-2 border-line px-1.5 text-[11px] font-bold whitespace-nowrap tabular-nums"
      classList={{
        'bg-surface': !fire(),
        'bg-linear-to-r from-warning-300 to-danger-300': fire(),
      }}
    >
      <Icon name="automation" tone={fire() ? 'danger' : undefined} />
      <span>{fire() ? t.streakFire(props.streak.minutes) : t.streak(props.streak.minutes)}</span>
      <Show when={!props.dense}>
        <span class="h-1.5 w-8 overflow-hidden rounded-full border border-line bg-sunken" aria-hidden="true">
          <span
            class="block h-full"
            classList={{ 'bg-success-400': !fire(), 'bg-danger-500': fire() }}
            style={{ width: `${Math.round(props.streak.progress * 100)}%` }}
          />
        </span>
      </Show>
    </div>
  );
}

function Figure(props: {
  icon: 'money' | 'clock' | 'warning';
  label: string;
  value: JSX.Element;
  sub?: string;
  dense: boolean;
  danger?: boolean;
}) {
  return (
    <div class="flex items-center gap-2">
      <Icon name={props.icon} class={props.dense ? 'text-xl' : 'text-2xl'} />
      <div class="flex flex-col leading-tight">
        <span class="text-[11px] font-bold whitespace-nowrap text-ink-muted">{props.label}</span>
        <span
          class={`font-heading whitespace-nowrap tabular-nums ${props.dense ? 'text-base' : 'text-xl'}`}
          classList={{ 'text-danger-ink': props.danger }}
        >
          {props.value}
        </span>
        <Show when={props.sub && !props.dense}>
          <span class="text-[11px] whitespace-nowrap text-ink-muted tabular-nums">{props.sub}</span>
        </Show>
      </div>
    </div>
  );
}

function Bar(props: { label: string; icon: 'human' | 'ai'; ratio: number; color: string; dense: boolean }) {
  return (
    <div class="flex items-center gap-1.5">
      <Icon name={props.icon} class="text-base" />
      <span class="w-7 text-[11px] font-bold">{props.label}</span>
      <Meter
        ratio={props.ratio}
        label={`${t.utilization} ${props.label} ${ja.score.percent(props.ratio)}`}
        color={props.color}
        class={props.dense ? 'w-12' : 'w-20'}
      />
    </div>
  );
}

/**
 * この案件に使った金額と受注額。棒は受注額のうち使った割合で、見込みの利益がマイナスなら危険の色と警告のアイコンにする。
 * 下に見込みの利益（納品後は確定の利益）を添える
 */
function SpendItem(props: { hud: HudView; dense: boolean }) {
  const yen = ja.funds.money;
  const ratio = () => (props.hud.revenue > 0 ? Math.min(1, props.hud.spent / props.hud.revenue) : 0);
  const loss = () => props.hud.projectedProfit < 0;
  return (
    <div class="flex items-center gap-2" data-spend>
      <Icon name={loss() ? 'warning' : 'money'} class={props.dense ? 'text-xl' : 'text-2xl'} />
      <div class="flex flex-col gap-0.5 leading-tight">
        <span class="text-[11px] font-bold whitespace-nowrap text-ink-muted">{t.spend}</span>
        <span class={`font-heading whitespace-nowrap tabular-nums ${props.dense ? 'text-sm' : 'text-lg'}`}>
          {t.spendValue(yen(props.hud.spent), yen(props.hud.revenue))}
        </span>
        <Meter
          ratio={ratio()}
          label={t.spendMeter(yen(props.hud.spent), yen(props.hud.revenue))}
          color={loss() ? 'bg-danger-400' : 'bg-success-400'}
          class={props.dense ? 'w-24' : 'w-36'}
        />
        <span
          class="text-[11px] font-bold whitespace-nowrap tabular-nums"
          classList={{ 'text-danger-ink': loss(), 'text-ink-muted': !loss() }}
          data-profit-outlook
        >
          {t.profitOutlook(props.hud.projected, yen(props.hud.projectedProfit))}
        </span>
      </div>
    </div>
  );
}
