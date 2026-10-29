import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { getHuman, getProject } from '../../src/content/index';
import { screenRegions, uiLayout } from '../../src/content/look/layout';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { getSeat } from '../../src/content/seats';
import { openInquiries } from '../../src/core/board';
import { tierOf } from '../../src/core/company';
import { maxProjects, orderTerms } from '../../src/core/orders';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { ja } from '../../src/i18n/ja';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { TitleScreen } from '../../src/ui/screens/TitleScreen';
import { createSelection } from '../../src/ui/selection';
import { boardView } from '../../src/view/board';
import { worldView } from '../../src/view/world';
import { findMenu, pressMenu } from '../helpers/menu';
import { findTalents } from '../helpers/talent';

const P = 'internalTool';
const Q = 'promoLp';
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

/** プレイ画面を開く。projectId が null ならホーム。size を渡すとその大きさの画面の形で開く */
function mount(state: GameState, projectId: string | null = P, size?: { width: number; height: number }) {
  const store = createGameStore(state);
  const selection = createSelection();
  const root = document.createElement('div');
  document.body.append(root);
  const switched: string[] = [];
  const reviewed: string[] = [];
  let homes = 0;
  dispose = render(
    () => (
      <PlayScreen
        store={store}
        projectId={projectId}
        selection={selection}
        vm={() => worldView(store.state(), projectId, worldLooks[defaultWorldLookId])}
        onSwitch={(id) => switched.push(id)}
        onHome={() => homes++}
        onReview={(id) => reviewed.push(id)}
        regions={size ? () => screenRegions(uiLayout, size) : undefined}
      />
    ),
    root,
  );
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  return { store, root, q, switched, reviewed, homes: () => homes };
}

/** チュートリアルを飛ばして始め、最初の引き合いが届いた会社（進行中の案件はない） */
const offeredCompany = () => step(createInitialState('c', { board: true, tutorial: false }), 1).state;

/** テスト（test）が得意な、採用した社員 */
const [tester] = findTalents((h) => h.strengths.includes('test'), 1);

/** 3人の会社。採用の余地があるよう、人員の上限が3人より多い規模で始める */
function started(...projects: string[]): GameState {
  const store = createGameStore(
    createInitialState('team-ui', { team: ['sato', 'suzuki', tester.id], tier: 'startup' }),
  );
  for (const projectId of projects) store.dispatch({ type: 'StartProject', projectId });
  return store.state();
}

