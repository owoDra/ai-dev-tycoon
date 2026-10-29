import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { createInitialState, type GameState } from '../../src/core/state';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { createSelection } from '../../src/ui/selection';
import { worldView } from '../../src/view/world';
import { findMenu, pressMenu } from '../helpers/menu';

const P = 'ecRenewal';
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

function mount(state: GameState, projectId = P) {
  const store = createGameStore(state);
  store.dispatch({ type: 'StartProject', projectId });
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(
    () => (
      <PlayScreen
        store={store}
        projectId={projectId}
        selection={createSelection()}
        vm={() => worldView(store.state(), projectId, worldLooks[defaultWorldLookId])}
      />
    ),
    root,
  );
  return { store, q: (sel: string) => root.querySelector<HTMLElement>(sel) };
}

describe('メニューの NEW の印', () => {
  it('解放したがまだ開いていない Harness と社員と Seat のボタンに、アイコンとラベルの NEW が付き、開くと消える', () => {
    const { store } = mount({ ...createInitialState('badge'), fresh: ['harness:eval', 'hire'] });
    const badge = findMenu(document.body, '[data-harness-open]')?.querySelector('[data-new-badge]');
    expect(badge?.textContent).toBe('NEW');
    expect(badge?.querySelector('.icon')).not.toBeNull();
    expect(findMenu(document.body, '[data-team-open]')?.querySelector('[data-new-badge]')).not.toBeNull();
    pressMenu(document.body, '[data-harness-open]');
    expect(findMenu(document.body, '[data-harness-open]')?.querySelector('[data-new-badge]')).toBeNull();
    expect(store.state().fresh).toEqual(['hire']);
    pressMenu(document.body, '[data-team-open]');
    expect(findMenu(document.body, '[data-team-open]')?.querySelector('[data-new-badge]')).toBeNull();
    expect(store.state().fresh).toEqual([]);
  });

  it('Workflow Library は Harness のボタンとシートのタブに NEW を出し、開くと消える', () => {
    const { store, q } = mount({ ...createInitialState('library'), fresh: ['mode:agentWorkflow'] });
    expect(findMenu(document.body, '[data-harness-open]')?.querySelector('[data-new-badge]')).not.toBeNull();
    pressMenu(document.body, '[data-harness-open]');
    expect(q('[data-ai-tab="library"] [data-new-badge]')).not.toBeNull();
    q('[data-ai-tab="library"]')?.click();
    expect(store.state().fresh).toEqual([]);
    expect(findMenu(document.body, '[data-harness-open]')?.querySelector('[data-new-badge]')).toBeNull();
  });

  it('Context の入口（ドックの Context の状態）にも NEW を出し、開くと消える', () => {
    const { store, q } = mount({ ...createInitialState('context'), fresh: ['session'] }, 'paymentFix');
    // 資料のある案件で、ドックに Context の状態が出る
    expect(q('[data-context-badge] [data-new-badge]')).not.toBeNull();
    q('[data-context-badge]')?.click();
    expect(q('[data-context-badge] [data-new-badge]')).toBeNull();
    expect(store.state().fresh).toEqual([]);
  });

  it('Context はメニューにも入口があり（狭い形ではドックの札が「詳細」に入るため）、NEW を出して押すとシートが開く', () => {
    const { store, q } = mount({ ...createInitialState('context-menu'), fresh: ['context'] }, 'paymentFix');
    expect(findMenu(document.body, '[data-menu-context]')?.querySelector('[data-new-badge]')).not.toBeNull();
    pressMenu(document.body, '[data-menu-context]');
    expect(q('[data-context-sheet]')).not.toBeNull();
    expect(store.state().fresh).toEqual([]);
  });

  it('資料のない案件では、メニューに Context の入口を出さない', () => {
    mount(createInitialState('context-none'), 'ecRenewal');
    expect(findMenu(document.body, '[data-menu-context]')).toBeNull();
  });
});
