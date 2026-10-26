import { For, Show } from 'solid-js';
import { ja } from '../../i18n/ja';
import type { ProjectTabsView } from '../../view/campaign';
import { Icon } from '../Icon';

const t = ja.campaign;

/**
 * 案件のタブ（複数の案件の同時進行）。進行中の案件ごとに1つのフロアがあり、タブで見るフロアを切り替える。
 * 新しい依頼があれば、案件ボードへ戻るボタンを添える。
 */
export function ProjectTabs(props: {
  view: ProjectTabsView;
  compact: boolean;
  onSwitch: (projectId: string) => void;
  onBoard: () => void;
}) {
  return (
    <div class={`flex min-w-0 items-center gap-1.5 ${props.compact ? 'basis-full overflow-x-auto' : ''}`}>
      <div role="tablist" aria-label={t.tabs} class="flex min-w-0 items-center gap-1.5">
        <For each={props.view.tabs}>
          {(tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab.selected}
              data-project-tab={tab.projectId}
              class={`flex h-11 min-w-0 shrink-0 items-center gap-1.5 rounded-md border-[3px] border-line px-2 text-sm font-bold whitespace-nowrap ${
                tab.selected ? 'bg-accent-200' : 'bg-sunken'
              }`}
              onClick={() => props.onSwitch(tab.projectId)}
            >
              <span class="rounded border-2 border-line bg-surface px-1 text-[11px] tabular-nums">
                {t.floor(tab.floor)}
              </span>
              <Icon name="project" class="text-lg" />
              <span class={`truncate ${props.compact ? 'max-w-28' : 'max-w-40'}`}>{tab.name}</span>
              <span class="text-[11px] text-ink-muted tabular-nums">{ja.score.percent(tab.progress)}</span>
            </button>
          )}
        </For>
      </div>
      <Show when={props.view.offers > 0}>
        <button
          type="button"
          data-board-open
          class="flex h-11 shrink-0 items-center gap-1 rounded-md border-[3px] border-line bg-primary-200 px-2 text-sm font-bold whitespace-nowrap"
          onClick={() => props.onBoard()}
        >
          <Icon name="success" class="text-lg" />
          {t.offers(props.view.offers)}
        </button>
      </Show>
    </div>
  );
}