describe('社員と Seat の画面（企画書6章・47章）', () => {
  it('ドックから開くと、会社の Seat と今日の使用量の下に社員が並ぶ', () => {
    const { q, root } = mount(started(P));
    pressMenu(document.body, '[data-team-open]');
    expect(q('[data-team-sheet]')).not.toBeNull();
    const members = [...root.querySelectorAll<HTMLElement>('[data-member]')].map((m) => m.dataset.member);
    expect(members).toEqual(['sato', 'suzuki', tester.id]);
    expect(q('[data-seats] [data-usage]')).not.toBeNull();
    expect(q('[data-member] [data-usage]')).toBeNull();
    expect(q('[data-seat="standard"] [data-seat-count]')?.textContent).toBe(ja.team.seatCount(2));
    expect(q(`[data-member="${tester.id}"]`)?.textContent).toContain(ja.taskKinds.test);
  });

  it('Seat の ＋ の横には「AI 容量 +750 / 日・費用 +¥XX,XXX / 月」が即座に出て、−/＋ で枚数が変わりトーストが出る', () => {
    const { store, q } = mount(started(P));
    pressMenu(document.body, '[data-team-open]');
    const preview = q('[data-seat="premium"] [data-seat-preview]')?.textContent ?? '';
    expect(preview).toContain(ja.team.capacity(750));
    expect(preview).toContain('+¥250,000 / 月');
    expect(q<HTMLButtonElement>('[data-seat-remove="premium"]')?.disabled).toBe(true);
    q<HTMLButtonElement>('[data-seat-add="premium"]')?.click();
    expect(store.state().seats.premium).toBe(1);
    expect(q('[data-seat="premium"] [data-seat-count]')?.textContent).toBe(ja.team.seatCount(1));
    expect(document.body.textContent).toContain(ja.team.changed(getSeat('premium').name, 1));
    q<HTMLButtonElement>('[data-seat-remove="standard"]')?.click();
    expect(store.state().seats.standard).toBe(1);
  });

  it('会社の使用量を使い切ると、ドックのボタンと画面にアイコン付きで警告が出る', () => {
    const base = started(P);
    const over: GameState = { ...base, usage: 999 };
    const { q } = mount(over);
    expect(q('[data-team-warning]')).not.toBeNull();
    pressMenu(document.body, '[data-team-open]');
    expect(q('[data-over-limit]')?.textContent).toContain(ja.team.overLimit);
  });

  it('社員の画面が解放されるまではボタンを出さない（チュートリアルの間）', () => {
    const store = createGameStore(createInitialState('c', { board: true }));
    store.dispatch({ type: 'StartProject', projectId: 'tutorialLp' });
    mount(store.state(), 'tutorialLp');
    expect(findMenu(document.body, '[data-team-open]')).toBeNull();
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

  it('案件を進めている間に受注していない引き合いがあると、案件ボードのシートを開くボタンとオフィスのタブが出る', () => {
    const store = createGameStore(createInitialState('c', { board: true, tutorial: false }));
    store.dispatch({ type: 'StartProject', projectId: P });
    const s = store.state();
    const inquiry = { projectId: 'p~1~S', postedDay: 0, closesAt: 420 };
    const offered: GameState = { ...s, board: { day: 0, inquiries: [inquiry] } };
    const { q, homes } = mount(offered, P);
    const button = q<HTMLButtonElement>('[data-board-open]');
    expect(button?.textContent).toContain(ja.board.offers(1));
    button?.click();
    expect(q('[data-board-sheet]')).not.toBeNull();
    q<HTMLButtonElement>('[data-home-tab]')?.click();
    expect(homes()).toBe(1);
  });
});

describe('3D ホーム（案件を開いていないプレイ画面）', () => {
  it('案件が0件でも、ドックにオフィスの見出しと引き合いの入口が出る（案件の項目は出さない）', () => {
    const s = offeredCompany();
    expect(Object.keys(s.projects)).toEqual([]);
    const { q } = mount(s, null);
    expect(q('[data-home]')?.textContent).toContain(ja.board.home);
    expect(q('[data-board-open]')?.textContent).toContain(ja.board.inquiriesEntry(openInquiries(s).length));
    expect(q('[data-hud-item]')).toBeNull();
    expect(q('[data-project-tab]')).toBeNull();
  });

  it('引き合いの入口で案件ボードのシートが開き、「閉じる」でシートだけが閉じてホームに残る', () => {
    const { q, homes } = mount(offeredCompany(), null);
    q<HTMLButtonElement>('[data-board-open]')?.click();
    const sheet = q('[data-board-sheet]');
    expect(sheet).not.toBeNull();
    expect(sheet?.querySelectorAll('[data-inquiry]').length).toBeGreaterThan(0);
    // ボードは「引き合い」だけ（進行中の案件の一覧と「再開」はない）
    expect(sheet?.querySelector('[data-resume]')).toBeNull();
    expect(sheet?.querySelector('[data-board-project]')).toBeNull();
    q<HTMLButtonElement>('[data-board-close]')?.click();
    expect(q('[data-board-sheet]')).toBeNull();
    expect(q('[data-home]')).not.toBeNull();
    expect(homes()).toBe(0);
  });

  it('引き合いの締切は HUD の時計と同じ「N日目 HH:MM」で出る', () => {
    const state = offeredCompany();
    const { q } = mount(state, null);
    q<HTMLButtonElement>('[data-board-open]')?.click();
    // 先頭は締切の近い引き合い（締切の日の計算は tests/unit/board.test.ts で確かめる）
    const first = boardView(state).inquiries[0];
    expect(q('[data-closes]')?.textContent).toBe(ja.board.closes(first?.closes.day ?? 0, '17:00'));
  });

  it('社員と Seat のシートの「実績」に、納品した案件が並ぶ（案件ボードからは外した一覧）', () => {
    const single = createGameStore(createInitialState('d'));
    single.dispatch({ type: 'StartProject', projectId: P });
    const run = single.state().projects[P];
    if (!run) throw new Error('案件が始まっていない');
    const tasks = Object.fromEntries(
      Object.entries(run.tasks).map(([id, t]) => [id, { ...t, status: 'done' as const }]),
    );
    const s = { ...offeredCompany(), projects: { [P]: { ...run, tasks, completedAt: 1 } } };
    const { q } = mount(s, null);
    pressMenu(document.body, '[data-team-open]');
    const tab = q<HTMLButtonElement>('[data-team-tab="record"]');
    expect(tab?.textContent).toContain(ja.team.recordTab(1));
    tab?.click();
    expect(q(`[data-delivered="${P}"]`)?.textContent).toContain(getProject(P).name);
  });
});

/** 引き合いを1件受注した会社と、受注した案件の id。受注する直前の state も返す */
function wonCompany() {
  const before = offeredCompany();
  const id = openInquiries(before)[0] ?? '';
  const store = createGameStore(before);
  store.dispatch({ type: 'AcceptOrder', projectId: id });
  return { id, before, after: store.state() };
}

/** 案件の Task をすべて終えて納品した state */
function delivered(state: GameState, projectId: string): GameState {
  const run = state.projects[projectId];
  if (!run) throw new Error('案件が始まっていない');
  const tasks = Object.fromEntries(Object.entries(run.tasks).map(([id, t]) => [id, { ...t, status: 'done' as const }]));
  return { ...state, projects: { ...state.projects, [projectId]: { ...run, tasks, completedAt: state.clock } } };
}

describe('受注・納品した案件への導線', () => {
  it('ホームでは、狭い形でも受注した案件のタブを「ほか N 件」に隠さずに並べる', () => {
    const { id, after } = wonCompany();
    // 狭い PC（選んでいない案件のタブを並べない形）とスマホ（今のタブと「+N」を1つにまとめる形）
    for (const size of [
      { width: 820, height: 900 },
      { width: 390, height: 800 },
    ]) {
      const { q, switched } = mount(after, null, size);
      expect(q('[data-more-tabs]')).toBeNull();
      q<HTMLButtonElement>(`[data-project-tab="${id}"]`)?.click();
      expect(switched).toEqual([id]);
      dispose();
      document.body.innerHTML = '';
    }
  });

  it('別の案件を開いている間に受注すると、お知らせの「開く」でその案件へ移れる', () => {
    const { id, before } = wonCompany();
    const store0 = createGameStore(before);
    store0.dispatch({ type: 'StartProject', projectId: P });
    const { store, q, switched } = mount(store0.state(), P);
    store.dispatch({ type: 'AcceptOrder', projectId: id });
    expect(store.state().projects[id]).toBeDefined();
    const action = q<HTMLButtonElement>('[data-notice-action]');
    expect(action?.textContent).toBe(ja.board.openProject);
    action?.click();
    expect(switched).toEqual([id]);
  });

  it('社員と Seat のシートの「実績」から、納品した案件の振り返りを開ける', () => {
    const { id, after } = wonCompany();
    const s = { ...delivered(after, id), unlocked: [...after.unlocked, 'hire' as const] };
    const { q, reviewed } = mount(s, null);
    pressMenu(document.body, '[data-team-open]');
    q<HTMLButtonElement>('[data-team-tab="record"]')?.click();
    q<HTMLButtonElement>(`[data-delivered-review="${id}"]`)?.click();
    expect(reviewed).toEqual([id]);
  });
});

describe('案件ボードとタイトル', () => {
  it('案件ボードで「受注する」を押すとその場で受注し、受注した案件がドックのタブに並ぶ', () => {
    const base = offeredCompany();
    const id = openInquiries(base)[0] ?? '';
    const terms = orderTerms(base, id);
    const { store, root } = mount(base, null);
    root.querySelector<HTMLButtonElement>('[data-board-open]')?.click();
    const cards = [...root.querySelectorAll<HTMLElement>('[data-inquiry]')].map((e) => e.dataset.inquiry ?? '');
    expect(cards.length).toBe(tierOf(base).inquiries);
    expect(cards[0]).toBe(id);
    const card = root.querySelector<HTMLElement>(`[data-inquiry="${id}"]`);
    // カードには受注の条件（報酬・納期・契約）が出る
    expect(card?.textContent).toContain(ja.board.amount(terms.revenue));
    expect(card?.textContent).toContain(ja.board.deadlineDays(terms.deadlineDays));
    expect(card?.querySelector('[data-contract]')).not.toBeNull();
    card?.querySelector<HTMLButtonElement>('[data-accept]')?.click();
    const after = store.state();
    expect(after.projects[id]).toMatchObject({ revenue: terms.revenue, deadlineDays: terms.deadlineDays });
    // 受注した引き合いのカードは消える
    expect(root.querySelector(`[data-inquiry="${id}"]`)).toBeNull();
    // ホームのドックのタブに並んで開ける
    dispose?.();
    document.body.innerHTML = '';
    const home = mount(after, null);
    home.q<HTMLButtonElement>(`[data-project-tab="${id}"]`)?.click();
    expect(home.switched).toEqual([id]);
  });

  it('同時に進められる数に達していると、「受注する」を押しても受注せず、理由が出る', () => {
    let s = offeredCompany();
    const ids = openInquiries(s);
    const store0 = createGameStore(s);
    for (const id of ids.slice(0, maxProjects(s))) store0.dispatch({ type: 'AcceptOrder', projectId: id });
    s = store0.state();
    const rest = openInquiries(s)[0] ?? '';
    expect(rest).not.toBe('');
    const { store, q } = mount(s, null);
    q<HTMLButtonElement>('[data-board-open]')?.click();
    const card = q(`[data-inquiry="${rest}"]`);
    expect(card?.querySelector('[data-blocked]')?.textContent).toContain(ja.board.full);
    card?.querySelector<HTMLButtonElement>('[data-accept]')?.click();
    expect(store.state()).toBe(s);
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
    pressMenu(document.body, '[data-team-open]');
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
    pressMenu(document.body, '[data-team-open]');
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
