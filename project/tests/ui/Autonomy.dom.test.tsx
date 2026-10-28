import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore, type GameStore } from '../../src/app/store';
import { getProject } from '../../src/content/index';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import type { AssignModeId } from '../../src/content/types';
import { createInitialState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { createSelection } from '../../src/ui/selection';
import { worldView } from '../../src/view/world';
import { playFor } from '../helpers/play';

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

function mount(projectId: string, setup: (store: GameStore) => void) {
  const store = createGameStore(createInitialState('p12'));
  store.dispatch({ type: 'StartProject', projectId });
  setup(store);
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
  return { store, selection, root };
}

/** cond を満たすまで1分ずつ進める */
function advanceUntil(store: GameStore, cond: () => boolean, limit = 3000) {
  for (let i = 0; i < limit && !cond(); i++) playFor(store, 1);
}

describe('ボトルネックの移動の案内（プレイ画面）', () => {
  it('実装を AI 化するとボトルネックの移動を案内し、工程の時間を比べられ、「見に行く」で島を選ぶ', () => {
    const P = 'saasFeature';
    const modes: Record<string, AssignModeId> = { api: 'aiThenHumanReview', ui: 'aiThenHumanReview' };
    const { store, root, selection } = mount(P, (s) => {
      for (const t of getProject(P).tasks) {
        const mode = modes[t.id] ?? 'human';
        s.dispatch({
          type: 'AssignTask',
          projectId: P,
          taskId: t.id,
          mode,
          workerId: mode === 'human' ? 'sato' : 'agent',
        });
      }
    });
    const guide = () => root.querySelector('[data-bottleneck-guide]');
    advanceUntil(store, () => guide() !== null);
    expect(guide()?.textContent).toContain(ja.bottleneck.moved);

    const compare = [...(guide()?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === ja.bottleneck.compare,
    );
    compare?.click();
    const panel = root.querySelector('[data-stage-panel]');
    expect(panel).not.toBeNull();
    expect(panel?.querySelector('[data-stage-row="api/work"]')?.getAttribute('aria-label')).toContain(
      ja.bottleneck.before,
    );

    const go = [...(guide()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === ja.bottleneck.go);
    go?.click();
    expect(selection.selected()).toMatch(/^(island|human):/);
  });
});

describe('AUTONOMY STREAK のメーター（HUD）', () => {
  it('Hook と Eval で Workflow を回すと、Streak のメーターが節目で燃え上がる', () => {
    const P = 'corporateSite';
    const { store, root } = mount(P, (s) => {
      s.dispatch({
        type: 'AssignWorkflow',
        projectId: P,
        taskIds: getProject(P).tasks.map((t) => t.id),
        workerId: 'agent',
      });
      for (const partId of ['hookUnitTest', 'evalUnitTest', 'evalAcceptance'])
        s.dispatch({ type: 'EquipPart', workerId: 'agent', partId });
    });
    const badge = () => root.querySelector('[data-streak]');
    expect(badge()?.getAttribute('data-streak')).toBe('calm');
    advanceUntil(store, () => badge()?.getAttribute('data-streak') === 'fire', 600);
    expect(badge()?.getAttribute('data-streak')).toBe('fire');
    expect(badge()?.textContent).toContain('STREAK');
  });
});

describe('Harness 由来の事件のトースト', () => {
  it('「Harness を見る」が出て、「解決する」で Subagent が減って事件が消える', () => {
    const P = 'corporateSite';
    const { store, root } = mount(P, (s) => {
      for (const partId of ['subResearch', 'subCode', 'subQa', 'subReview'])
        s.dispatch({ type: 'EquipPart', workerId: 'agent', partId });
    });
    // Subagent を付けすぎた状態で事件が起きている（store の外から事件を置く代わりに、同じ state から作り直す）
    const withIncident = {
      ...store.state(),
      incidents: [
        { id: 'coordinationExplosion' as const, workerId: 'agent', projectId: P, taskId: 'design', since: 0 },
      ],
    };
    dispose();
    root.remove();
    const again = createGameStore(withIncident);
    const root2 = document.createElement('div');
    document.body.append(root2);
    dispose = render(
      () => (
        <PlayScreen
          store={again}
          projectId={P}
          selection={createSelection()}
          vm={() => worldView(again.state(), P, worldLooks[defaultWorldLookId])}
        />
      ),
      root2,
    );
    const toast = root2.querySelector('[data-problem^="incident:coordinationExplosion"]');
    expect(toast?.textContent).toContain(ja.incidents.coordinationExplosion.problem);
    const buttons = [...(toast?.querySelectorAll('button') ?? [])].map((b) => b.textContent);
    expect(buttons).toContain(ja.incidents.viewHarness);
    toast?.querySelector<HTMLButtonElement>('[data-resolve]')?.click();
    expect(again.state().incidents).toEqual([]);
    expect(again.state().harnesses.agent?.parts).toEqual(['subResearch', 'subCode']);
  });
});
