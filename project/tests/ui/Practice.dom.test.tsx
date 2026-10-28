import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPracticeJob } from '../../src/app/practiceStore';
import { ja } from '../../src/i18n/ja';
import { PracticeScreen } from '../../src/ui/practice/PracticeScreen';

let dispose = () => {};
let copied = '';
beforeEach(() => {
  localStorage.clear();
  copied = '';
  vi.stubGlobal('navigator', {
    ...navigator,
    clipboard: {
      writeText: async (s: string) => {
        copied = s;
      },
    },
  });
});
afterEach(() => {
  dispose();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function mount() {
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(() => <PracticeScreen onBack={() => {}} />, root);
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  return { root, q };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('実務モードの UI（企画書24章）', () => {
  it('テンプレートを開き、改善を設計して ROI を確認し、結果をコピーできる', async () => {
    const { q } = mount();
    q<HTMLButtonElement>('[data-practice-blank]')?.click();
    expect(q('[data-practice-step="0"]')).toBeNull();
    q<HTMLButtonElement>('[data-practice-template="weeklyAnalytics"]')?.click();
    expect(q('[data-headline]')?.textContent).toBe('2.0h → 0.3h');
    expect(q('[data-reduction]')?.textContent).toBe('−88%');
    expect(q('[data-stat="roi"]')?.textContent).toContain('386%');

    // 最後の工程（承認）を AI → 人間レビューに変え、Harness Builder で Eval を付ける
    const mode = q<HTMLSelectElement>('[data-practice-step="3"] [data-step-mode]');
    if (!mode) throw new Error('担当の選択がない');
    mode.value = 'aiThenHumanReview';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    q<HTMLButtonElement>('[data-practice-step="3"] [data-step-harness]')?.click();
    expect(q('[data-harness-sheet]')?.textContent).toContain(ja.practice.steps.harness);
    q<HTMLButtonElement>('[data-harness-row="validation"]')?.click();
    const evalOption = q<HTMLButtonElement>('[data-harness-option="evalAcceptance"]');
    evalOption?.dispatchEvent(new FocusEvent('focus'));
    expect(q('[data-harness-preview]')).not.toBeNull();
    evalOption?.click();
    expect(loadPracticeJob()?.steps[3]).toMatchObject({ mode: 'aiThenHumanReview', parts: ['evalAcceptance'] });
    expect(q('[data-headline]')?.textContent).not.toBe('2.0h → 0.3h');

    q<HTMLButtonElement>('[data-copy-button="markdown"] button')?.click();
    await flush();
    expect(copied).toContain('## 週次アクセス解析 の改善試算');
    expect(copied).toContain('ROI：');
    q<HTMLButtonElement>('[data-copy-button="text"] button')?.click();
    await flush();
    expect(copied.split('\n')[1]).toMatch(/^・人間時間：2\.0h → /);
  });

  it('工程を追加・削除でき、入力は localStorage に残る（読めなければテンプレートから）', () => {
    const { q, root } = mount();
    expect(q('[data-practice-step="3"]')).not.toBeNull();
    q<HTMLButtonElement>('[data-practice-add]')?.click();
    expect(root.querySelectorAll('[data-practice-step]').length).toBe(5);
    q<HTMLButtonElement>('[data-practice-step="4"] [data-step-remove]')?.click();
    expect(root.querySelectorAll('[data-practice-step]').length).toBe(4);
    for (let i = 0; i < 10; i++) q<HTMLButtonElement>('[data-practice-add]')?.click();
    expect(root.querySelectorAll('[data-practice-step]').length).toBe(8);
    expect(loadPracticeJob()?.steps).toHaveLength(8);
    dispose();
    localStorage.setItem('ai-dev-tycoon.practice.v1', '{broken');
    const again = mount();
    expect(again.root.querySelectorAll('[data-practice-step]').length).toBe(4);
  });

  it('工程ごとに内訳のバーと「なぜこの数字？」を出し、前提の年の回数をその場で変えられる（Phase 27）', () => {
    const { q, root } = mount();
    q<HTMLButtonElement>('[data-practice-template="weeklyAnalytics"]')?.click();
    const fetch = q('[data-practice-step="0"]');
    expect(fetch?.querySelector('[data-breakdown="human"] [data-segment="instruct"]')?.textContent).toContain(
      '指示 1.0分',
    );
    expect(fetch?.querySelector('[data-breakdown="ai"] [data-segment="aiWork"]')?.textContent).toContain('作業 0.8分');
    expect(fetch?.querySelector('[data-step-success]')?.textContent).toBe('AI 適性「高い（定型）」→ 1回で成功 85%');
    expect(fetch?.querySelector('[data-step-quality]')?.textContent).toBe('レビューなし → 見逃し 15% → 品質 93%');
    expect(fetch?.querySelector('[data-step-why] summary')?.textContent).toBe(ja.practice.explain.why);
    expect(fetch?.querySelector('[data-step-why] li')?.textContent).toBe(
      '人間の時間 = 指示（20分 × 5% = 1.0分） = 1.0分',
    );
    // 人間だけの工程には AI のバーを出さない
    expect(q('[data-practice-step="3"] [data-breakdown="ai"]')).toBeNull();
    expect(root.querySelector('[data-stat="saved-yen"]')?.textContent).toContain('364,000円');
    expect(root.querySelector('[data-stat="roi"]')?.textContent).toContain('(364,000円 − ');

    const runs = q<HTMLInputElement>('[data-practice-premise] [data-number="runs"]');
    if (!runs) throw new Error('年の回数の入力がない');
    expect(runs.value).toBe('52');
    runs.value = '48';
    runs.dispatchEvent(new Event('input', { bubbles: true }));
    expect(q('[data-stat="saved"]')?.textContent).toContain('84.0h');
    expect(loadPracticeJob()?.runsPerYear).toBe(48);
    // 頻度を選び直すと既定の回数に戻る
    q<HTMLButtonElement>('[data-practice-frequency="weekly"]')?.click();
    expect(q('[data-stat="saved"]')?.textContent).toContain('91.0h');

    // 実務モードの Harness の見込みは、業務1回分の見出しにする
    q<HTMLButtonElement>('[data-practice-step="2"] [data-step-harness]')?.click();
    q<HTMLButtonElement>('[data-harness-row="validation"]')?.click();
    q<HTMLButtonElement>('[data-harness-option="evalAcceptance"]')?.dispatchEvent(new FocusEvent('focus'));
    expect(q('[data-harness-preview] h3')?.textContent).toContain(ja.practice.steps.preview);
  });
});
