import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { MAX_HUD_ITEMS, uiLayout } from '../../src/content/look/layout';
import { createInitialState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { Dock } from '../../src/ui/play/Dock';

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

  it('一時停止と速度の操作は Command で state を変える', () => {
    const { store, root } = mount(false);
    root.querySelector<HTMLButtonElement>(`button[aria-label="${ja.controls.pause}"]`)?.click();
    expect(store.state().paused).toBe(true);
    root.querySelector<HTMLButtonElement>(`button[aria-label="${ja.controls.speed(4)}"]`)?.click();
    expect(store.state().speed).toBe(4);
  });
});
