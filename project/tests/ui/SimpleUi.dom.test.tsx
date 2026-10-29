import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore } from '../../src/app/store';
import { postInquiries } from '../../src/core/board';
import { reduce } from '../../src/core/commands';
import { createInitialState, type GameState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { TodoPanel } from '../../src/ui/company/TodoPanel';
import { AssignCards } from '../../src/ui/play/AssignCards';
import { NoticeHost } from '../../src/ui/play/NoticeHost';
import { PlayControls } from '../../src/ui/play/PlayControls';
import { taskRows } from '../../src/view/project';

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

function mount(view: () => unknown) {
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(view as () => never, root);
  return root;
}

/** チュートリアルを終えた会社（引き合いが届いている） */
const company = (): GameState =>
  postInquiries(createInitialState('simple-ui', { board: true, tutorial: false }), () => {});

describe('画面をシンプルにする（Phase 41）', () => {
  it('ホームの「今日やること」は受注を先に出し、押すと案件ボードを開く。最後に次の目標とその伸ばし方を添える', () => {
    const opened: string[] = [];
    const root = mount(() => <TodoPanel store={createGameStore(company())} onBoard={() => opened.push('board')} />);
    expect(root.querySelector('[data-todo]')?.textContent).toContain(ja.todo.title);
    root.querySelector<HTMLButtonElement>('[data-todo-item="order"] button')?.click();
    expect(opened).toEqual(['board']);
    expect(root.querySelector('[data-todo-item="goal"]')?.textContent).toContain(ja.todo.goalHint.delivered);
  });

  it('担当カードに速さ・品質・人の手間の3本のバーを出し、Harness の解放まではおすすめを1枚に付ける', () => {
    const base = company();
    const id = Object.keys(base.projects)[0] ?? base.board?.inquiries[0]?.projectId ?? '';
    const s = reduce(base, { type: 'AcceptOrder', projectId: id }).state;
    const row = taskRows(s, id).find((r) => r.editable);
    if (!row) throw new Error('担当を決められる Task がない');
    const cards = (state: GameState) =>
      mount(() => (
        <AssignCards store={createGameStore(state)} projectId={id} row={row} scroll={false} onAssign={() => {}} />
      ));
    // チュートリアルなしで始めた会社はすべて解放済みなので、Harness の解放前を作る
    const root = cards({ ...s, unlocked: s.unlocked.filter((f) => f !== 'harness') });
    const bars = root.querySelectorAll('[data-mode-bars]');
    expect(bars.length).toBe(root.querySelectorAll('[data-mode]').length);
    expect(bars[0]?.textContent).toContain(ja.assign.bars.effort);
    expect(root.querySelectorAll('[data-recommended]').length).toBe(1);
    dispose();
    const later = cards(s);
    expect(later.querySelector('[data-recommended]')).toBeNull();
  });

  it('メニューは「会社」と「AI の仕組み」にまとめ、2つ以上ある方は押すと一覧を開く。1つだけならそのまま出す', () => {
    const opened: string[] = [];
    const root = mount(() => (
      <PlayControls
        store={createGameStore(company())}
        compact={false}
        onBoard={() => opened.push('board')}
        onOverview={() => opened.push('overview')}
        onHarness={() => opened.push('harness')}
      />
    ));
    expect(root.querySelector('[data-menu-board]')).toBeNull();
    root.querySelector<HTMLButtonElement>('[data-menu-group-toggle="company"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-menu-overview]')?.click();
    expect(opened).toEqual(['overview']);
    // 選ぶと一覧を閉じる
    expect(root.querySelector('[data-menu-group-items]')).toBeNull();
    // AI の仕組みは Harness だけなので、まとめずにそのまま出す
    expect(root.querySelector('[data-menu-group-toggle="ai"]')).toBeNull();
    root.querySelector<HTMLButtonElement>('[data-harness-open]')?.click();
    expect(opened).toEqual(['overview', 'harness']);
  });

  it('記録はトーストに出さず「記録」にまとめ、まだ見ていない数を出し、押すと一覧を開く', () => {
    const record = { id: 1, text: '作業が終わった', icon: 'success' as const, level: 'record' as const };
    let read = false;
    const root = mount(() => <NoticeHost notices={[]} records={[record]} unread={1} onReadAll={() => (read = true)} />);
    const toggle = root.querySelector<HTMLButtonElement>('[data-records-toggle]');
    expect(toggle?.textContent).toContain(ja.notices.records);
    expect(toggle?.textContent).toContain('1');
    expect(root.querySelector('[data-records]')).toBeNull();
    toggle?.click();
    expect(root.querySelector('[data-records]')?.textContent).toContain('作業が終わった');
    expect(read).toBe(true);
  });
});
