import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { harnessOf } from '../../src/core/harness';
import { createInitialState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { createSelection } from '../../src/ui/selection';
import { worldView } from '../../src/view/world';

const P = 'corporateSite';
const AGENT = 'agent';
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

function mount(options: { tutorial?: boolean } = {}) {
  const store = createGameStore(createInitialState('harness-ui', options));
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
        vm={() => worldView(store.state(), P, worldLooks[defaultWorldLookId])}
      />
    ),
    root,
  );
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  return { store, root, q, selection };
}

describe('Harness Builder の UI（企画書35章・48章）', () => {
  it('ドックから開くと作業の流れの道（地点のスロット・盾・鍵）が並び、押すと選択肢のパネルになる', () => {
    const { q, root } = mount();
    q<HTMLButtonElement>('[data-harness-open]')?.click();
    const rows = [...root.querySelectorAll<HTMLElement>('[data-harness-row]')].map((r) => r.dataset.harnessRow);
    expect(rows).toEqual([
      'model',
      'hook:SessionStart',
      'receive',
      'receive',
      'skill',
      'hook:PreToolUse',
      'tools',
      'split',
      'hook:PostToolUse',
      'validation',
      'hook:Stop',
      'mod',
      'permissions',
      'routine',
    ]);
    q<HTMLButtonElement>('[data-harness-row="hook:PostToolUse"]')?.click();
    expect(q('[data-harness-card]')).toBeNull();
    expect(q('[data-harness-option="hookUnitTest"]')?.textContent).toContain(ja.harness.ruleHook);
    expect(q('[data-harness-option="requestUnitTest"]')?.textContent).toContain(ja.harness.ruleRequest);
    q<HTMLButtonElement>('[data-harness-back]')?.click();
    expect(q('[data-harness-card]')).not.toBeNull();
  });

  it('選択肢にフォーカスするたびに Before → After の予測が即座に出て、押すと部品を付け外しできる', () => {
    const { store, q, root } = mount();
    q<HTMLButtonElement>('[data-harness-open]')?.click();
    q<HTMLButtonElement>('[data-harness-row="skill"]')?.click();
    expect(q('[data-harness-preview]')).toBeNull();
    const skill = q<HTMLButtonElement>('[data-harness-option="skillFrontend"]');
    skill?.dispatchEvent(new FocusEvent('focus'));
    const preview = q('[data-harness-preview]');
    expect(preview?.textContent).toContain('Frontend Change');
    // 人間時間・AIコスト・品質・自律時間の4つ。Skill で人間時間は減る
    expect([...root.querySelectorAll<HTMLElement>('[data-metric]')].map((m) => m.dataset.metric)).toEqual([
      'humanMinutes',
      'aiCost',
      'quality',
      'autonomyMinutes',
    ]);
    expect(q('[data-metric="humanMinutes"] [data-dir]')?.dataset.dir).toBe('better');

    // 別の選択肢にフォーカスすると予測が替わる
    q<HTMLButtonElement>('[data-harness-option="skillReport"]')?.dispatchEvent(new FocusEvent('focus'));
    expect(q('[data-harness-preview]')?.textContent).toContain('Report');

    skill?.click();
    expect(harnessOf(store.state(), AGENT).parts).toEqual(['skillFrontend']);
    expect(root.textContent).toContain(ja.notices.equipped('Frontend Change'));
    expect(q('[data-harness-option="skillFrontend"]')?.getAttribute('aria-pressed')).toBe('true');
    q<HTMLButtonElement>('[data-harness-option="skillFrontend"]')?.click();
    expect(harnessOf(store.state(), AGENT).parts).toEqual([]);
  });

  it('Model を選べ、補正の内部値は「詳しく見る」の中にだけ出す', () => {
    const { store, q } = mount();
    q<HTMLButtonElement>('[data-harness-open]')?.click();
    q<HTMLButtonElement>('[data-harness-row="model"]')?.click();
    q<HTMLButtonElement>('[data-harness-option="frontier"]')?.click();
    expect(harnessOf(store.state(), AGENT).modelId).toBe('frontier');
    q<HTMLButtonElement>('[data-harness-back]')?.click();
    q<HTMLButtonElement>('[data-harness-row="tools"]')?.click();
    const details = q<HTMLDetailsElement>('[data-harness-details]');
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain(ja.harness.modifierNames.risk);
  });

  it('チュートリアルの最初は Harness Builder を出さない（解放されてから）', () => {
    const { q } = mount({ tutorial: true });
    expect(q('[data-harness-open]')).toBeNull();
  });

  it('島の詳細から「ここから先を Workflow にまとめる」と、後続の Task をまとめて AI に任せる', () => {
    const { store, q, selection } = mount();
    selection.dispatch({ type: 'SelectEntity', entityId: 'island:frontend' });
    q<HTMLButtonElement>('[data-workflow]')?.click();
    const tasks = store.state().projects[P]?.tasks;
    for (const id of ['frontend', 'a11y', 'release']) expect(tasks?.[id]?.assignment?.mode).toBe('agentWorkflow');
    expect(tasks?.hearing?.assignment).toBeNull();
  });
});
