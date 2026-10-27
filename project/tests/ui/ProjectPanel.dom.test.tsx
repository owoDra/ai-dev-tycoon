import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { createInitialState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { ProjectPanel } from '../../src/ui/ProjectPanel';

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

function mount() {
  const store = createGameStore(createInitialState('ui'));
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(() => <ProjectPanel store={store} projectId="ecRenewal" />, root);
  return { store, root };
}

const button = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
const select = (root: HTMLElement, label: string) =>
  root.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);

describe('ProjectPanel（仮 UI）', () => {
  it('案件を開始すると Task の一覧とスコアが表示される', () => {
    const { root } = mount();
    expect(root.querySelector('table')).toBeNull();
    button(root, ja.project.start)?.click();
    const names = [...root.querySelectorAll('tbody tr td:first-child')].map((td) => td.textContent);
    expect(names).toEqual(Object.values(ja.tasks.ecRenewal));
    expect(root.textContent).toContain(ja.score.profitPerPersonDay);
    expect(root.textContent).toContain(ja.project.status.unassigned);
  });

  it('担当を選ぶと AssignTask が適用され、時間が進むと状態とスコアが変わる', () => {
    const { store, root } = mount();
    button(root, ja.project.start)?.click();
    const hearing = ja.tasks.ecRenewal.hearing;
    const mode = select(root, `${hearing} ${ja.project.mode}`);
    if (!mode) throw new Error('担当の選択肢がない');
    mode.value = 'human';
    mode.dispatchEvent(new Event('change'));
    expect(store.state().projects.ecRenewal?.tasks.hearing?.assignment).toEqual({ mode: 'human', workerId: 'sato' });

    const worker = select(root, `${hearing} ${ja.project.worker}`);
    if (!worker) throw new Error('担当者の選択肢がない');
    worker.value = 'suzuki';
    worker.dispatchEvent(new Event('change'));
    expect(store.state().projects.ecRenewal?.tasks.hearing?.assignment?.workerId).toBe('suzuki');

    store.advance(30);
    expect(root.textContent).toContain(ja.project.status.running);
    expect(select(root, `${hearing} ${ja.project.mode}`)?.disabled).toBe(true);
    expect(root.textContent).toContain(ja.score.minutes(30));
  });
});
