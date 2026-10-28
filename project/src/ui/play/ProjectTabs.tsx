import { createEffect, createMemo, createSignal, For, type JSX, on, onCleanup, onMount, Show } from 'solid-js';
import type { DockTabsLayout } from '../../content/look/layout';
import { ja } from '../../i18n/ja';
import type { ProjectTabsView, ProjectTabView } from '../../view/board';
import { Icon } from '../Icon';
import { Keyed } from '../Keyed';
import { panel } from '../parts';

const t = ja.board;

/** 既定のタブの出し方（オフィスと、選んでいない案件を2つまで。入りきらなければ減らす） */
const defaultLimit: DockTabsLayout = { office: true, others: 2 };

/**
 * 案件のタブ（複数の案件の同時進行）。進行中の案件ごとに1つのフロアがあり、タブで見るフロアを切り替える。
 * 先頭にホーム（会社のオフィス）のタブを置き（home なら選択中）、新しい依頼があれば案件ボードを開くボタンを添える。
 * スクロールはさせず、並べるタブの数の上限を limit（content/look/layout.ts の dock.tabs）で決め、実際に入りきらない分は後ろから外す。
 * 選んでいるタブはいつも出し、外したタブは「ほか N 件」のボタンにまとめる（押すとドックの上に一覧が開き、そこから切り替える）。
 * オフィスも選んでいない案件も並べない形（スマホ）では、今のタブと「+N」を1つの切り替えボタンにする。
 */
