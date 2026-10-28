import { animate } from 'motion';
import { createEffect, createMemo, createSignal, For, type JSX, Match, onCleanup, Show, Switch } from 'solid-js';
import type { GameStore } from '../../app/store';
import { getProject } from '../../content/index';
import type { DockLayout, DockTabsLayout, HudItemId } from '../../content/look/layout';
import { dockFeature } from '../../content/unlocks';
import { freshMenus, isUnlocked } from '../../core/unlocks';
import { reducedMotion } from '../../fx/reduced';
import { ja } from '../../i18n/ja';
import type { ProjectTabsView } from '../../view/board';
import { contextView } from '../../view/context';
import { type HudView, hudView, paceText, type StreakView } from '../../view/hud';
import { Icon } from '../Icon';
import { Num } from '../Num';
import { Meter, NewBadge, panel } from '../parts';
import { contextStatusIcon } from './ContextSheet';
import { ProjectTabs } from './ProjectTabs';

const t = ja.hud;
/** Profit / Person-Day の増減チップを出す最小の変化（円/人日）。見込みの細かな揺れでは出さない */
const PROFIT_CHIP_MIN = 100;

/** スマホでドックの2段目（操作の段）に回す項目。押して使うボタンなので、状態の段には置かない */
const actionItems: ReadonlySet<HudItemId> = new Set(['problems']);

/**
 * 下部のドック（D3「ゲームのドック」）。いま見ている案件の状態だけを出す：先頭に案件名（見出しで、常時表示の項目には数えない）か案件のタブ、
 * 続けて dock.items の項目を並べる。dock.details の項目は「詳細」のボタンで、ドックの上に開く。
 * ホーム（projectId が null）では案件の項目の代わりに、進行中の案件のタブ・引き合いの入口・結果待ちの数を出す。
 * スマホ（compact）では画面幅いっぱいの2段にする：1段目に案件名と状態（利益・納期）、2段目に問題・詳細と操作の列（controls。メニュー）。
 * 値は view/hud.ts から読む。解放の対象になっている項目（content/unlocks.ts の dockFeature）は、解放されるまで出さない。
 */
