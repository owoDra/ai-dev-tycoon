import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { uiLayout } from '../../src/content/look/layout';
import { createInitialState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { Keyed } from '../../src/ui/Keyed';
import { BoardSheet } from '../../src/ui/play/BoardSheet';
import { playFor } from '../helpers/play';

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

describe('Keyed（キーで対応づける一覧）', () => {
  it('項目が新しいオブジェクトになっても、キーが同じなら DOM を作り直さず、値は最新を出す', () => {
    const [items, setItems] = createSignal([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ]);
    const root = document.createElement('div');
    dispose = render(
      () => (
        <Keyed each={items()} by={(x) => x.id}>
          {(x) => (
            <button type="button" data-id={x.id}>
              {x.n}
            </button>
          )}
        </Keyed>
      ),
      root,
    );
    const a = root.querySelector('[data-id="a"]');
    setItems([
      { id: 'a', n: 10 },
      { id: 'b', n: 20 },
    ]);
    expect(root.querySelector('[data-id="a"]')).toBe(a);
    expect(a?.textContent).toBe('10');
    setItems([{ id: 'b', n: 30 }]);
    expect(root.querySelector('[data-id="a"]')).toBeNull();
    expect(root.textContent).toBe('30');
  });
});

describe('案件ボード', () => {
  it('時計が進んでも引き合いのカードは作り直さず、選んだ価格と見積を出すボタンが残る', () => {
    const store = createGameStore(step(createInitialState('keyed', { board: true, tutorial: false }), 1).state);
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(
      () => <BoardSheet store={store} layout={uiLayout.wide.sheet} bottom={0} viewHeight={800} onClose={() => {}} />,
      root,
    );
    const card = root.querySelector<HTMLElement>('[data-inquiry]');
    const submit = card?.querySelector('[data-submit]');
    card?.querySelector<HTMLButtonElement>('[data-price="plus10"]')?.click();
    playFor(store, 30);
    expect(root.querySelector('[data-inquiry]')).toBe(card);
    expect(card?.querySelector('[data-submit]')).toBe(submit);
    expect(card?.querySelector('[data-price="plus10"]')?.getAttribute('aria-pressed')).toBe('true');
  });
});
