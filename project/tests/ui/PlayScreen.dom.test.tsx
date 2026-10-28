import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { createInitialState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { createSelection } from '../../src/ui/selection';
import { islandId, worldView } from '../../src/view/world';

const P = 'ecRenewal';
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

function mount() {
  const store = createGameStore(createInitialState('play'));
  store.dispatch({ type: 'StartProject', projectId: P });
  const selection = createSelection();
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(
    () => (
      <PlayScreen
        store={store}
        projectId={P}
        selection={selection}
        vm={() => worldView(store.state(), P, worldLooks[defaultWorldLookId])}
      />
    ),
    root,
  );
  const select = (taskId: string) => selection.dispatch({ type: 'SelectEntity', entityId: islandId(taskId) });
  return { store, selection, root, select };
}

const sheet = (root: HTMLElement) => root.querySelector('[data-detail-sheet]');
const key = (k: string, target: EventTarget = window) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('プレイ画面', () => {
  it('詳細パネルが Esc で閉じる', () => {
    const { root, select, selection } = mount();
    select('hearing');
    expect(sheet(root)).not.toBeNull();
    expect(sheet(root)?.textContent).toContain(ja.tasks.ecRenewal.hearing);
    key('Escape');
    expect(sheet(root)).toBeNull();
    expect(selection.selected()).toBeNull();
  });

  it('担当のカードを選ぶと AssignTask が適用され、シートが閉じる', () => {
    const { store, root, select } = mount();
    select('hearing');
    root.querySelector<HTMLButtonElement>('button[data-mode="aiThenHumanReview"]')?.click();
    expect(store.state().projects[P]?.tasks.hearing?.assignment).toEqual({
      mode: 'aiThenHumanReview',
      workerId: 'agent',
    });
    expect(sheet(root)).toBeNull();
  });

  it('カードにフォーカスすると変更後の見込みを Before → After で出し、Enter で決定できる', () => {
    const { store, root, select } = mount();
    store.dispatch({
      type: 'AssignTask',
      projectId: P,
      taskId: 'implementation',
      mode: 'aiThenHumanReview',
      workerId: 'agent',
    });
    select('implementation');
    const card = root.querySelector<HTMLButtonElement>('button[data-mode="ai"]');
    card?.focus();
    const preview = root.querySelector(`section[aria-label="${ja.forecast.title}"]`);
    expect(preview?.textContent).toContain(ja.forecast.humanTime);
    expect(preview?.querySelector('[data-dir="better"]')).not.toBeNull();
    expect(preview?.querySelector('[data-dir="worse"]')).not.toBeNull();
    // Enter はボタンの標準動作（click）になる
    card?.click();
    expect(store.state().projects[P]?.tasks.implementation?.assignment?.mode).toBe('ai');
  });

  it('タッチでは1回目のタップで見込みを出し、2回目で決定する', () => {
    const { store, root, select } = mount();
    select('hearing');
    const card = () => root.querySelector<HTMLButtonElement>('button[data-mode="human"]');
    const tap = () => {
      card()?.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
      card()?.click();
    };
    tap();
    expect(store.state().projects[P]?.tasks.hearing?.assignment).toBeNull();
    expect(root.textContent).toContain(ja.assign.tapAgain);
    tap();
    expect(store.state().projects[P]?.tasks.hearing?.assignment?.mode).toBe('human');
  });

  it('矢印キーで島を移り、Space で次の日へ進め始める', () => {
    const { store, root, selection } = mount();
    key('ArrowRight');
    expect(selection.selected()).toBe(islandId('hearing'));
    key('ArrowRight');
    expect(selection.selected()).toBe(islandId('requirements'));
    expect(sheet(root)?.textContent).toContain(ja.tasks.ecRenewal.requirements);
    key(' ');
    expect(store.run()).toMatchObject({ untilDecision: false });
    // 進めている最中にもう一度押すと止まる
    key(' ');
    expect(store.run()).toBeNull();
  });

  it('担当を決めてシートが閉じても、矢印キーは最後に選んだ島の隣へ進む', () => {
    const { root, selection } = mount();
    key('ArrowRight');
    root.querySelector<HTMLButtonElement>('button[data-mode="ai"]')?.click();
    expect(selection.selected()).toBeNull();
    key('ArrowRight');
    expect(selection.selected()).toBe(islandId('requirements'));
  });

  it('次に対応すべき問題を出し、「見に行く」でその島を選ぶ', () => {
    const { root, selection } = mount();
    const card = root.querySelector('[data-problem="unassigned:hearing"]');
    expect(card?.textContent).toContain(ja.advice.unassigned(ja.tasks.ecRenewal.hearing));
    expect(card?.textContent).toContain(ja.advice.causeLabel);
    expect(card?.textContent).toContain(ja.advice.actionLabel);
    [...(card?.querySelectorAll('button') ?? [])].find((b) => b.textContent === ja.advice.go)?.click();
    expect(selection.selected()).toBe(islandId('hearing'));
  });
});
