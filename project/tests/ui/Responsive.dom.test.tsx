import { createRoot, createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { screenRegions, uiLayout } from '../../src/content/look/layout';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { createInitialState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { FIT_ITEM, fitColumn } from '../../src/ui/fitColumn';
import { Dock } from '../../src/ui/play/Dock';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { ProjectTabs } from '../../src/ui/play/ProjectTabs';
import { createSelection } from '../../src/ui/selection';
import type { ProjectTabsView } from '../../src/view/board';
import { worldView } from '../../src/view/world';

const P = 'ecRenewal';
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

function mount(size: { width: number; height: number }) {
  const base = createInitialState('responsive');
  const store = createGameStore({ ...base, unlocked: [...base.unlocked, 'dock:skip', 'problems'] });
  store.dispatch({ type: 'StartProject', projectId: P });
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(
    () => (
      <PlayScreen
        store={store}
        projectId={P}
        selection={createSelection()}
        vm={() => worldView(store.state(), P, worldLooks[defaultWorldLookId])}
        regions={() => screenRegions(uiLayout, size)}
        onSettings={() => {}}
      />
    ),
    root,
  );
  return root;
}

describe('画面の形ごとの構成', () => {
  it('スマホ：ドックは2段（案件名と状態 / 問題・詳細・メニュー）で、時計と速度は上の帯に出す', () => {
    const root = mount({ width: 375, height: 667 });
    const dock = root.querySelector('nav[data-dock]');
    expect(dock?.getAttribute('data-dock')).toBe('rows');
    const rows = [...(dock?.querySelectorAll('[data-dock-row]') ?? [])].map((r) => r.getAttribute('data-dock-row'));
    expect(rows).toEqual(['status', 'actions']);
    const status = dock?.querySelector('[data-dock-row="status"]');
    expect(status?.querySelector('h1')).not.toBeNull();
    expect(status?.querySelector('[data-hud-item="remaining"]')).not.toBeNull();
    const actions = dock?.querySelector('[data-dock-row="actions"]');
    expect(actions?.querySelector('[data-hud-details]')).not.toBeNull();
    expect(actions?.querySelector('[data-play-controls="menu"]')).not.toBeNull();
    expect(root.querySelector('[data-region="top"] [data-play-controls="clock"]')).not.toBeNull();
  });

  it('スマホ：「詳細」で使った金額と稼働を開く', () => {
    const root = mount({ width: 375, height: 667 });
    expect(root.querySelector('[data-hud-details-panel]')).toBeNull();
    root.querySelector<HTMLButtonElement>('[data-hud-details]')?.click();
    const panel = root.querySelector('[data-hud-details-panel]');
    expect(panel?.querySelector('[data-hud-item="spend"]')).not.toBeNull();
    expect(panel?.querySelector('[data-hud-item="utilization"]')).not.toBeNull();
  });

  it('狭い PC：操作の列はすべて上の帯に出し、ドックは1段', () => {
    const root = mount({ width: 800, height: 700 });
    expect(root.querySelector('nav[data-dock]')?.getAttribute('data-dock')).toBe('row');
    expect(root.querySelector('[data-region="top"] [data-play-controls="all"]')).not.toBeNull();
    expect(root.querySelector('nav[data-dock] [data-play-controls]')).toBeNull();
  });

  it('上の帯とお知らせの列は、求めた領域の位置と大きさに置く', () => {
    const size = { width: 1440, height: 900 };
    const root = mount(size);
    const r = screenRegions(uiLayout, size);
    const top = root.querySelector<HTMLElement>('[data-region="top"]');
    const notices = root.querySelector<HTMLElement>('[data-region="notices"]');
    expect(top?.style.top).toBe(`${r.top.y}px`);
    expect(top?.style.height).toBe(`${r.top.height}px`);
    expect(notices?.style.left).toBe(`${r.notices.x}px`);
    expect(notices?.style.width).toBe(`${r.notices.width}px`);
    expect(notices?.querySelector('section')).not.toBeNull();
  });
});

describe('スクロールしない列とタブ', () => {
  /** jsdom はレイアウトを計算しないので、大きさと位置を決めておく */
  const box = (el: HTMLElement, props: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(props)) Object.defineProperty(el, k, { configurable: true, value: v });
  };

  it('お知らせの列は、入りきらないカードから後ろを隠し、空けば戻す', async () => {
    const column = document.createElement('div');
    document.body.append(column);
    box(column, { clientHeight: 100 });
    const cards = [0, 1, 2].map((i) => {
      const el = document.createElement('div');
      el.setAttribute(FIT_ITEM, '');
      box(el, { offsetTop: i * 50, offsetHeight: 45, offsetParent: column });
      column.append(el);
      return el;
    });
    const dispose = createRoot((d) => {
      fitColumn(column);
      return d;
    });
    await Promise.resolve();
    expect(cards.map((c) => c.style.display)).toEqual(['', '', 'none']);
    // 先頭のカードが消えると、後ろのカードが繰り上がって入る
    cards[0]?.remove();
    box(cards[1] as HTMLElement, { offsetTop: 0 });
    box(cards[2] as HTMLElement, { offsetTop: 50 });
    await new Promise((r) => setTimeout(r, 0));
    expect(cards.slice(1).map((c) => c.style.display)).toEqual(['', '']);
    // 先頭のカードは、列より高くても出す
    box(cards[1] as HTMLElement, { offsetHeight: 300 });
    cards[2]?.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect(cards[1]?.style.display).toBe('');
    dispose();
  });

  const view: ProjectTabsView = {
    tabs: ['a', 'b', 'c'].map((id, i) => ({
      projectId: id,
      name: `案件${id}`,
      floor: i + 1,
      progress: 0,
      selected: id === 'b',
      team: null,
    })),
    offers: 0,
    pending: 0,
  } as unknown as ProjectTabsView;

  it('スマホの案件のタブはスクロールせず、今の案件と「+N」の1つのボタンにまとめ、一覧から切り替える', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const switched: string[] = [];
    let home = 0;
    dispose = render(
      () => (
        <ProjectTabs
          view={view}
          compact
          limit={uiLayout.compact.dock.tabs}
          onSwitch={(id) => switched.push(id)}
          onBoard={() => {}}
          onHome={() => home++}
        />
      ),
      root,
    );
    expect(root.querySelector('[data-project-tab]')).toBeNull();
    expect(root.querySelector('[data-home-tab]')).toBeNull();
    const more = root.querySelector<HTMLButtonElement>('[data-more-tabs]');
    // 今の案件の名前と、ほかの3件（オフィスと選んでいない2つの案件）
    expect(more?.textContent).toContain('案件b');
    expect(more?.textContent).toContain(ja.board.moreTabsShort(3));
    expect(root.innerHTML).not.toMatch(/overflow-(x|y)-auto/);
    more?.click();
    const menu = root.querySelector('[data-tabs-menu]');
    expect(
      [...(menu?.querySelectorAll<HTMLElement>('[data-project-tab]') ?? [])].map((t) => t.dataset.projectTab),
    ).toEqual(['a', 'c']);
    menu?.querySelector<HTMLButtonElement>('[data-project-tab="c"]')?.click();
    expect(switched).toEqual(['c']);
    expect(root.querySelector('[data-tabs-menu]')).toBeNull();
    more?.click();
    root.querySelector<HTMLButtonElement>('[data-tabs-menu] [data-home-tab]')?.click();
    expect(home).toBe(1);
  });

  it('PC では並べる数の上限を超えたタブを「ほか N 件」にまとめる', () => {
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(
      () => (
        <ProjectTabs
          view={view}
          compact={false}
          limit={{ office: true, others: 1 }}
          onSwitch={() => {}}
          onBoard={() => {}}
          onHome={() => {}}
        />
      ),
      root,
    );
    const inline = [...root.querySelectorAll<HTMLElement>('[role="tablist"] [data-project-tab]')];
    expect(inline.map((t) => t.dataset.projectTab)).toEqual(['a', 'b']);
    expect(root.querySelector('[data-more-tabs]')?.textContent).toContain(ja.board.moreTabs(1));
  });

  it('広い PC では、オフィスと案件のタブを並べる', () => {
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(
      () => (
        <ProjectTabs
          view={view}
          compact={false}
          limit={uiLayout.wide.dock.tabs}
          onSwitch={() => {}}
          onBoard={() => {}}
          onHome={() => {}}
        />
      ),
      root,
    );
    expect(root.querySelector('[data-home-tab]')).not.toBeNull();
    expect(root.querySelectorAll('[data-project-tab]')).toHaveLength(3);
    expect(root.querySelector('[data-more-tabs]')).toBeNull();
  });
});

