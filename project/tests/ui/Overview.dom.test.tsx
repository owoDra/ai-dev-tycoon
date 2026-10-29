import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { defaultWorldLookId, worldLooks } from '../../src/content/look/world';
import { createInitialState, createProjectRun } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { PlayScreen } from '../../src/ui/play/PlayScreen';
import { createSelection } from '../../src/ui/selection';
import { worldView } from '../../src/view/world';
import { pressMenu } from '../helpers/menu';

const P = 'ecRenewal';
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

/** 案件ボードのある会社（チュートリアルの後）で、案件を1つ進めているプレイ画面 */
function mount() {
  const company = createInitialState('overview-ui', { board: true, tutorial: false });
  const store = createGameStore({ ...company, projects: { [P]: createProjectRun(P, 0) } });
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(
    () => (
      <PlayScreen
        store={store}
        projectId={P}
        selection={createSelection()}
        vm={() => worldView(store.state(), P, worldLooks[defaultWorldLookId])}
      />
    ),
    root,
  );
  const q = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s);
  return { store, root, q };
}

describe('進み具合の一覧（案件のガントチャートと社員の勤務状態）', () => {
  it('メニューから開くと、案件の行と状態のラベルを出し、行を押すと工程を出す', () => {
    const { q, root } = mount();
    pressMenu(document.body, '[data-menu-overview]');
    expect(q('[data-overview-sheet]')).not.toBeNull();
    const row = q('[data-gantt="running"]');
    expect(row?.textContent).toContain(ja.overview.state.running);
    expect(root.querySelectorAll('[data-gantt-task]')).toHaveLength(0);
    row?.querySelector('button')?.click();
    expect(root.querySelectorAll('[data-gantt-task]').length).toBeGreaterThan(0);
  });

  it('社員のタブで、全員の勤務状態をアイコンとラベルで出す', () => {
    const { q, root } = mount();
    pressMenu(document.body, '[data-menu-overview]');
    q('[data-overview-tab="staff"]')?.click();
    const rows = root.querySelectorAll('[data-staff]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain(ja.overview.staffStatus.idle);
  });

  it('打ち切りは確認してから CancelProject を出す（やめれば何もしない）', () => {
    const { q, store } = mount();
    pressMenu(document.body, '[data-menu-overview]');
    q('[data-gantt="running"] button')?.click();
    q('[data-cancel-project]')?.click();
    expect(store.state().projects[P]?.cancelled).toBeNull();
    q('[data-cancel-confirm]')?.click();
    expect(store.state().projects[P]?.cancelled).toBe('cancelled');
  });
});