export function Dock(props: {
  store: GameStore;
  /** いま見ている案件。null ならホーム（会社のオフィス） */
  projectId: string | null;
  layout: DockLayout;
  compact: boolean;
  problemCount: number;
  onProblems: () => void;
  /** Context のシートを開く */
  onContext?: () => void;
  /** 案件のタブ（複数の案件を進めているか、新しい依頼があるときに案件名の代わりに出す） */
  tabs?: ProjectTabsView;
  onSwitch?: (projectId: string) => void;
  /** 案件ボードのシートを開く */
  onBoard?: () => void;
  /** ホームへ戻る（タブの「オフィス」） */
  onHome?: () => void;
  /** ドックの最後（スマホでは2段目）に入れる操作の列（スマホで、メニューを入れる） */
  controls?: JSX.Element;
  ref?: (el: HTMLElement) => void;
}) {
  const showTabs = () => {
    const tabs = props.tabs;
    return tabs !== undefined && props.projectId !== null && (tabs.tabs.length > 1 || tabs.offers > 0) ? tabs : null;
  };
  const hud = createMemo(() => (props.projectId === null ? null : hudView(props.store.state(), props.projectId)));
  const unlocked = (id: HudItemId) => {
    const feature = dockFeature[id];
    return feature === undefined || isUnlocked(props.store.state(), feature);
  };
  const items = createMemo(() => props.layout.items.filter(unlocked));
  const details = createMemo(() => props.layout.details.filter(unlocked));
  const [detailsOpen, setDetailsOpen] = createSignal(false);
  const hudItems = (ids: readonly HudItemId[], dense: boolean) => (
    <Show when={hud() && props.projectId ? { h: hud() as HudView, projectId: props.projectId } : null}>
      {(v) => (
        <For each={ids}>
          {(id) => (
            <div data-hud-item={id} class="flex min-w-0 shrink-0 items-center">
              <HudItem
                id={id}
                hud={v().h}
                store={props.store}
                dense={dense}
                problemCount={props.problemCount}
                onProblems={props.onProblems}
                projectId={v().projectId}
                onContext={props.onContext}
              />
            </div>
          )}
        </For>
      )}
    </Show>
  );
  /** 見出し（案件名かタブ）。スマホとPCの並びで別々に作る（同じ要素を2か所で使い回さない） */
  const heading = () => (
    <>
      <Show when={showTabs()}>
        {(tabs) => (
          <ProjectTabs
            view={tabs()}
            compact={props.compact}
            onSwitch={(id) => props.onSwitch?.(id)}
            onBoard={() => props.onBoard?.()}
            onHome={props.onHome}
            limit={props.layout.tabs}
          />
        )}
      </Show>
      <Show when={props.projectId === null}>
        <HomeItems
          tabs={props.tabs}
          compact={props.compact}
          onSwitch={(id) => props.onSwitch?.(id)}
          onBoard={props.onBoard}
        />
      </Show>
      <Show when={props.layout.projectName && !showTabs() && props.projectId}>
        {(projectId) => (
          <h1
            class={`flex min-w-0 flex-1 items-center gap-2 font-heading whitespace-nowrap ${props.compact ? 'text-sm' : 'max-w-60 text-base'}`}
          >
            <Icon name="project" class={props.compact ? 'text-lg' : 'text-2xl'} />
            <span class="truncate">{getProject(projectId()).name}</span>
          </h1>
        )}
      </Show>
    </>
  );
  const detailsButton = () => (
    <Show when={props.projectId !== null && details().length > 0}>
      <button
        type="button"
        data-hud-details
        aria-expanded={detailsOpen()}
        class={`flex h-11 shrink-0 items-center gap-1 rounded-md border-[3px] border-line px-2 text-sm font-bold whitespace-nowrap ${
          detailsOpen() ? 'bg-accent-200' : 'bg-surface'
        }`}
        onClick={() => setDetailsOpen((o) => !o)}
      >
        <Icon name="eval" class="text-lg" />
        {t.details}
      </button>
    </Show>
  );
  return (
    <nav
      ref={props.ref}
      aria-label={t.dock}
      class={`${panel} absolute left-1/2 flex max-w-[calc(100%-1rem)] -translate-x-1/2 ${
        props.compact
          ? 'w-full max-w-full flex-col gap-1.5 rounded-b-none px-2.5 pt-1.5 pb-2'
          : `items-center px-4 py-2 ${props.layout.dense ? 'gap-3' : 'gap-4'}`
      }`}
      style={{ bottom: `${props.layout.bottom}px` }}
      data-dock={props.compact ? 'rows' : 'row'}
    >
      <Show when={detailsOpen() && details().length > 0 && props.projectId !== null}>
        <section
          class={`${panel} absolute bottom-full left-0 mb-2 flex max-w-full flex-wrap items-center gap-4 px-4 py-2.5`}
          aria-label={t.details}
          data-hud-details-panel
        >
          {hudItems(details(), false)}
        </section>
      </Show>
      <Show
        when={props.compact}
        fallback={
          <>
            {heading()}
            {hudItems(items(), props.layout.dense)}
            {detailsButton()}
            {props.controls}
          </>
        }
      >
        <div class="flex h-11 min-w-0 items-center gap-3" data-dock-row="status">
          {heading()}
          {hudItems(
            items().filter((id) => !actionItems.has(id)),
            true,
          )}
        </div>
        <div class="flex h-11 min-w-0 items-center justify-between gap-2" data-dock-row="actions">
          <div class="flex items-center gap-2">
            {hudItems(
              items().filter((id) => actionItems.has(id)),
              true,
            )}
            {detailsButton()}
          </div>
          {props.controls}
        </div>
      </Show>
    </nav>
  );
}

