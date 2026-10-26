import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { loadProgress, markTutorialDone, progress } from '../../src/app/progress';
import { createGameStore, type GameStore } from '../../src/app/store';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { tutorialScript } from '../../src/content/tutorial';
import { createInitialState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { TermCards } from '../../src/ui/play/TermCards';
import { findHighlight } from '../../src/ui/play/TutorialCoach';
import { TitleScreen } from '../../src/ui/screens/TitleScreen';
import { createSelection } from '../../src/ui/selection';
import { islandId, worldView } from '../../src/view/world';

const P = tutorialScript.projectId;
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

function mount() {
  const store = createGameStore(createInitialState(tutorialScript.seed, { tutorial: true }));
  store.dispatch({ type: 'StartProject', projectId: P });
  const selection = createSelection();
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(
    () => (
      <>
        <PlayScreen
          store={store}
          projectId={P}
          selection={selection}
          vm={() => worldView(store.state(), P, worldLooks[defaultWorldLookId])}
        />
        <TermCards store={store} durationMs={60_000} />
      </>
    ),
    root,
  );
  const select = (taskId: string) => selection.dispatch({ type: 'SelectEntity', entityId: islandId(taskId) });
  return { store, root, select };
}

const bubble = (root: HTMLElement) => root.querySelector('[data-coach-bubble]')?.textContent ?? '';
const cards = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLButtonElement>('[data-assign-cards] button')].map((b) => b.dataset.mode);
const card = (root: HTMLElement, mode: string) =>
  root.querySelector<HTMLButtonElement>(`[data-assign-cards] button[data-mode="${mode}"]`);

/** 指定の Task が完了するまで時間を進める */
function runUntilDone(store: GameStore, taskId: string) {
  for (let i = 0; i < 2000 && store.state().projects[P]?.tasks[taskId]?.status !== 'done'; i++) store.advance(1);
}

describe('チュートリアル（コーチマークと機能の解放）', () => {
  it('最初は「この作業を誰に任せる？」の吹き出しが出て、担当のカードは「人間」と「AI」の2つだけ', () => {
    const { root, select } = mount();
    expect(bubble(root)).toContain(ja.tutorial.say.choose);
    expect(bubble(root)).toContain(ja.tutorial.skip);
    select('wireframe');
    expect(cards(root)).toEqual(['human', 'ai']);
    // 照らす場所は、シートが開いていれば担当カード
    expect(findHighlight(document, { kind: 'task', taskId: 'wireframe' })).toBe(
      root.querySelector('[data-assign-cards]'),
    );
  });

  it('最初は早送り・稼働・問題の表示を出さず、Task が始まると早送りが解放される', () => {
    const { store, root, select } = mount();
    const items = () => [...root.querySelectorAll<HTMLElement>('[data-hud-item]')].map((e) => e.dataset.hudItem);
    expect(items()).toEqual(['profitPerHumanHour', 'remaining']);
    select('wireframe');
    card(root, 'ai')?.click();
    store.advance(1);
    expect(items()).toContain('speed');
    expect(items()).not.toContain('problems');
    expect(root.textContent).toContain(`${ja.unlocks.badge} ${ja.unlocks.speed}`);
  });

  it('操作すればステップが進む：AI を選ぶと「AI が作業中」、終わると次の Task へ。許していないモードは押せない', () => {
    const { store, root, select } = mount();
    select('wireframe');
    card(root, 'ai')?.click();
    expect(bubble(root)).toContain(ja.tutorial.say.aiWorking);
    runUntilDone(store, 'wireframe');
    expect(bubble(root)).toContain(ja.tutorial.say.aiFast);
    select('coding');
    expect(card(root, 'human')?.getAttribute('aria-disabled')).toBe('true');
    card(root, 'human')?.click();
    expect(store.state().projects[P]?.tasks.coding?.assignment).toBeNull();
    card(root, 'ai')?.click();
    expect(store.state().projects[P]?.tasks.coding?.assignment?.mode).toBe('ai');
  });

  it('AI のミスの後で「AI → 人間レビュー」が NEW バッジ付きで解放され、使い終えると用語のカードが出る', () => {
    const { store, root, select } = mount();
    select('wireframe');
    card(root, 'ai')?.click();
    runUntilDone(store, 'wireframe');
    expect(root.querySelector('[data-term-card="delegation"]')?.textContent).toContain(ja.glossary.delegation.term);
    select('coding');
    card(root, 'ai')?.click();
    runUntilDone(store, 'coding');
    expect(bubble(root)).toContain(ja.tutorial.say.needReview);
    select('form');
    expect(cards(root)).toEqual(['human', 'ai', 'aiThenHumanReview']);
    expect(card(root, 'aiThenHumanReview')?.querySelector('[data-new-badge]')).not.toBeNull();
    expect(findHighlight(document, { kind: 'task', taskId: 'form', mode: 'aiThenHumanReview' })).toBe(
      card(root, 'aiThenHumanReview'),
    );
    card(root, 'aiThenHumanReview')?.click();
    runUntilDone(store, 'form');
    expect(root.querySelector('[data-term-card="humanInTheLoop"]')).not.toBeNull();
    expect(bubble(root)).toContain(ja.tutorial.say.tryEval);
    select('responsive');
    expect(cards(root)).toContain('aiThenEval');
  });

  it('スキップするとコーチマークが消え、すべての担当を選べる', () => {
    const { store, root, select } = mount();
    root.querySelector<HTMLButtonElement>('[data-coach-skip]')?.click();
    expect(store.state().tutorial).toBeNull();
    expect(root.querySelector('[data-tutorial-coach]')).toBeNull();
    select('wireframe');
    expect(cards(root)).toHaveLength(6);
  });
});

describe('チュートリアルの完了フラグ', () => {
  it('保存がなければ未完了、markTutorialDone で保存して以降は完了として読む', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) };
    expect(loadProgress(storage).tutorialDone).toBe(false);
    markTutorialDone(storage);
    expect(progress().tutorialDone).toBe(true);
    expect(loadProgress(storage).tutorialDone).toBe(true);
    expect(loadProgress({ getItem: () => '{broken' }).tutorialDone).toBe(false);
  });

  it('タイトル画面は、完了後だけ「チュートリアルをもう一度」を出す', () => {
    const root = document.createElement('div');
    document.body.append(root);
    let retried = 0;
    dispose = render(
      () => (
        <>
          <TitleScreen onStart={() => {}} onSettings={() => {}} />
          <TitleScreen onStart={() => {}} onTutorial={() => retried++} onSettings={() => {}} />
        </>
      ),
      root,
    );
    const buttons = root.querySelectorAll<HTMLButtonElement>('[data-retry-tutorial]');
    expect(buttons).toHaveLength(1);
    buttons[0]?.click();
    expect(retried).toBe(1);
  });
});
