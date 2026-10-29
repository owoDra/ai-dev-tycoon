import { createMemo, For, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import type { IconName } from '../../assets/icons';
import { ja } from '../../i18n/ja';
import { type TodoItem, todoList } from '../../view/todo';
import { Icon } from '../Icon';
import { panel } from '../parts';

const t = ja.todo;
type GoalItem = Extract<TodoItem, { id: 'goal' }>;
/** 「次の目標」より前に並べる項目の数の上限 */
const MAX_ITEMS = 3;

const iconOf: Record<TodoItem['id'], IconName> = {
  cash: 'warning',
  assign: 'human',
  deadline: 'clock',
  order: 'board',
  advance: 'day',
  goal: 'trophy',
};

/** 項目の文言 */
function textOf(item: TodoItem): string {
  switch (item.id) {
    case 'cash':
      return t.cash(item.daysLeft);
    case 'assign':
      return t.assign(item.project);
    case 'deadline':
      return t.deadline(item.project, item.daysLeft);
    case 'order':
      return t.order(item.count);
    case 'advance':
      return t.advance;
    case 'goal': {
      const fmt = item.need === 'profit' ? ja.funds.money : (v: number) => `${Math.round(v)}`;
      return t.goal(item.tier, ja.company.requires[item.need], fmt(item.now), fmt(item.required));
    }
  }
}

/**
 * ホームの「今日やること」（Phase 41）。判断が要るものを大事な順に3件まで並べ、最後に次の目標とそれを伸ばす一手を添える。
 * 押すとその場所（案件ボード・案件のフロア）へ行く。行き先のない項目（日を進める・資金・目標）は文言だけ
 */
export function TodoPanel(props: { store: GameStore; onBoard?: () => void; onProject?: (projectId: string) => void }) {
  const items = createMemo(() => todoList(props.store.state()));
  const actions = () =>
    items()
      .filter((i) => i.id !== 'goal')
      .slice(0, MAX_ITEMS);
  const goal = () => items().find((i): i is GoalItem => i.id === 'goal');
  const go = (item: TodoItem) => {
    const target = item.target;
    if (target.type === 'board') return props.onBoard;
    if (target.type === 'project' && props.onProject) {
      const open = props.onProject;
      return () => open(target.projectId);
    }
    return undefined;
  };
  return (
    <Show when={items().length > 0}>
      <section
        class={`${panel} pointer-events-auto flex w-full max-w-80 flex-col gap-1.5 px-3 py-2 text-sm`}
        data-fit-item
        data-todo
        aria-label={t.title}
      >
        <h2 class="font-heading text-sm">{t.title}</h2>
        <ul class="flex flex-col gap-1">
          <For each={actions()}>
            {(item) => (
              <li data-todo-item={item.id}>
                <Show
                  when={go(item)}
                  fallback={
                    <span class="flex items-center gap-1.5 font-bold">
                      <Icon name={iconOf[item.id]} class="shrink-0" /> {textOf(item)}
                    </span>
                  }
                >
                  {(run) => (
                    <button
                      type="button"
                      class="flex w-full items-center gap-1.5 rounded-md border-2 border-line bg-primary-100 px-2 py-1 text-left font-bold hover:bg-primary-200"
                      onClick={() => run()()}
                    >
                      <Icon name={iconOf[item.id]} class="shrink-0" /> {textOf(item)}
                    </button>
                  )}
                </Show>
              </li>
            )}
          </For>
        </ul>
        <Show when={goal()}>
          {(g) => (
            <p class="flex flex-col border-t-2 border-line pt-1 text-xs" data-todo-item="goal">
              <span class="flex items-center gap-1 font-bold">
                <Icon name="trophy" class="shrink-0" /> {textOf(g())}
              </span>
              <span class="text-ink-muted">{t.goalHint[g().need]}</span>
            </p>
          )}
        </Show>
      </section>
    </Show>
  );
}