/**
 * ホームでは HUD の項目がなく幅が空くので、進行中の案件のタブを形に関わらず並べる（受注した案件をすぐ開けるように）。
 * 狭い形（スマホ）では、いま見ているオフィスのタブを省いて案件のタブに幅を回す。入りきらない分は ProjectTabs が幅を測って「ほか N 件」に回す
 */
const homeTabs = (compact: boolean): DockTabsLayout => ({ office: !compact, others: Number.POSITIVE_INFINITY });

/**
 * ホームのドック：オフィスの見出し（進行中の案件があればそのタブ）・引き合いの入口（0件でも案件ボードを開ける）
 */
function HomeItems(props: {
  tabs?: ProjectTabsView;
  compact: boolean;
  onSwitch: (projectId: string) => void;
  onBoard?: () => void;
}) {
  const b = ja.board;
  return (
    <>
      <Show
        when={props.tabs && props.tabs.tabs.length > 0 ? props.tabs : null}
        fallback={
          <h1
            class={`flex min-w-0 flex-1 items-center gap-2 font-heading whitespace-nowrap ${props.compact ? 'text-sm' : 'text-base'}`}
            data-home
          >
            <Icon name="human" class={props.compact ? 'text-lg' : 'text-2xl'} />
            <span class="truncate">{b.home}</span>
            <Show when={!props.compact}>
              <span class="text-[11px] font-bold text-ink-muted">{b.homeLead}</span>
            </Show>
          </h1>
        }
      >
        {(tabs) => (
          <ProjectTabs
            view={{ ...tabs(), offers: 0 }}
            compact={props.compact}
            onSwitch={props.onSwitch}
            onBoard={() => props.onBoard?.()}
            limit={homeTabs(props.compact)}
            home
          />
        )}
      </Show>
      <Show when={props.onBoard}>
        {(open) => (
          <button
            type="button"
            data-board-open
            class={`flex h-11 shrink-0 items-center gap-1.5 rounded-md border-[3px] border-line px-3 text-sm font-bold whitespace-nowrap ${
              (props.tabs?.offers ?? 0) > 0 ? 'bg-primary-200' : 'bg-surface'
            }`}
            onClick={() => open()()}
          >
            <Icon name="board" class="text-lg" />
            {b.inquiriesEntry(props.tabs?.offers ?? 0)}
          </button>
        )}
      </Show>
    </>
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
  const fresh = () => freshMenus(props.store.state()).has('context');
  return (
    <Show when={view()}>
      {(v) => (
        <button
          type="button"
          data-context-badge={v().status}
          class={`relative flex min-h-6 items-center gap-1 rounded-full border-2 border-line px-1.5 text-[11px] font-bold whitespace-nowrap ${badgeBg[v().status]}`}
          aria-label={`${ja.context.open(ja.context.status[v().status])}${fresh() ? `（${ja.unlocks.badge}）` : ''}`}
          onClick={() => props.onOpen?.()}
        >
          <Icon name={contextStatusIcon[v().status]} />
          {ja.context.status[v().status]}
          <Show when={fresh()}>
            <NewBadge class="absolute -top-3 -right-2" />
          </Show>
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
    <Show
      when={!props.dense}
      fallback={
        <div class="flex items-center gap-1.5" data-spend>
          <Icon name={loss() ? 'warning' : 'money'} class="text-xl" />
          <div class="flex flex-col leading-tight">
            <span class="text-[11px] font-bold whitespace-nowrap text-ink-muted">
              {t.profitLabel(props.hud.projected)}
            </span>
            <span
              class="font-heading text-sm whitespace-nowrap tabular-nums"
              classList={{ 'text-danger-ink': loss() }}
              data-profit-outlook
            >
              {yen(props.hud.projectedProfit)}
            </span>
          </div>
        </div>
      }
    >
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
    </Show>
  );
}
