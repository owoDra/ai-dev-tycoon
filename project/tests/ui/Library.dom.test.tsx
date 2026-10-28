import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { harnessOf } from '../../src/core/harness';
import { encodeWorkflowCode } from '../../src/core/library';
import { createInitialState, type GameState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { createSelection } from '../../src/ui/selection';
import { hudView } from '../../src/view/hud';
import { recommendWorkflows } from '../../src/view/library';
import { islandId, worldView } from '../../src/view/world';
import { sampleWorkflows } from '../helpers/workflows';

const AGENT = 'agent';
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

function mount(projectId: string, initial: GameState = createInitialState('library-ui')) {
  const store = createGameStore(initial);
  store.dispatch({ type: 'StartProject', projectId });
  const selection = createSelection();
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(
    () => (
      <PlayScreen
        store={store}
        projectId={projectId}
        selection={selection}
        vm={() => worldView(store.state(), projectId, worldLooks[defaultWorldLookId])}
      />
    ),
    root,
  );
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  return { store, root, q, selection };
}

/** 棚に Workflow を保存済みの会社（custom1 から順に、helpers/workflows.ts の並び） */
function withShelf(keys: readonly (keyof typeof sampleWorkflows)[]): GameState {
  const base = createInitialState('library-ui');
  return { ...base, library: keys.map((k, i) => ({ id: `custom${i + 1}`, ...sampleWorkflows[k] })) };
}

const input = (el: HTMLInputElement | null, value: string) => {
  if (!el) throw new Error('入力欄がない');
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('Workflow Library の UI（企画書25章）', () => {
  it('Harness Builder から名前を付けて保存すると、棚に並び、ワールドのバインダーが1冊増える', () => {
    const { store, q } = mount('corporateSite');
    store.dispatch({ type: 'EquipPart', workerId: AGENT, partId: 'skillFrontend' });
    const before = worldView(store.state(), 'corporateSite', worldLooks[defaultWorldLookId]).binders;
    q<HTMLButtonElement>('[data-harness-open]')?.click();
    q<HTMLButtonElement>('[data-save-workflow]')?.click();
    input(q<HTMLInputElement>('[data-workflow-name]'), 'うちのサイト実装');
    q<HTMLFormElement>('[data-save-workflow-form]')?.requestSubmit();
    expect(store.state().library).toEqual([
      expect.objectContaining({ id: 'custom1', name: 'うちのサイト実装', parts: ['skillFrontend'] }),
    ]);
    expect(worldView(store.state(), 'corporateSite', worldLooks[defaultWorldLookId]).binders).toBe(before + 1);
    // Harness のシートのタブから棚を開くと、保存した Workflow が並ぶ（使い方の3ステップも出る）
    q<HTMLButtonElement>('[data-ai-tab="library"]')?.click();
    expect(q('[data-library-howto]')?.querySelectorAll('li')).toHaveLength(ja.library.howToSteps.length);
    expect(q('[data-workflow-card="custom1"]')?.textContent).toContain('うちのサイト実装');
    // 同梱の Workflow はなく、棚に並ぶのは自分で保存したものだけ
    expect(q('[data-library-sheet]')?.querySelectorAll('[data-workflow-card]')).toHaveLength(1);
  });

  it('Agent Workflow と Harness を解放するまでは、Task の詳細に Workflow のボタンも Library の入口も出さない', () => {
    const base = createInitialState('library-locked');
    const locked = {
      ...base,
      unlocked: base.unlocked.filter((f) => f !== 'mode:agentWorkflow' && f !== 'harness'),
    };
    const { q, selection } = mount('paymentFix', locked);
    selection.dispatch({ type: 'SelectEntity', entityId: islandId('reproduce') });
    expect(q('[data-workflow]')).toBeNull();
    expect(q('[data-workflow-picks]')).toBeNull();
    dispose();
    document.body.innerHTML = '';
    // 解放済みなら出る
    const open = mount('paymentFix');
    open.selection.dispatch({ type: 'SelectEntity', entityId: islandId('reproduce') });
    expect(open.q('[data-workflow]')).not.toBeNull();
    expect(open.q('[data-workflow-picks]')).not.toBeNull();
  });

  it('何も保存していない会社では棚が空で、Task の詳細にもおすすめの Workflow を出さない', () => {
    const { q, selection } = mount('paymentFix');
    selection.dispatch({ type: 'SelectEntity', entityId: islandId('fix') });
    expect(q('[data-workflow-picks] [data-workflow-pick]')).toBeNull();
    q<HTMLButtonElement>('[data-library-open]')?.click();
    expect(q('[data-library-sheet]')?.querySelectorAll('[data-workflow-card]')).toHaveLength(0);
    expect(q('[data-library-sheet]')?.textContent).toContain(ja.library.empty);
  });

  it('Task の詳細から Workflow を適用すると、Before → After を見てから構成と担当がまとめて決まる', () => {
    const { store, q, selection } = mount('paymentFix', withShelf(['prReview']));
    selection.dispatch({ type: 'SelectEntity', entityId: islandId('fix') });
    q<HTMLButtonElement>('[data-library-open]')?.click();
    expect(q('[data-library-sheet]')).not.toBeNull();
    const apply = q<HTMLButtonElement>('[data-apply-workflow="custom1"]');
    apply?.dispatchEvent(new FocusEvent('focus'));
    expect(q('[data-harness-preview]')?.textContent).toContain(sampleWorkflows.prReview.name);
    apply?.click();
    expect(store.state().projects.paymentFix?.tasks.fix?.assignment).toEqual({
      mode: 'aiThenHumanReview',
      workerId: AGENT,
    });
    expect(harnessOf(store.state(), AGENT).parts).toContain('skillPrReview');
    expect(q('[data-library-sheet]')).toBeNull();
  });

  it('Task の詳細に、Workflow を見込み利益の差の大きい順に出し、押すとそのまま適用する', () => {
    const { store, q, selection } = mount(
      'paymentFix',
      withShelf(['prReview', 'weeklyReport', 'frontend', 'safeRelease']),
    );
    selection.dispatch({ type: 'SelectEntity', entityId: islandId('fix') });
    const picks = [...(q('[data-workflow-picks]')?.querySelectorAll<HTMLButtonElement>('[data-workflow-pick]') ?? [])];
    const expected = recommendWorkflows(
      store.state(),
      { projectId: 'paymentFix', taskId: 'fix', workerId: AGENT },
      picks.length,
    );
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.map((p) => p.dataset.workflowPick)).toEqual(expected.map((p) => p.id));
    const before = hudView(store.state(), 'paymentFix')?.projectedProfit ?? 0;
    picks[0]?.click();
    expect(store.state().libraryUses.map((u) => u.workflowId)).toEqual([expected[0]?.id]);
    expect(hudView(store.state(), 'paymentFix')?.projectedProfit).toBeCloseTo(
      before + (expected[0]?.profitDelta ?? NaN),
    );
  });

  it('共有コードを読み込むと、未解放の部品を警告してからライブラリに追加できる。壊れたコードは拒む', () => {
    const base = createInitialState('library-import');
    const state = { ...base, unlocked: base.unlocked.filter((f) => f !== 'harness:subagent') };
    const { store, q } = mount('paymentFix', state);
    q<HTMLButtonElement>('[data-harness-open]')?.click();
    q<HTMLButtonElement>('[data-ai-tab="library"]')?.click();
    const code = encodeWorkflowCode({
      name: '他チームの構成',
      mode: 'aiThenEval',
      modelId: 'lite',
      context: 'needed',
      parts: ['mcpGit', 'subQa'],
    });
    input(q<HTMLInputElement>('[data-import-code]'), 'ZZZZ-ZZZZ');
    q<HTMLFormElement>('[data-import-workflow]')?.requestSubmit();
    expect(q('[data-import-error]')).not.toBeNull();
    input(q<HTMLInputElement>('[data-import-code]'), code);
    q<HTMLFormElement>('[data-import-workflow]')?.requestSubmit();
    expect(q('[data-import-preview] [data-locked-warning]')?.textContent).toContain('QA');
    q<HTMLButtonElement>('[data-import-add]')?.click();
    expect(store.state().library.map((w) => w.name)).toEqual(['他チームの構成']);
  });
});
