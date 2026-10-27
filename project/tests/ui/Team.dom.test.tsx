import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { getHuman } from '../../src/content/index';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { getSeat } from '../../src/content/seats';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { ja } from '../../src/i18n/ja';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { ProjectBoard } from '../../src/ui/screens/ProjectBoard';
import { TitleScreen } from '../../src/ui/screens/TitleScreen';
import { createSelection } from '../../src/ui/selection';
import { worldView } from '../../src/view/world';
import { findTalents } from '../helpers/talent';

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

/** テスト（test）が得意な、採用した社員 */
const [tester] = findTalents((h) => h.strengths.includes('test'), 1);

function started(...projects: string[]): GameState {
  const store = createGameStore(createInitialState('team-ui', { team: ['sato', 'suzuki', tester.id] }));
  for (const projectId of projects) store.dispatch({ type: 'StartProject', projectId });
  return store.state();
}

describe('社員と Seat の画面（企画書6章・47章）', () => {
  it('ドックから開くと社員が並び、運用者にだけ今日の使用量が出る', () => {
    const { q, root } = mount(started(P));
    q<HTMLButtonElement>('[data-team-open]')?.click();
    expect(q('[data-team-sheet]')).not.toBeNull();
    const members = [...root.querySelectorAll<HTMLElement>('[data-member]')].map((m) => m.dataset.member);
    expect(members).toEqual(['sato', 'suzuki', tester.id]);
    expect(q('[data-member="suzuki"]')?.textContent).toContain(ja.team.operator);
    expect(q('[data-member="suzuki"] [data-usage]')).not.toBeNull();
    expect(q('[data-member="sato"] [data-usage]')).toBeNull();
    expect(q(`[data-member="${tester.id}"]`)?.textContent).toContain(ja.taskKinds.test);
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

  it('社員の画面が解放されるまではボタンを出さない（チュートリアルの間）', () => {
    const store = createGameStore(createInitialState('c', { board: true }));
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
    expect(tabs[1]?.textContent).toContain(ja.board.floor(2));
    q<HTMLButtonElement>(`[data-project-tab="${Q}"]`)?.click();
    expect(switched).toEqual([Q]);
  });

  it('1件だけなら案件名の見出しのまま（タブは出さない）', () => {
    const { q } = mount(started(P));
    expect(q('[data-project-tab]')).toBeNull();
  });

  it('案件ボードに見積を出していない引き合いがあると、案件ボードへ戻るボタンが出る', () => {
    const store = createGameStore(createInitialState('c', { board: true }));
    store.dispatch({ type: 'StartProject', projectId: 'tutorialLp' });
    const s = store.state();
    const inquiry = { projectId: 'p~1~S', postedDay: 0, closesAt: 960, bid: null };
    const offered: GameState = { ...s, board: { day: 0, inquiries: [inquiry], results: [] } };
    const { q, boards } = mount(offered, 'tutorialLp');
    const button = q<HTMLButtonElement>('[data-board-open]');
    expect(button?.textContent).toContain(ja.board.offers(1));
    button?.click();
    expect(boards()).toBe(1);
  });
});

describe('案件ボードとタイトル', () => {
  it('案件ボードで見積を出すと結果待ちになり、コンペに勝って受注した案件を開ける', () => {
    const base = createInitialState('c', { board: true, tutorial: false });
    const store = createGameStore(step(base, 1).state);
    const opened: string[] = [];
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(() => <ProjectBoard store={store} onOpen={(id) => opened.push(id)} onBack={() => {}} />, root);
    const cards = [...root.querySelectorAll<HTMLElement>('[data-inquiry]')].map((e) => e.dataset.inquiry ?? '');
    expect(cards.length).toBe(2);
    const id = cards[0] ?? '';
    const card = root.querySelector<HTMLElement>(`[data-inquiry="${id}"]`);
    card?.querySelector<HTMLButtonElement>('[data-price="minus20"]')?.click();
    const shown = card?.querySelector('[data-win-after]')?.textContent;
    card?.querySelector<HTMLButtonElement>('[data-submit]')?.click();
    const bid = store.state().board?.inquiries.find((i) => i.projectId === id)?.bid;
    expect(bid?.price).toBe('minus20');
    // 表示した勝率で見積を出す
    expect(shown).toBe(ja.score.percent(bid?.winChance ?? -1));
    // 出した後の引き合いのカードには、提出済みの印と出した見積の選択が残る
    const after1 = root.querySelector<HTMLElement>(`[data-inquiry="${id}"]`);
    expect(after1?.querySelector('[data-submitted]')).not.toBeNull();
    expect(after1?.querySelector('[data-price="minus20"]')?.getAttribute('aria-pressed')).toBe('true');
    // 勝ったことにして締切まで進めると受注し、進行中の案件に並んで開ける（売上は見積額）
    dispose?.();
    root.replaceChildren();
    const s = store.state();
    const won = bid ? { ...bid, winChance: 1 } : null;
    const inquiries = s.board?.inquiries.map((i) => (i.projectId === id ? { ...i, bid: won } : i)) ?? [];
    const after = step({ ...s, board: s.board ? { ...s.board, inquiries } : null }, 960).state;
    expect(after.projects[id]?.revenue).toBe(bid?.amount);
    dispose = render(
      () => <ProjectBoard store={createGameStore(after)} onOpen={(x) => opened.push(x)} onBack={() => {}} />,
      root,
    );
    root.querySelector<HTMLButtonElement>(`[data-board-project="${id}"] [data-resume]`)?.click();
    expect(opened).toEqual([id]);
  });

  it('以前の形式のセーブが残っていれば、タイトルで読み込めないことを知らせる', () => {
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(() => <TitleScreen onStart={() => {}} onSettings={() => {}} outdatedSave />, root);
    expect(root.querySelector('[data-outdated-save]')?.textContent).toContain(ja.board.outdatedSave);
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

describe('採用候補のタブと退職', () => {
  it('採用候補のタブで売値・原価・速度・正確さ・得意分野を比べ、採用すると社員のタブに並ぶ', () => {
    const { store, q, root } = mount(started(P));
    q<HTMLButtonElement>('[data-team-open]')?.click();
    const candidates = store.state().market.candidates;
    const tab = q<HTMLButtonElement>('[data-team-tab="candidates"]');
    expect(tab?.textContent).toContain(ja.team.candidatesTab(candidates.length));
    tab?.click();
    expect(tab?.getAttribute('aria-selected')).toBe('true');
    const cards = [...root.querySelectorAll<HTMLElement>('[data-candidate]')];
    expect(cards.map((c) => c.dataset.candidate)).toEqual(candidates);
    const first = cards[0];
    const h = getHuman(candidates[0] ?? '');
    for (const stat of ['rate', 'skill', 'accuracy', 'strengths']) {
      expect(first?.querySelector(`[data-stat="${stat}"]`)).not.toBeNull();
    }
    expect(first?.textContent).toContain(ja.team.rate(h.dailyRate));
    expect(first?.textContent).toContain(ja.team.skillValue(h.skill));
    expect(first?.textContent).toContain(ja.team.accuracyValue(h.accuracy));
    // 平均との比較は色だけでなく、矢印とラベルでも示す
    const level = first?.querySelector<HTMLElement>('[data-stat="skill"] [data-level]');
    expect(level?.textContent).toContain(ja.team.level[level?.dataset.level as 'high' | 'mid' | 'low']);
    first?.querySelector<HTMLButtonElement>('[data-hire]')?.click();
    expect(store.state().team[h.id]).toBeDefined();
    expect(document.body.textContent).toContain(ja.team.joined(h.name));
    q<HTMLButtonElement>('[data-team-tab="members"]')?.click();
    expect(q(`[data-member="${h.id}"]`)).not.toBeNull();
  });

  it('担当中の仕事がある社員の退職ボタンは無効で理由が出て、仕事のない社員は退職できる', () => {
    const store = createGameStore(started(P));
    store.dispatch({ type: 'AssignTask', projectId: P, taskId: 'interview', mode: 'human', workerId: 'sato' });
    const { store: s, q } = mount(store.state());
    q<HTMLButtonElement>('[data-team-open]')?.click();
    const busy = q<HTMLButtonElement>('[data-release="sato"]');
    expect(busy?.disabled).toBe(true);
    expect(busy?.textContent).toContain(ja.team.releaseBlocked.busy);
    q<HTMLButtonElement>(`[data-release="${tester.id}"]`)?.click();
    expect(s.state().team[tester.id]).toBeUndefined();
    expect(document.body.textContent).toContain(ja.team.released(tester.name));
  });

  it('チュートリアルを終えていれば、タイトルに「チュートリアルなしで始める」が出る（セーブがあれば確認を挟む）', () => {
    let quick = 0;
    const root = document.createElement('div');
    document.body.append(root);
    dispose = render(
      () => <TitleScreen onStart={() => {}} onContinue={() => {}} onQuickStart={() => quick++} onSettings={() => {}} />,
      root,
    );
    const button = root.querySelector<HTMLButtonElement>('[data-quick-start]');
    expect(button?.textContent).toContain(ja.screens.title.quickStart);
    button?.click();
    expect(quick).toBe(0);
    expect(button?.textContent).toContain(ja.screens.title.confirmQuick);
    button?.click();
    expect(quick).toBe(1);
  });
});
