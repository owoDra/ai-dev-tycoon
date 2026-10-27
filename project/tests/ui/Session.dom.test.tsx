import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, settings, updateSettings } from '../../src/app/settings';
import { balance } from '../../src/content/balance';
import { catchUp } from '../../src/core/away';
import { step } from '../../src/core/step';
import { ja } from '../../src/i18n/ja';
import { DayBreakCard, RecapCard } from '../../src/ui/play/SessionCards';
import { SettingsSheet } from '../../src/ui/SettingsSheet';
import { daySummary, recapView } from '../../src/view/session';
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
    const end = step(start, balance.project.minutesPerBusinessDay).state;
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
      ja.session.away(ja.screens.result.hours(balance.project.minutesPerBusinessDay)),
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

describe('遊び方の設定', () => {
  afterEach(() => updateSettings({ dayBreak: true, awayProgress: true }));

  it('既定では区切りと閉じている間の進行が有効で、設定シートで切り替えて保存できる', () => {
    expect(loadSettings({ getItem: () => null })).toMatchObject({ dayBreak: true, awayProgress: true });
    expect(loadSettings({ getItem: () => '{"dayBreak":false,"awayProgress":"no"}' })).toMatchObject({
      dayBreak: false,
      awayProgress: true,
    });
    const q = mount(() => <SettingsSheet onClose={() => {}} />);
    const box = q<HTMLInputElement>('[data-setting="dayBreak"]');
    expect(box?.checked).toBe(true);
    box?.click();
    expect(settings().dayBreak).toBe(false);
    expect(loadSettings(localStorage).dayBreak).toBe(false);
    q<HTMLInputElement>('[data-setting="awayProgress"]')?.click();
    expect(settings().awayProgress).toBe(false);
  });
});
