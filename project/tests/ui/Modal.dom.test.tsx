import { createRoot, createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startLoop } from '../../src/app/loop';
import { createMilestones } from '../../src/app/milestones';
import { createGameStore, type EventListener, type GameStore } from '../../src/app/store';
import { glossary } from '../../src/content/glossary';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { createInitialState } from '../../src/core/state';
import { createNotices } from '../../src/ui/notices';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { createTermCards } from '../../src/ui/play/TermCards';
import { createSelection } from '../../src/ui/selection';
import { deliveryView } from '../../src/view/fiscal';
import { islandId, worldView } from '../../src/view/world';
import { growCompany } from '../helpers/growth';

const P = 'ecRenewal';
const LAYOUT = { max: 5, durationMs: 1000 } as const;
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const key = (k: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('時間を止める画面の間の通知', () => {
  it('held の間に届いた通知は消えず、解除した後に残りの時間で消える', () => {
    vi.useFakeTimers();
    const [held, setHeld] = createSignal(true);
    const notices = createRoot((d) => {
      dispose = d;
      return createNotices(() => LAYOUT, held);
    });
    notices.push({ text: '決算と同時に届いた', icon: 'success' });
    vi.advanceTimersByTime(LAYOUT.durationMs * 10);
    expect(notices.list().map((n) => n.text)).toEqual(['決算と同時に届いた']);
    setHeld(false);
    vi.advanceTimersByTime(LAYOUT.durationMs - 1);
    expect(notices.list()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(notices.list()).toHaveLength(0);
  });

  it('出ている途中で held になったら残り時間を持ち越す（止めている間は数えない）', () => {
    vi.useFakeTimers();
    const [held, setHeld] = createSignal(false);
    const notices = createRoot((d) => {
      dispose = d;
      return createNotices(() => LAYOUT, held);
    });
    notices.push({ text: 'a', icon: 'success' });
    vi.advanceTimersByTime(600);
    setHeld(true);
    vi.advanceTimersByTime(LAYOUT.durationMs * 10);
    expect(notices.list()).toHaveLength(1);
    setHeld(false);
    vi.advanceTimersByTime(399);
    expect(notices.list()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(notices.list()).toHaveLength(0);
  });

  it('用語のカードも held の間は消えない', () => {
    vi.useFakeTimers();
    const [held, setHeld] = createSignal(true);
    // TermRevealed を直接流すストア（用語を明かすところまで遊ばずに試す）
    const listeners = new Set<EventListener>();
    const base = createGameStore(createInitialState('terms'));
    const store: GameStore = {
      ...base,
      onEvents(l) {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    };
    const terms = createRoot((d) => {
      dispose = d;
      return createTermCards(() => store, LAYOUT.durationMs, held);
    });
    for (const l of listeners) l([{ type: 'TermRevealed', term: (glossary[0] as (typeof glossary)[number]).id }]);
    expect(terms.cards().length).toBeGreaterThan(0);
    vi.advanceTimersByTime(LAYOUT.durationMs * 10);
    expect(terms.cards().length).toBeGreaterThan(0);
    setHeld(false);
    vi.advanceTimersByTime(LAYOUT.durationMs);
    expect(terms.cards()).toHaveLength(0);
  });
});

describe('時間を止める画面の間のキー操作', () => {
  function mount(held: () => boolean) {
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
          held={held}
          vm={() => worldView(store.state(), P, worldLooks[defaultWorldLookId])}
        />
      ),
      root,
    );
    return { store, selection };
  }

  it('決算などを出している間は、矢印・Esc・Space が裏のプレイ画面に効かない。閉じたら効く', () => {
    const [held, setHeld] = createSignal(true);
    const { store, selection } = mount(held);
    key('ArrowRight');
    expect(selection.selected()).toBeNull();
    key(' ');
    expect(store.run()).toBeNull();
    selection.dispatch({ type: 'SelectEntity', entityId: islandId('hearing') });
    key('Escape');
    expect(selection.selected()).toBe(islandId('hearing'));
    setHeld(false);
    key('Escape');
    expect(selection.selected()).toBeNull();
    key('ArrowRight');
    expect(selection.selected()).not.toBeNull();
    key(' ');
    expect(store.run()).not.toBeNull();
  });

  it('Space で最後の納品の結果を閉じても、同じキーで日を進め始めない', () => {
    const [views, setViews] = createSignal<readonly string[]>(['done']);
    // 納品の結果（app/milestones.ts）と同じく、プレイ画面より先に Space を受けて閉じる
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || views().length === 0) return;
      e.preventDefault();
      setViews([]);
    };
    window.addEventListener('keydown', onKey);
    const { store } = mount(() => views().length > 0);
    key(' ');
    window.removeEventListener('keydown', onKey);
    expect(views()).toEqual([]);
    expect(store.run()).toBeNull();
    key(' ');
    expect(store.run()).not.toBeNull();
  });
});

