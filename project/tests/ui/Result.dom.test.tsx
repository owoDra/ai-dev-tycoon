import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { decodeResultCode } from '../../src/core/resultCode';
import { ja } from '../../src/i18n/ja';
import { ResultScreen } from '../../src/ui/screens/ResultScreen';
import type { WorkflowSnapshot } from '../../src/view/result';
import { playConfigured } from '../helpers/configured';

const P = 'corporateSite';
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function mount() {
  vi.useFakeTimers();
  const { state } = playConfigured({ projectId: P, mode: 'aiThenHumanReview', parts: ['evalAcceptance'] }, 'result-ui');
  const root = document.createElement('div');
  document.body.append(root);
  const saved: WorkflowSnapshot[] = [];
  dispose = render(
    () => (
      <ResultScreen
        store={createGameStore(state)}
        projectId={P}
        onTitle={() => {}}
        onNext={() => {}}
        onSaveWorkflow={(s) => saved.push(s)}
      />
    ),
    root,
  );
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  return { root, q, saved };
}

describe('結果画面', () => {
  it('第1段（トロフィー・Profit / Human Hour・ランク・伸び）から始まり、各段が段階的に開示される', () => {
    const { q } = mount();
    expect(q('[data-stage="1"]')).not.toBeNull();
    expect(q('[data-stage="1"] [role="img"]')?.getAttribute('aria-label')).toBe(ja.screens.result.trophy);
    expect(q('[data-rank]')?.dataset.rank).toMatch(/^[SABC]$/);
    expect(q('[data-baseline]')?.textContent).toMatch(/[+−]\d+%/);
    expect(q('[data-stage="2"]')).toBeNull();
    expect(q('[data-stage="3"]')).toBeNull();

    vi.runOnlyPendingTimers();
    expect(q('[data-stage="2"]')).not.toBeNull();
    expect(q('[data-metric="humanTime"]')).not.toBeNull();
    expect(q('[data-metric="aiCost"]')).not.toBeNull();
    expect(q('[data-metric="quality"]')).not.toBeNull();
    expect(q('[data-stage="3"]')).toBeNull();

    q<HTMLButtonElement>('[data-more]')?.click();
    expect(q('[data-card="best"]')?.textContent).toContain(ja.screens.result.cards.best);
    expect(q('[data-card="waste"]')).not.toBeNull();
    expect(q('[data-card="next"]')).not.toBeNull();
    expect(q('[data-stage="4"]')).toBeNull();

    q<HTMLButtonElement>('[data-advanced]')?.click();
    expect(q('[data-stage="4"]')?.textContent).toContain(ja.screens.result.stagesTitle);
  });

  it('「それが無かった場合」の再シミュレーションを分割して実行し、終わったら確認済みになる', () => {
    const { q } = mount();
    vi.runOnlyPendingTimers();
    q<HTMLButtonElement>('[data-more]')?.click();
    expect(q('[data-refining]')?.dataset.refining).toBe('true');
    vi.runAllTimers();
    expect(q('[data-refining]')?.dataset.refining).toBe('false');
    expect(q('[data-card="best"]')?.textContent).toMatch(/削減|節約/);
  });

  it('第2段から結果コードを出し、コピーボタンでクリップボードに書き、QR コードを開ける', async () => {
    const writeText = vi.fn(async (_: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { q } = mount();
    expect(q('[data-result-code]')).toBeNull();
    vi.runOnlyPendingTimers();
    const code = q('[data-code]')?.textContent ?? '';
    expect(decodeResultCode(code)).toMatchObject({ ok: true, record: { projectId: P, seed: 'result-ui' } });

    q<HTMLButtonElement>('[data-copy]')?.click();
    await vi.waitFor(() => expect(q('[data-copy-state]')?.dataset.copyState).toBe('copied'));
    expect(writeText).toHaveBeenCalledWith(code);
    expect(q('[data-copy]')?.textContent).toContain(ja.screens.result.code.copied);

    expect(q('[data-qr]')).toBeNull();
    q<HTMLButtonElement>('[data-show-qr]')?.click();
    expect(q('[data-qr]')?.getAttribute('aria-label')).toBe(ja.screens.result.code.qrLabel);
    expect(q('[data-qr] path')?.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/);
    vi.unstubAllGlobals();
  });

  it('クリップボードが使えなければ、コードを選択して手でコピーするよう案内する', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    const { q } = mount();
    vi.runOnlyPendingTimers();
    q<HTMLButtonElement>('[data-copy]')?.click();
    await vi.waitFor(() => expect(q('[data-copy-state]')?.dataset.copyState).toBe('failed'));
    expect(q('[data-copy-state]')?.textContent).toBe(ja.screens.result.code.copyFailed);
    vi.unstubAllGlobals();
  });

  it('「この構成を保存する」で、担当と Harness をデータとして書き出す', () => {
    const { q, saved } = mount();
    q<HTMLButtonElement>('[data-save-workflow]')?.click();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.projectId).toBe(P);
    expect(saved[0]?.workers[0]?.parts).toEqual(['evalAcceptance']);
    expect(saved[0]?.assignments.every((a) => a.mode === 'aiThenHumanReview')).toBe(true);
    expect(q('[data-save-workflow]')?.textContent).toContain(ja.screens.result.savedWorkflow);
  });
});
