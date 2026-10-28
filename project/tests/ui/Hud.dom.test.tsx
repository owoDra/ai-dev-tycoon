import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { balance } from '../../src/content/balance';
import { MAX_HUD_ITEMS, uiLayout } from '../../src/content/look/layout';
import { createInitialState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { Dock } from '../../src/ui/play/Dock';
import { PlayControls } from '../../src/ui/play/PlayControls';
import { hudView } from '../../src/view/hud';

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

function mount(compact: boolean) {
  const store = createGameStore(createInitialState('hud'));
  store.dispatch({ type: 'StartProject', projectId: 'ecRenewal' });
  const root = document.createElement('div');
  document.body.append(root);
  const form = compact ? uiLayout.compact : uiLayout.wide;
  dispose = render(
    () => (
      <Dock
        store={store}
        projectId="ecRenewal"
        layout={form.dock}
        compact={compact}
        problemCount={2}
        onProblems={() => {}}
      />
    ),
    root,
  );
  return { store, root };
}

describe('HUD（ドック）', () => {
  for (const compact of [false, true]) {
    it(`常時表示する項目は上限（${MAX_HUD_ITEMS}）以内（${compact ? 'スマホ' : 'PC'}）`, () => {
      const { root } = mount(compact);
      const items = root.querySelectorAll('[data-hud-item]');
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThanOrEqual(MAX_HUD_ITEMS);
      // 案件名は見出しで、項目には数えない
      expect(root.querySelector('h1')?.textContent).toBe(ja.projects.ecRenewal);
    });
  }

  it('ドックはこの案件に使った金額・受注額・見込み利益を出す', () => {
    const { store, root } = mount(false);
    const spend = root.querySelector('[data-hud-item="spend"]');
    const hud = hudView(store.state(), 'ecRenewal');
    expect(spend?.textContent).toContain(ja.hud.spendValue(ja.funds.money(0), ja.funds.money(hud?.revenue ?? 0)));
    expect(spend?.querySelector('[data-profit-outlook]')?.textContent).toBe(
      ja.hud.profitOutlook(true, ja.funds.money(hud?.projectedProfit ?? 0)),
    );
  });
});

describe('操作の列（日付と時刻・速度・メニュー）', () => {
  function mountControls() {
    const base = createInitialState('controls');
    const store = createGameStore({ ...base, unlocked: [...base.unlocked, 'dock:skip'] });
    const root = document.createElement('div');
    document.body.append(root);
    const opened: string[] = [];
    dispose = render(
      () => (
        <PlayControls
          store={store}
          compact={false}
          onBoard={() => opened.push('board')}
          onTeam={() => opened.push('team')}
          onHarness={() => opened.push('harness')}
        />
      ),
      root,
    );
    return { store, root, opened };
  }

  it('時計は1日目の始業（10:00・勤務中）から始まり、退勤後は夜の表示になる。勤務時間の区分と、進めている最中かをラベルで示す', () => {
    const { store, root } = mountControls();
    expect(root.querySelector('[data-clock]')?.textContent).toContain(ja.hud.today(1, '10:00'));
    expect(root.querySelector('[data-clock]')?.getAttribute('data-phase')).toBe('work');
    expect(root.querySelector('[data-phase-label]')?.textContent).toBe(`${ja.hud.phase.work} · ${ja.hud.stopped}`);
    store.play(false);
    store.advance(balance.time.workday.end - balance.time.workday.start);
    expect(root.querySelector('[data-clock]')?.textContent).toContain(ja.hud.today(1, '19:00'));
    expect(root.querySelector('[data-clock]')?.getAttribute('data-phase')).toBe('night');
    expect(root.querySelector('[data-clock]')?.getAttribute('title')).toBe(ja.hud.phaseHint.night);
    expect(root.querySelector('[data-phase-label]')?.textContent).toBe(`${ja.hud.phase.night} · ${ja.hud.running}`);
  });

  it('メニューのボタンは渡された画面を開く', () => {
    const { root, opened } = mountControls();
    root.querySelector<HTMLButtonElement>('[data-menu-board]')?.click();
    root.querySelector<HTMLButtonElement>('[data-team-open]')?.click();
    root.querySelector<HTMLButtonElement>('[data-harness-open]')?.click();
    expect(opened).toEqual(['board', 'team', 'harness']);
  });

  it('「次の日へ」で1日、「まとめて進める」で判断が要るまで進め始め、進めている間にもう一度押すと止まる', () => {
    const { store, root } = mountControls();
    const nextDay = () => root.querySelector<HTMLButtonElement>('[data-next-day]');
    const until = () => root.querySelector<HTMLButtonElement>('[data-until-decision]');
    expect(nextDay()?.getAttribute('aria-label')).toBe(ja.hud.nextDay);
    nextDay()?.click();
    expect(store.run()).toMatchObject({ untilDecision: false });
    expect(nextDay()?.getAttribute('aria-label')).toBe(ja.hud.stop);
    // 1日だけ進めている間は、まとめ送りは押せない
    expect(until()?.disabled).toBe(true);
    nextDay()?.click();
    expect(store.run()).toBeNull();
    until()?.click();
    expect(store.run()).toMatchObject({ untilDecision: true });
    expect(until()?.getAttribute('aria-label')).toBe(ja.hud.stop);
    expect(nextDay()?.disabled).toBe(true);
    until()?.click();
    expect(store.run()).toBeNull();
  });

  it('「まとめて進める」は解放（dock:skip）されるまで出さない', () => {
    const base = createInitialState('controls');
    const store = createGameStore({ ...base, unlocked: base.unlocked.filter((f) => f !== 'dock:skip') });
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(
      () => <PlayControls store={store} compact={false} onBoard={() => {}} onTeam={() => {}} onHarness={() => {}} />,
      root,
    );
    expect(root.querySelector('[data-next-day]')).not.toBeNull();
    expect(root.querySelector('[data-until-decision]')).toBeNull();
  });
});
