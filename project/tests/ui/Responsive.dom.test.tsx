import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { screenRegions, uiLayout } from '../../src/content/look/layout';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { createInitialState } from '../../src/core/state';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { createSelection } from '../../src/ui/selection';
import { worldView } from '../../src/view/world';

const P = 'ecRenewal';
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

function mount(size: { width: number; height: number }) {
  const base = createInitialState('responsive');
  const store = createGameStore({ ...base, unlocked: [...base.unlocked, 'dock:speed', 'problems'] });
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