describe('画面の大きさを変えたとき', () => {
  it('スマホの形から PC の形へ戻しても、ドックの見出しと案件のタブが消えない', () => {
    const base = createInitialState('resize');
    const store = createGameStore(base);
    store.dispatch({ type: 'StartProject', projectId: P });
    const root = document.createElement('div');
    document.body.append(root);
    const [compact, setCompact] = createSignal(false);
    const tabs = {
      tabs: [
        { projectId: P, name: 'P', floor: 1, progress: 0, selected: true, team: null },
        { projectId: 'other', name: 'Q', floor: 2, progress: 0, selected: false, team: null },
      ],
      offers: 0,
      pending: 0,
    } as unknown as ProjectTabsView;
    dispose = render(
      () => (
        <Dock
          store={store}
          projectId={P}
          layout={compact() ? uiLayout.compact.dock : uiLayout.wide.dock}
          compact={compact()}
          problemCount={0}
          onProblems={() => {}}
          tabs={tabs}
          onSwitch={() => {}}
          onHome={() => {}}
        />
      ),
      root,
    );
    const visible = () =>
      [...root.querySelectorAll<HTMLElement>('[data-project-tab]')].map((t) => t.dataset.projectTab);
    expect(visible()).toEqual([P, 'other']);
    setCompact(true);
    expect(root.querySelector('[data-more-tabs]')).not.toBeNull();
    setCompact(false);
    expect(visible()).toEqual([P, 'other']);
    expect(root.querySelector('[data-home-tab]')).not.toBeNull();
    setCompact(true);
    setCompact(false);
    expect(visible()).toEqual([P, 'other']);
  });
});
