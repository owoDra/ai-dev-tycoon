import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 退場のアニメーションが終わるまで要素が残る実機の条件を作る（jsdom では exit がすぐ終わるので、待たせる偽物に差し替える）
 */
const exits: (() => void)[] = [];
const cancels = vi.fn();
vi.mock('../../src/fx/motion', async (orig) => ({
  ...(await orig<object>()),
  exit: (el: HTMLElement) => {
    el.style.pointerEvents = 'none';
    el.style.opacity = '0';
    return {
      finished: new Promise<void>((resolve) => exits.push(resolve)),
      cancel: () => {
        cancels();
        el.style.pointerEvents = '';
        el.style.opacity = '';
      },
    };
  },
}));

const { createGameStore } = await import('../../src/app/store');
const { defaultWorldLookId, worldLooks } = await import('../../src/content/look/world');
const { createInitialState } = await import('../../src/core/state');
const { PlayScreen } = await import('../../src/ui/play/PlayScreen');
const { Presence } = await import('../../src/ui/Presence');
const { createSelection } = await import('../../src/ui/selection');
const { islandId, worldView } = await import('../../src/view/world');

const P = 'corporateSite';
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
  exits.length = 0;
  cancels.mockClear();
});

function mount() {
  const store = createGameStore(createInitialState('sheet-exit'));
  store.dispatch({ type: 'StartProject', projectId: P });
  const selection = createSelection();
  const [projectId, setProjectId] = createSignal<string | null>(P);
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(
    () => (
      <PlayScreen
        store={store}
        projectId={projectId()}
        selection={selection}
        vm={() => {
          const id = projectId();
          return id ? worldView(store.state(), id, worldLooks[defaultWorldLookId]) : undefined;
        }}
      />
    ),
    root,
  );
  const finishExits = async () => {
    for (const resolve of exits.splice(0)) resolve();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  return { store, selection, setProjectId, root, finishExits };
}

describe('シートの退場中の操作', () => {
  it('島の詳細を開いたままホームへ移っても例外を出さず、戻ると詳細を開ける', async () => {
    const { store, selection, setProjectId, root, finishExits } = mount();
    selection.dispatch({ type: 'SelectEntity', entityId: islandId('frontend') });
    expect(root.querySelector('[data-detail-sheet]')).not.toBeNull();
    expect(() => {
      selection.dispatch({ type: 'SelectEntity', entityId: null });
      setProjectId(null);
      store.dispatch({ type: 'TogglePause' });
    }).not.toThrow();
    await finishExits();
    setProjectId(P);
    selection.dispatch({ type: 'SelectEntity', entityId: islandId('design') });
    expect(root.querySelectorAll('[data-detail-sheet]')).toHaveLength(1);
  });

  it('開いているシートを開き直しても、退場を始めず押せるまま残る', () => {
    const { root } = mount();
    root.querySelector<HTMLElement>('[data-harness-open]')?.click();
    const wrapper = () => root.querySelector('[data-harness-sheet]')?.parentElement as HTMLElement | undefined;
    expect(wrapper()).toBeDefined();
    root.querySelector<HTMLElement>('[data-ai-tab="harness"]')?.click();
    expect(exits).toHaveLength(0);
    expect(wrapper()?.style.pointerEvents).toBe('');
  });
});

describe('Presence', () => {
  it('退場中に値が戻ったら退場を止め、透明なまま残さない', () => {
    const [when, setWhen] = createSignal<string | null>('a');
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(() => <Presence when={when()}>{(v) => <p>{v()}</p>}</Presence>, root);
    const wrapper = () => root.firstElementChild as HTMLElement;
    setWhen(null);
    expect(wrapper().style.opacity).toBe('0');
    setWhen('b');
    expect(cancels).toHaveBeenCalledTimes(1);
    expect(wrapper().style.opacity).toBe('');
    expect(wrapper().style.pointerEvents).toBe('');
    expect(wrapper().textContent).toBe('b');
  });
});