describe('プレイ画面のモーダル', () => {
  it('詳細を開いている間は時間を止めるよう知らせ、外側の暗い背景を押すと閉じる', () => {
    const store = createGameStore(createInitialState('modal'));
    store.dispatch({ type: 'StartProject', projectId: P });
    const selection = createSelection();
    const [open, setOpen] = createSignal(false);
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(
      () => (
        <PlayScreen
          store={store}
          projectId={P}
          selection={selection}
          onModalOpen={setOpen}
          vm={() => worldView(store.state(), P, worldLooks[defaultWorldLookId])}
        />
      ),
      root,
    );
    expect(open()).toBe(false);
    expect(root.querySelector('[data-modal-backdrop]')).toBeNull();
    selection.dispatch({ type: 'SelectEntity', entityId: islandId('hearing') });
    expect(open()).toBe(true);
    expect(root.querySelector('[data-detail-sheet]')?.getAttribute('aria-modal')).toBe('true');
    root.querySelector<HTMLElement>('[data-modal-backdrop]')?.click();
    expect(selection.selected()).toBeNull();
    expect(open()).toBe(false);
  });
});

describe('節目の画面（app/milestones.ts）', () => {
  /** 直轄の案件を納品した会社（時間が進んでいる）と、納品の結果2件 */
  function delivered() {
    const state = growCompany('delivery-ui', 3).state;
    const id = Object.values(state.projects).find((p) => p.completedAt !== null)?.projectId ?? '';
    const view = deliveryView(state, id);
    if (!view) throw new Error('納品した案件がない');
    // 2件目は同じ結果を別の案件として出す（milestones は中身を見ない）
    const views = [view, { ...view, projectId: `${id}-2` }];
    const store = createGameStore(state);
    const [settingsOpen, setSettingsOpen] = createSignal(false);
    const m = createRoot((d) => {
      dispose = d;
      return createMilestones(settingsOpen);
    });
    return { store, m, views, setSettingsOpen };
  }

  it('直轄の納品の結果は順に出し、最後の1件を閉じたら節目の画面を閉じる（Space でも閉じる）', () => {
    const { m, views } = delivered();
    expect(views.every((v) => v.direct)).toBe(true);
    m.showDeliveries(views);
    expect(m.open()).toBe(true);
    expect(m.delivery()?.projectId).toBe(views[0]?.projectId);
    m.closeDelivery();
    expect(m.delivery()?.projectId).toBe(views[1]?.projectId);
    expect(m.open()).toBe(true);
    key(' ');
    expect(m.delivery()).toBeNull();
    expect(m.open()).toBe(false);
  });

  it('設定を開いている間は、Space で納品の結果を閉じない', () => {
    const { m, views, setSettingsOpen } = delivered();
    m.showDeliveries(views.slice(0, 1));
    setSettingsOpen(true);
    key(' ');
    expect(m.delivery()?.projectId).toBe(views[0]?.projectId);
    setSettingsOpen(false);
    key(' ');
    expect(m.delivery()).toBeNull();
  });

  it('決算と同時に納品したら、決算を閉じた後に納品の結果を出す', () => {
    const { m, views } = delivered();
    m.showDeliveries(views.slice(0, 1));
    m.showFiscal(1);
    // 決算の下には納品の結果を出さない
    expect(m.delivery()).toBeNull();
    expect(m.open()).toBe(true);
    m.closeFiscal();
    expect(m.fiscal()).toBeNull();
    expect(m.delivery()?.projectId).toBe(views[0]?.projectId);
    expect(m.open()).toBe(true);
    m.closeDelivery();
    expect(m.open()).toBe(false);
  });

  it('倒産を出したら決算を閉じ、reset で倒産の有無を読み込み直す', () => {
    const { m, views } = delivered();
    m.showDeliveries(views);
    m.showFiscal(1);
    m.showBankrupt();
    expect(m.fiscal()).toBeNull();
    expect(m.bankrupt()).toBe(true);
    expect(m.delivery()).toBeNull();
    m.reset(false);
    expect(m.bankrupt()).toBe(false);
    expect(m.open()).toBe(false);
  });

  it('節目の画面を開いている間は（App の held）、進めている日があってもゲームループは時間を進めず、閉じたら続きから進む', () => {
    let frames: FrameRequestCallback[] = [];
    let now = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = [];
    });
    const frame = () => {
      now += 100;
      const current = frames;
      frames = [];
      for (const cb of current) cb(now);
    };
    try {
      const { store, m, views } = delivered();
      const stop = startLoop(store, undefined, m.open);
      frame();
      store.play(false);
      m.showDeliveries(views.slice(0, 1));
      const at = store.state().clock + store.state().carryMinutes;
      for (let i = 0; i < 5; i++) frame();
      expect(store.state().clock + store.state().carryMinutes).toBe(at);
      expect(store.run()).not.toBeNull();
      m.closeDelivery();
      frame();
      expect(store.state().clock + store.state().carryMinutes).toBeGreaterThan(at);
      stop();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
