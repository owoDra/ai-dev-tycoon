import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { createInitialState, type GameState } from '../../src/core/state';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { createSelection } from '../../src/ui/selection';
import { worldView } from '../../src/view/world';

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
    const { store, q } = mount({ ...createInitialState('badge'), fresh: ['harness:eval', 'hire'] });
    const badge = q('[data-harness-open] [data-new-badge]');
    expect(badge?.textContent).toBe('NEW');
    expect(badge?.querySelector('.icon')).not.toBeNull();
    expect(q('[data-team-open] [data-new-badge]')).not.toBeNull();
    q('[data-harness-open]')?.click();
    expect(q('[data-harness-open] [data-new-badge]')).toBeNull();
    expect(store.state().fresh).toEqual(['hire']);
    q('[data-team-open]')?.click();
    expect(q('[data-team-open] [data-new-badge]')).toBeNull();
    expect(store.state().fresh).toEqual([]);
  });

  it('Workflow Library は Harness のボタンとシートのタブに NEW を出し、開くと消える', () => {
    const { store, q } = mount({ ...createInitialState('library'), fresh: ['mode:agentWorkflow'] });
    expect(q('[data-harness-open] [data-new-badge]')).not.toBeNull();
    q('[data-harness-open]')?.click();
    expect(q('[data-ai-tab="library"] [data-new-badge]')).not.toBeNull();
    q('[data-ai-tab="library"]')?.click();
    expect(store.state().fresh).toEqual([]);
    expect(q('[data-harness-open] [data-new-badge]')).toBeNull();
  });

  it('Context の入口（ドックの Context の状態）にも NEW を出し、開くと消える', () => {
    const { store, q } = mount({ ...createInitialState('context'), fresh: ['context:pick'] }, 'paymentFix');
    // 資料のある案件で、ドックに Context の状態が出る
    expect(q('[data-context-badge] [data-new-badge]')).not.toBeNull();
    q('[data-context-badge]')?.click();
    expect(q('[data-context-badge] [data-new-badge]')).toBeNull();
    expect(store.state().fresh).toEqual([]);
  });
});
