import { createRoot, createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMilestones } from '../../src/app/milestones';
import { createGameStore, type EventListener, type GameStore } from '../../src/app/store';
import { balance } from '../../src/content/balance';
import { glossary } from '../../src/content/glossary';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { catchUp } from '../../src/core/away';
import { createInitialState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { createNotices } from '../../src/ui/notices';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { createTermCards } from '../../src/ui/play/TermCards';
import { createSelection } from '../../src/ui/selection';
import { daySummary, recapView } from '../../src/view/session';
import { islandId, worldView } from '../../src/view/world';
import { campaignInProgress } from '../helpers/session';

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
    const paused = store.state().paused;
    key('ArrowRight');
    expect(selection.selected()).toBeNull();
    key(' ');
    expect(store.state().paused).toBe(paused);
    selection.dispatch({ type: 'SelectEntity', entityId: islandId('hearing') });
    key('Escape');
    expect(selection.selected()).toBe(islandId('hearing'));
    setHeld(false);
    key('Escape');
    expect(selection.selected()).toBeNull();
    key('ArrowRight');
    expect(selection.selected()).not.toBeNull();
  });
});

describe('節目の画面を閉じて再開する（app/milestones.ts）', () => {
  /** 閉じていた間に期を締めた会社を「続きから」開いたところ（あらすじを出し、決算を保留している） */
  function resumed() {
    const before = campaignInProgress('modal-recap');
    const { state: after, events } = catchUp(before, 24 * 60 * 60);
    const store = createGameStore({ ...after, paused: true });
    const [settingsOpen, setSettingsOpen] = createSignal(false);
    const m = createRoot((d) => {
      dispose = d;
      return createMilestones(() => store, settingsOpen);
    });
    m.showRecap(recapView(before, after, events), 1);
    return { store, m, setSettingsOpen };
  }

  it('あらすじの表示中に Space で再開すると、保留していた決算を一時停止したまま出す', () => {
    const { store, m } = resumed();
    expect(m.open()).toBe(true);
    key(' ');
    expect(m.recap()).toBeNull();
    expect(m.fiscal()).toBe(1);
    expect(store.state().paused).toBe(true);
    // 決算を閉じたら再開する
    m.resume();
    expect(m.fiscal()).toBeNull();
    expect(m.open()).toBe(false);
    expect(store.state().paused).toBe(false);
  });

  it('HUD の再開（TogglePause）であらすじを閉じても、保留していた決算を出して止めたままにする', () => {
    const { store, m } = resumed();
    store.dispatch({ type: 'TogglePause' });
    expect(m.recap()).toBeNull();
    expect(m.fiscal()).toBe(1);
    expect(store.state().paused).toBe(true);
  });

  it('設定を開いている間は、Space であらすじを閉じない', () => {
    const { store, m, setSettingsOpen } = resumed();
    setSettingsOpen(true);
    key(' ');
    expect(m.recap()).not.toBeNull();
    expect(store.state().paused).toBe(true);
  });

  it('区切りのカードは Space で閉じて再開する（保留した決算がなければそのまま進む）', () => {
    const start = campaignInProgress('modal-day', 1);
    const end = step(start, balance.time.minutesPerDay).state;
    const store = createGameStore({ ...end, paused: true });
    const m = createRoot((d) => {
      dispose = d;
      return createMilestones(() => store);
    });
    m.showDay(daySummary(start, end));
    key(' ');
    expect(m.dayCard()).toBeNull();
    expect(m.fiscal()).toBeNull();
    expect(store.state().paused).toBe(false);
  });
});
