import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { getSeat } from '../../src/content/seats';
import { createInitialState, type GameState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { CampaignBoard } from '../../src/ui/screens/CampaignBoard';
import { TitleScreen } from '../../src/ui/screens/TitleScreen';
import { createSelection } from '../../src/ui/selection';
import { worldView } from '../../src/view/world';

const P = 'internalTool';
const Q = 'promoLp';
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

function mount(state: GameState, projectId = P) {
  const store = createGameStore(state);
  const selection = createSelection();
  const root = document.createElement('div');
  document.body.append(root);
  const switched: string[] = [];
  let boards = 0;
  dispose = render(
    () => (
      <PlayScreen
        store={store}
        projectId={projectId}
        selection={selection}
        vm={() => worldView(store.state(), projectId, worldLooks[defaultWorldLookId])}
        onSwitch={(id) => switched.push(id)}
        onBoard={() => boards++}
      />
    ),
    root,
  );
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  return { store, root, q, switched, boards: () => boards };
}

function started(...projects: string[]): GameState {
  const store = createGameStore(createInitialState('team-ui', { team: ['sato', 'suzuki', 'watanabe'] }));
  for (const projectId of projects) store.dispatch({ type: 'StartProject', projectId });
  return store.state();
}

describe('社員と Seat の画面（企画書6章・47章）', () => {
  it('ドックから開くと社員が並び、運用者にだけ今日の使用量が出る', () => {
    const { q, root } = mount(started(P));
    q<HTMLButtonElement>('[data-team-open]')?.click();
    expect(q('[data-team-sheet]')).not.toBeNull();
    const members = [...root.querySelectorAll<HTMLElement>('[data-member]')].map((m) => m.dataset.member);
    expect(members).toEqual(['sato', 'suzuki', 'watanabe']);
    expect(q('[data-member="suzuki"]')?.textContent).toContain(ja.team.operator);
    expect(q('[data-member="suzuki"] [data-usage]')).not.toBeNull();
    expect(q('[data-member="sato"] [data-usage]')).toBeNull();
    expect(q('[data-member="watanabe"]')?.textContent).toContain(ja.taskKinds.test);
  });

  it('選んでいない Seat には「AI 容量 +400% / 費用 +¥XX,XXX / 月」が即座に出て、押すと確定してトーストが出る', () => {
    const { store, q } = mount(started(P));
    q<HTMLButtonElement>('[data-team-open]')?.click();
    const premium = q<HTMLButtonElement>('[data-member="suzuki"] [data-seat-option="premium"]');
    const preview = premium?.querySelector('[data-seat-preview]')?.textContent ?? '';
    expect(preview).toContain(ja.team.capacity(4));
    expect(preview).toContain('+¥200,000 / 月');
    premium?.click();
    expect(store.state().team.suzuki?.seat).toBe('premium');
    expect(premium?.getAttribute('aria-pressed')).toBe('true');
    // 戻す方向の差分は減る
    const standard = q('[data-member="suzuki"] [data-seat-option="standard"] [data-seat-preview]')?.textContent ?? '';
    expect(standard).toContain(ja.team.capacity(-0.8));
    expect(standard).toContain('−¥200,000 / 月');
    expect(document.body.textContent).toContain(ja.team.changed(getSeat('premium').name));
  });

  it('運用者の使用量が上限を超えると、ドックのボタンと画面にアイコン付きで警告が出る', () => {
    const base = started(P);
    const over: GameState = { ...base, team: { ...base.team, suzuki: { seat: 'standard', used: 999 } } };
    const { q } = mount(over);
    expect(q('[data-team-warning]')).not.toBeNull();
    q<HTMLButtonElement>('[data-team-open]')?.click();
    expect(q('[data-over-limit]')?.textContent).toContain(ja.team.overLimit);
  });

  it('社員の画面が解放されるまではボタンを出さない（キャンペーンの序盤）', () => {
    const store = createGameStore(createInitialState('c', { campaign: true }));
    store.dispatch({ type: 'StartProject', projectId: 'tutorialLp' });
    const { q } = mount(store.state(), 'tutorialLp');
    expect(q('[data-team-open]')).toBeNull();
  });
});

describe('複数案件の同時進行', () => {
  it('2件以上を進めているとドックに案件のタブ（フロア）が並び、押すとその案件へ切り替える', () => {
    const { q, root, switched } = mount(started(P, Q));
    const tabs = [...root.querySelectorAll<HTMLElement>('[data-project-tab]')];
    expect(tabs.map((t) => t.dataset.projectTab)).toEqual([P, Q]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]?.textContent).toContain(ja.campaign.floor(2));
    q<HTMLButtonElement>(`[data-project-tab="${Q}"]`)?.click();
    expect(switched).toEqual([Q]);
  });

  it('1件だけなら案件名の見出しのまま（タブは出さない）', () => {
    const { q } = mount(started(P));
    expect(q('[data-project-tab]')).toBeNull();
  });

  it('キャンペーンで新しい依頼が届くと、案件ボードへ戻るボタンが出る', () => {
    const store = createGameStore(createInitialState('c', { campaign: true }));
    store.dispatch({ type: 'StartProject', projectId: 'tutorialLp' });
    const s = store.state();
    const offered: GameState = {
      ...s,
      campaign: { reached: ['tutorial', 'ec'], cleared: false },
    };
    const { q, boards } = mount(offered, 'tutorialLp');
    const button = q<HTMLButtonElement>('[data-board-open]');
    expect(button?.textContent).toContain(ja.campaign.offers(1));
    button?.click();
    expect(boards()).toBe(1);
  });
});

describe('案件ボードとタイトル', () => {
  it('案件ボードで受注すると案件が始まり、その案件を開く', () => {
    const base = createInitialState('c', { campaign: true });
    const store = createGameStore({ ...base, campaign: { reached: ['tutorial', 'ec'], cleared: false } });
    const opened: string[] = [];
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(() => <CampaignBoard store={store} onOpen={(id) => opened.push(id)} onBack={() => {}} />, root);
    const offered = [...root.querySelectorAll<HTMLElement>('[data-board-project]')].map((e) => e.dataset.boardProject);
    expect(offered).toEqual(['tutorialLp', 'ecRenewal']);
    root.querySelector<HTMLButtonElement>('[data-board-project="ecRenewal"] [data-start]')?.click();
    expect(store.state().projects.ecRenewal).toBeDefined();
    expect(opened).toEqual(['ecRenewal']);
    expect(root.querySelector('[data-board-project="ecRenewal"] [data-resume]')).not.toBeNull();
  });

  it('セーブがあればタイトルに「続きから」が出て、「はじめから」は確認を1回挟む', () => {
    let continued = 0;
    let started = 0;
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(
      () => <TitleScreen onStart={() => started++} onContinue={() => continued++} onSettings={() => {}} />,
      root,
    );
    root.querySelector<HTMLButtonElement>('[data-continue]')?.click();
    expect(continued).toBe(1);
    const fresh = root.querySelector<HTMLButtonElement>('[data-new-game]');
    fresh?.click();
    expect(started).toBe(0);
    expect(fresh?.textContent).toContain(ja.screens.title.confirmNew);
    fresh?.click();
    expect(started).toBe(1);
  });
});
