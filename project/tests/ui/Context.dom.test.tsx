import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { handoffItems } from '../../src/content/documents';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { getSession } from '../../src/core/context';
import { createInitialState, type GameState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { createSelection } from '../../src/ui/selection';
import { worldView } from '../../src/view/world';

const P = 'paymentFix';
const AGENT = 'agent';
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

function mount(edit: (s: GameState) => GameState = (s) => s) {
  const store = createGameStore(edit(createInitialState('ctx-ui')));
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
      />
    ),
    root,
  );
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  return { store, root, q };
}

const withSession = (s: GameState, age: number): GameState => ({
  ...s,
  sessions: { ...s.sessions, [AGENT]: { ...getSession(s, AGENT), age } },
});

describe('Context の UI', () => {
  it('ドックに Context の状態をアイコンとラベルで出し、押すとシートで渡し方を選べる', () => {
    const { store, q } = mount();
    const badge = q('[data-context-badge]');
    expect(badge?.textContent).toContain(ja.context.status.cluttered);
    badge?.click();
    const sheet = q('[data-context-sheet]');
    expect(sheet?.textContent).toContain(ja.context.relevant);
    expect(sheet?.textContent).toContain(ja.context.noise);
    q<HTMLButtonElement>('[data-feed="needed"]')?.click();
    expect(getSession(store.state(), AGENT).feed).toEqual({ mode: 'needed' });
    expect(q('[data-context-badge]')?.dataset.contextBadge).toBe('good');
  });

  it('資料のない案件では Context の状態を出さない', () => {
    const store = createGameStore(createInitialState('ctx-ui'));
    store.dispatch({ type: 'StartProject', projectId: 'ecRenewal' });
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(
      () => (
        <PlayScreen
          store={store}
          projectId="ecRenewal"
          selection={createSelection()}
          vm={() => worldView(store.state(), 'ecRenewal', worldLooks[defaultWorldLookId])}
        />
      ),
      root,
    );
    expect(root.querySelector('[data-context-badge]')).toBeNull();
  });

  it('事件は「次に対応すべき問題」の先頭に 問題 → 原因 → 次の行動 で出て、解決ボタンで解消する', () => {
    const { store, q, root } = mount((s) => ({
      ...s,
      incidents: [{ id: 'staleContext', workerId: AGENT, projectId: P, taskId: 'fix', since: 0 }],
    }));
    const card = root.querySelector('[data-problem]');
    expect(card?.getAttribute('data-problem')).toBe(`incident:staleContext:${AGENT}`);
    expect(card?.textContent).toContain(ja.incidents.staleContext.problem);
    expect(card?.textContent).toContain(ja.incidents.staleContext.cause);
    expect(card?.textContent).toContain(ja.incidents.staleContext.action);
    q<HTMLButtonElement>('[data-resolve]')?.click();
    expect(store.state().incidents).toEqual([]);
    expect(root.querySelector('[data-problem^="incident:"]')).toBeNull();
  });

  it('Handoff の項目を選んで New Session でき、欠ける項目を押す前に知らせる', () => {
    const { store, q } = mount((s) => withSession(s, 40));
    q('[data-context-badge]')?.click();
    expect(q('[data-will-lose]')?.textContent).toContain(ja.handoff.decisions);
    for (const item of handoffItems.filter((i) => i !== 'goal')) {
      q<HTMLInputElement>(`[data-handoff="${item}"] input`)?.click();
    }
    expect(getSession(store.state(), AGENT).handoff).toHaveLength(handoffItems.length - 1);
    expect(q('[data-will-lose]')?.textContent).not.toContain(ja.handoff.decisions);
    expect(q('[data-will-lose]')?.textContent).toContain(ja.handoff.goal);
    q<HTMLButtonElement>('[data-new-session]')?.click();
    const session = getSession(store.state(), AGENT);
    expect(session.age).toBe(0);
    expect(session.lost).toEqual(['goal']);
  });
});
