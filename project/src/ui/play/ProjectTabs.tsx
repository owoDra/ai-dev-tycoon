import { Show } from 'solid-js';
import { ja } from '../../i18n/ja';
import type { ProjectTabsView } from '../../view/board';
import { Icon } from '../Icon';
import { Keyed } from '../Keyed';

const t = ja.board;

/**
 * 案件のタブ（複数の案件の同時進行）。進行中の案件ごとに1つのフロアがあり、タブで見るフロアを切り替える。
 * 先頭にホーム（会社のオフィス）のタブを置き（home なら選択中）、新しい依頼があれば案件ボードを開くボタンを添える。
 */
export function ProjectTabs(props: {
  view: ProjectTabsView;
  compact: boolean;
  onSwitch: (projectId: string) => void;
  onBoard: () => void;
  /** ホームのタブを押したとき（渡さなければ、ホームのタブは home のときだけ出す） */
  onHome?: () => void;
  /** いまホームを見ている */
  home?: boolean;
}) {
  return (
    <div class={`flex min-w-0 flex-1 items-center gap-1.5 ${props.compact ? '' : 'min-w-40'}`} data-project-tabs>
      {/* タブが入りきらなければ横にスクロールする（依頼のボタンは常に見せる） */}
      <div
        role="tablist"
        aria-label={t.tabs}
        class="flex min-w-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
      >
        <Show when={props.home || props.onHome}>
          <button
            type="button"
            role="tab"
            aria-selected={props.home === true}
            data-home-tab
            class={`flex h-11 shrink-0 items-center gap-1.5 rounded-md border-[3px] border-line px-2 text-sm font-bold whitespace-nowrap ${
              props.home ? 'bg-accent-200' : 'bg-sunken'
            }`}
            onClick={() => props.onHome?.()}
          >
            <Icon name="human" class="text-lg" />
            {t.home}
          </button>
        </Show>
        <Keyed each={props.view.tabs} by={(tab) => tab.projectId}>
          {(tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab.selected}
              data-project-tab={tab.projectId}
              class={`flex h-11 shrink-0 items-center gap-1.5 rounded-md border-[3px] border-line px-2 text-sm font-bold whitespace-nowrap ${
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
              <Show when={tab.team}>
                {(team) => (
                  <span
                    class="flex items-center gap-0.5 rounded border-2 border-line bg-surface px-1 text-[11px]"
                    data-tab-team
                  >
                    <Icon name="human" />
                    {team()}
                  </span>
                )}
              </Show>
            </button>
          )}
        </Keyed>
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
