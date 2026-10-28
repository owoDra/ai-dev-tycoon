import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, settings, updateSettings } from '../../src/app/settings';
import { balance } from '../../src/content/balance';
import { catchUp } from '../../src/core/away';
import { step } from '../../src/core/step';
import { ja } from '../../src/i18n/ja';
import { DayBreakCard, RecapCard } from '../../src/ui/play/SessionCards';
import { UnlockCard } from '../../src/ui/play/UnlockCard';
import { SettingsSheet } from '../../src/ui/SettingsSheet';
import { type DaySummary, daySummary, recapView } from '../../src/view/session';
import { campaignInProgress } from '../helpers/session';

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

function mount(view: () => unknown) {
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(view as () => never, root);
  return <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
}

describe('隙間時間のカード', () => {
  it('営業日の終わりの区切り：その日の成果と次にやることを出し、「次の日へ」と「ここで中断する」を選べる', () => {
    const start = campaignInProgress('dom', 1);
    const end = step(start, balance.time.minutesPerDay).state;
    const onNext = vi.fn();
    const onQuit = vi.fn();
    const q = mount(() => <DayBreakCard summary={daySummary(start, end)} onNext={onNext} onQuit={onQuit} />);
    expect(q('[data-session-card="day"] h2')?.textContent).toBe(ja.session.dayEnded(1));
    expect(q('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(q('[data-next-step="assign"]')?.textContent).toBe(ja.session.steps.assign(1));
    expect(q('[data-next-step="assign"] .icon')).not.toBeNull();
    expect(document.activeElement).toBe(q('[data-resume]'));
    q<HTMLButtonElement>('[data-resume]')?.click();
    q<HTMLButtonElement>('[data-quit]')?.click();
    expect(onNext).toHaveBeenCalledOnce();
    expect(onQuit).toHaveBeenCalledOnce();
  });

  it('再開したときのあらすじ：閉じていた間に進んだ時間と完了した仕事を出す', () => {
    const before = campaignInProgress('dom-recap');
    const { state: after, events } = catchUp(before, 24 * 60 * 60);
    const onResume = vi.fn();
    const q = mount(() => <RecapCard recap={recapView(before, after, events)} onResume={onResume} />);
    expect(q('[data-session-card="recap"] h2')?.textContent).toBe(ja.session.recapTitle);
    expect(q('[data-session-card="recap"] p')?.textContent).toBe(
      ja.session.away(ja.screens.result.hours(balance.time.minutesPerDay)),
    );
    expect(q('[data-away]')).not.toBeNull();
    expect(q('[data-active="tutorialLp"]')).not.toBeNull();
    expect(q('[data-quit]')).toBeNull();
    q<HTMLButtonElement>('[data-resume]')?.click();
    expect(onResume).toHaveBeenCalledOnce();
  });

  it('閉じていた間に進めていなければ、そう伝える', () => {
    const s = campaignInProgress('dom-none');
    const q = mount(() => <RecapCard recap={recapView(s, s, [])} onResume={() => {}} />);
    expect(q('[data-session-card="recap"] p')?.textContent).toBe(ja.session.noAway);
    expect(q('[data-away]')).toBeNull();
  });
});

describe('カードから飛ぶ先', () => {
  it('区切りのカード：進行中の案件を開き、納品した案件の振り返りと、引き合いの案件ボードを開ける', () => {
    const summary: DaySummary = {
      day: 3,
      tasksDone: 2,
      delivered: [{ projectId: 'p~1~S', name: '納品した案件' }],
      profit: 0,
      humanMinutes: 0,
      active: [{ projectId: 'p~2~M', name: '進行中の案件', done: 1, total: 4, daysLeft: 2 }],
      next: [{ kind: 'offer', count: 3 }],
      teams: [],
    };
    const links = { onOpen: vi.fn(), onReview: vi.fn(), onBoard: vi.fn() };
    const q = mount(() => <DayBreakCard summary={summary} onNext={() => {}} onQuit={() => {}} links={links} />);
    q<HTMLButtonElement>('[data-active="p~2~M"] [data-session-link="open"]')?.click();
    q<HTMLButtonElement>('[data-delivered-line="p~1~S"] [data-session-link="review"]')?.click();
    q<HTMLButtonElement>('[data-next-step="offer"] [data-session-link="board"]')?.click();
    expect(links.onOpen).toHaveBeenCalledWith('p~2~M');
    expect(links.onReview).toHaveBeenCalledWith('p~1~S');
    expect(links.onBoard).toHaveBeenCalledOnce();
  });

  it('飛ぶ先を渡されていなければ、カードの行にボタンを出さない', () => {
    const before = campaignInProgress('dom-links');
    const q = mount(() => <RecapCard recap={recapView(before, before, [])} onResume={() => {}} />);
    expect(q('[data-active="tutorialLp"]')).not.toBeNull();
    expect(q('[data-session-link]')).toBeNull();
  });

  it('解放のカード：入口のある機能には「開く」を、今は開けない機能には案件を開くと使える旨を添える', () => {
    const opened = vi.fn();
    const onOpen = vi.fn();
    const notes = [
      { text: 'チーム', spot: 'team' as const },
      { text: 'Harness', spot: 'harness' as const },
      { text: '早送り' },
    ];
    const q = mount(() => (
      <UnlockCard
        notes={notes}
        opener={(spot) => (spot === 'team' ? opened : null)}
        onOpen={onOpen}
        onClose={() => {}}
      />
    ));
    q<HTMLButtonElement>('[data-unlock-open="team"]')?.click();
    expect(opened).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith(notes[0]);
    expect(q('[data-unlock-open="harness"]')).toBeNull();
    expect(q('[data-unlock-note="harness"]')?.textContent).toContain(ja.unlocks.needsProject);
    expect(q('[data-unlock-note=""]')?.querySelector('button')).toBeNull();
  });
});

describe('遊び方の設定', () => {
  afterEach(() => updateSettings({ dayBreak: false, awayProgress: true }));

  it('既定では閉じている間の進行が有効で、1日が約1分と短いので毎日の区切りは無効。設定シートで切り替えて保存できる', () => {
    expect(loadSettings({ getItem: () => null })).toMatchObject({ dayBreak: false, awayProgress: true });
    expect(loadSettings({ getItem: () => '{"dayBreak":true,"awayProgress":"no"}' })).toMatchObject({
      dayBreak: true,
      awayProgress: true,
    });
    const q = mount(() => <SettingsSheet onClose={() => {}} />);
    const box = q<HTMLInputElement>('[data-setting="dayBreak"]');
    expect(box?.checked).toBe(false);
    box?.click();
    expect(settings().dayBreak).toBe(true);
    expect(loadSettings(localStorage).dayBreak).toBe(true);
    q<HTMLInputElement>('[data-setting="awayProgress"]')?.click();
    expect(settings().awayProgress).toBe(false);
  });

  it('タイトルへ戻る入口は設定シート（会社を遊んでいる間だけ）。押すとシートを閉じてタイトルへ', () => {
    const calls: string[] = [];
    const q = mount(() => <SettingsSheet onClose={() => calls.push('close')} onTitle={() => calls.push('title')} />);
    q<HTMLButtonElement>('[data-settings-title]')?.click();
    expect(calls).toEqual(['close', 'title']);
  });

  it('タイトル画面などで開いた設定シートには「タイトルへ」を出さない', () => {
    const q = mount(() => <SettingsSheet onClose={() => {}} />);
    expect(q('[data-settings-title]')).toBeNull();
  });
});