export function ProjectTabs(props: {
  view: ProjectTabsView;
  compact: boolean;
  onSwitch: (projectId: string) => void;
  onBoard: () => void;
  /** ホームのタブを押したとき（渡さなければ、ホームのタブは home のときだけ出す） */
  onHome?: () => void;
  /** いまホームを見ている */
  home?: boolean;
  limit?: DockTabsLayout;
}) {
  const limit = () => props.limit ?? defaultLimit;
  const officeOn = () => props.home === true || props.onHome !== undefined;
  /** オフィスのタブを並べるか（ホームを見ているときは選んでいるタブなので、いつも並べる） */
  const officeInline = () => props.home === true || (officeOn() && limit().office);
  const split = createMemo(() => {
    const selected = props.view.tabs.filter((tab) => tab.selected);
    const others = props.view.tabs.filter((tab) => !tab.selected);
    const shown = new Set([...selected, ...others.slice(0, limit().others)].map((tab) => tab.projectId));
    return {
      inline: props.view.tabs.filter((tab) => shown.has(tab.projectId)),
      rest: props.view.tabs.filter((tab) => !shown.has(tab.projectId)),
    };
  });
  /** 並べたが幅に入りきらず外したタブ（ui の計測で決める） */
  const [clipped, setClipped] = createSignal<ReadonlySet<string>>(new Set(), {
    equals: (a, b) => a.size === b.size && [...a].every((id) => b.has(id)),
  });
  const menuTabs = () => [...split().inline.filter((tab) => clipped().has(tab.projectId)), ...split().rest];
  /** オフィスのタブを、並べる設定でも幅に入りきらず外したか */
  const [officeClipped, setOfficeClipped] = createSignal(false);
  const officeInMenu = () => officeOn() && (!officeInline() || officeClipped());
  const restCount = () => menuTabs().length + (officeInMenu() ? 1 : 0);
  /** 今のタブと「+N」を1つの切り替えボタンにするか */
  const merged = () => !limit().office && limit().others === 0;
  let list: HTMLDivElement | undefined;
  /**
   * 並べたタブが入りきらなければ、選んでいないタブを後ろから外し、それでも入らなければオフィスのタブも外す
   * （外したものは表示を消し、一覧に回す。選んでいるタブは外さず、名前を縮める）
   */
  const fitTabs = () => {
    if (!list) return;
    const tabs = [...list.querySelectorAll<HTMLElement>('[data-project-tab], [data-home-tab]')];
    for (const tab of tabs) tab.style.display = '';
    const drop = new Set<string>();
    let officeOut = false;
    const fits = () => list === undefined || list.scrollWidth <= list.clientWidth + 1;
    const projects = tabs.filter((tab) => tab.dataset.projectTab !== undefined);
    const candidates = [
      ...projects.filter((tab) => tab.getAttribute('aria-selected') !== 'true').reverse(),
      ...tabs.filter((tab) => tab.dataset.homeTab !== undefined && tab.getAttribute('aria-selected') !== 'true'),
    ];
    for (const tab of candidates) {
      if (fits()) break;
      tab.style.display = 'none';
      if (tab.dataset.projectTab !== undefined) drop.add(tab.dataset.projectTab);
      else officeOut = true;
    }
    setClipped(drop);
    setOfficeClipped(officeOut);
  };
  onMount(() => {
    if (typeof ResizeObserver === 'undefined' || !list) return;
    const observer = new ResizeObserver(fitTabs);
    observer.observe(list);
    onCleanup(() => observer.disconnect());
  });
  createEffect(on(split, () => queueMicrotask(fitTabs)));
  const [menu, setMenu] = createSignal(false);
  const pick = (go: () => void) => {
    setMenu(false);
    go();
  };
  const office = (inMenu: boolean) => (
    <button
      type="button"
      role="tab"
      aria-selected={props.home === true}
      data-home-tab
      class={`flex h-11 shrink-0 items-center gap-1.5 rounded-md border-[3px] border-line px-2 text-sm font-bold whitespace-nowrap ${
        props.home ? 'bg-accent-200' : 'bg-sunken'
      } ${inMenu ? 'w-full' : ''}`}
      onClick={() => pick(() => props.onHome?.())}
    >
      <Icon name="human" class="text-lg" />
      {t.home}
    </button>
  );
  const tabButton = (tab: ProjectTabView, inMenu: boolean): JSX.Element => (
    <button
      type="button"
      role="tab"
      aria-selected={tab.selected}
      data-project-tab={tab.projectId}
      class={`flex h-11 min-w-0 items-center gap-1.5 rounded-md border-[3px] border-line px-2 text-sm font-bold whitespace-nowrap ${
        tab.selected ? 'bg-accent-200' : 'bg-sunken'
      } ${inMenu ? 'w-full shrink-0' : tab.selected ? 'shrink' : 'shrink-0'}`}
      onClick={() => pick(() => props.onSwitch(tab.projectId))}
    >
      <span class="shrink-0 rounded border-2 border-line bg-surface px-1 text-[11px] tabular-nums">
        {t.floor(tab.floor)}
      </span>
      {/* 並べたタブでは、名前に幅を回すためアイコンを省く（階の札で見分ける） */}
      <Show when={inMenu}>
        <Icon name="project" class="shrink-0 text-lg" />
      </Show>
      <span class={`min-w-0 truncate ${inMenu ? '' : props.compact ? 'max-w-28' : 'max-w-40'}`}>{tab.name}</span>
      <Show when={!props.compact || inMenu}>
        <span class="shrink-0 text-[11px] text-ink-muted tabular-nums">{ja.score.percent(tab.progress)}</span>
      </Show>
      <Show when={tab.team}>
        {(team) => (
          <span
            class="flex shrink-0 items-center gap-0.5 rounded border-2 border-line bg-surface px-1 text-[11px]"
            data-tab-team
          >
            <Icon name="human" />
            {team()}
          </span>
        )}
      </Show>
    </button>
  );
  return (
    <div class="flex min-w-0 flex-1 items-center gap-1.5" data-project-tabs>
      <Show
        when={merged()}
        fallback={
          <>
            <div
              ref={list}
              role="tablist"
              aria-label={t.tabs}
              class="flex min-w-0 items-center gap-1.5 overflow-hidden"
            >
              <Show when={officeInline()}>{office(false)}</Show>
              <Keyed each={split().inline} by={(tab) => tab.projectId}>
                {(tab) => tabButton(tab, false)}
              </Keyed>
            </div>
            <Show when={restCount() > 0}>
              <button
                type="button"
                data-more-tabs
                aria-expanded={menu()}
                aria-label={t.moreTabs(restCount())}
                class={`flex h-11 shrink-0 items-center gap-1 rounded-md border-[3px] border-line px-2 text-sm font-bold whitespace-nowrap ${
                  menu() ? 'bg-accent-200' : 'bg-surface'
                }`}
                onClick={() => setMenu((o) => !o)}
              >
                <Icon name="project" class="text-lg" />
                {t.moreTabs(restCount())}
              </button>
            </Show>
          </>
        }
      >
        {/* 今のタブ（ホームならオフィス）を見せたまま、押すとほかのタブの一覧を開く */}
        <button
          type="button"
          data-more-tabs
          aria-expanded={menu()}
          aria-label={`${props.home ? t.home : (split().inline[0]?.name ?? '')}（${t.moreTabs(restCount())}）`}
          class={`flex h-11 min-w-0 shrink items-center gap-1.5 rounded-md border-[3px] border-line bg-accent-200 px-2 text-sm font-bold whitespace-nowrap`}
          onClick={() => setMenu((o) => !o)}
        >
          <Show
            when={!props.home && split().inline[0]}
            fallback={
              <>
                <Icon name="human" class="shrink-0 text-lg" />
                <span class="min-w-0 truncate">{t.home}</span>
              </>
            }
          >
            {(tab) => (
              <>
                <span class="shrink-0 rounded border-2 border-line bg-surface px-1 text-[11px] tabular-nums">
                  {t.floor(tab().floor)}
                </span>
                <span class="min-w-0 truncate">{tab().name}</span>
              </>
            )}
          </Show>
          <Show when={restCount() > 0}>
            <span class="shrink-0 rounded-full border-2 border-line bg-surface px-1.5 text-[11px] tabular-nums">
              {t.moreTabsShort(restCount())}
            </span>
          </Show>
        </button>
      </Show>
      <Show when={menu() && restCount() > 0}>
        <div
          role="tablist"
          aria-label={t.tabs}
          class={`${panel} absolute bottom-full left-0 mb-2 flex w-[min(20rem,100%)] flex-col gap-1.5 p-2`}
          data-tabs-menu
        >
          <Show when={officeInMenu()}>{office(true)}</Show>
          <For each={menuTabs()}>{(tab) => tabButton(tab, true)}</For>
        </div>
      </Show>
      <Show when={props.view.offers > 0}>
        <button
          type="button"
          data-board-open
          aria-label={t.offers(props.view.offers)}
          class="flex h-11 shrink-0 items-center gap-1 rounded-md border-[3px] border-line bg-primary-200 px-2 text-sm font-bold whitespace-nowrap"
          onClick={() => props.onBoard()}
        >
          <Icon name="success" class="text-lg" />
          {props.compact ? props.view.offers : t.offers(props.view.offers)}
        </button>
      </Show>
    </div>
  );
}
