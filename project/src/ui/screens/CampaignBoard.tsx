import { createMemo, For, type JSX, onMount, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { type BoardProjectView, boardView } from '../../view/campaign';
import { Icon } from '../Icon';
import { ghostButton, Meter, panel, primaryButton } from '../parts';

const t = ja.campaign;

/**
 * 案件ボード（キャンペーン）。受注できる依頼・進行中の案件・納品した案件を並べる。
 * 受注すると案件が始まり（StartProject）、進行中の案件とあわせて同時に進める。人と AI Worker は案件をまたいで共有する。
 */
export function CampaignBoard(props: {
  store: GameStore;
  /** 受注した、または進行中の案件を開く */
  onOpen: (projectId: string) => void;
  onBack: () => void;
}) {
  const view = createMemo(() => boardView(props.store.state()));
  let el!: HTMLDivElement;
  onMount(() => {
    enter(el, 'below');
    el.querySelector<HTMLButtonElement>('[data-start]')?.focus();
  });
  const accept = (projectId: string) => {
    props.store.dispatch({ type: 'StartProject', projectId });
    props.onOpen(projectId);
  };
  return (
    <div class="absolute inset-0 flex items-center justify-center overflow-y-auto bg-bg/40 p-4">
      <div ref={el} class={`${panel} flex max-h-full w-full max-w-xl flex-col gap-4 overflow-y-auto p-4 sm:p-6`}>
        <div class="flex items-baseline justify-between gap-2">
          <h1 class="font-heading text-2xl">{t.board}</h1>
          <span class="text-sm font-bold text-ink-muted tabular-nums" data-board-progress>
            {view().progress.done} / {view().progress.total}
          </span>
        </div>
        <Show when={view().cleared}>
          <p class="flex items-center gap-2 rounded-lg border-[3px] border-line bg-accent-200 p-3 font-heading text-lg">
            <Icon name="success" class="text-2xl" />
            {t.cleared}
          </p>
        </Show>
        <Section title={t.offered} items={view().offered} empty={view().cleared ? null : t.none}>
          {(p) => (
            <button type="button" data-start class={primaryButton} onClick={() => accept(p.projectId)}>
              {t.accept}
            </button>
          )}
        </Section>
        <Section title={t.active} items={view().active} empty={null}>
          {(p) => (
            <button type="button" data-resume class={ghostButton} onClick={() => props.onOpen(p.projectId)}>
              {t.resume}
            </button>
          )}
        </Section>
        <Section title={t.done} items={view().done} empty={null} />
        <button type="button" class={`${ghostButton} self-start`} onClick={() => props.onBack()}>
          {ja.screens.select.back}
        </button>
      </div>
    </div>
  );
}

function Section(props: {
  title: string;
  items: readonly BoardProjectView[];
  empty: string | null;
  children?: (p: BoardProjectView) => JSX.Element;
}) {
  return (
    <Show when={props.items.length > 0 || props.empty}>
      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-bold text-ink-muted">{props.title}</h2>
        <Show when={props.items.length > 0} fallback={<p class="text-sm text-ink-muted">{props.empty}</p>}>
          <ul class="flex flex-col gap-2">
            <For each={props.items}>
              {(p) => (
                <li
                  class="flex flex-col gap-3 rounded-lg border-[3px] border-line bg-sunken p-3 sm:flex-row sm:items-center"
                  data-board-project={p.projectId}
                >
                  <div class="flex min-w-0 flex-1 items-center gap-3">
                    <Icon name={p.profitPerHumanHour === null ? 'project' : 'success'} class="shrink-0 text-3xl" />
                    <div class="flex min-w-0 flex-col gap-1">
                      <h3 class="font-heading text-base">{p.name}</h3>
                      <p class="flex flex-wrap gap-x-3 text-xs font-bold text-ink-muted">
                        <Show
                          when={p.profitPerHumanHour}
                          fallback={
                            <>
                              <span>{ja.project.deadline(p.deadlineDays)}</span>
                              <span>{ja.screens.select.revenue(p.revenue)}</span>
                              <span>{ja.screens.select.tasks(p.tasks)}</span>
                            </>
                          }
                        >
                          {(v) => <span>{ja.hud.yenPerHour(v())}</span>}
                        </Show>
                      </p>
                      <Show when={p.progress > 0 && p.profitPerHumanHour === null}>
                        <Meter ratio={p.progress} label={ja.score.percent(p.progress)} color="bg-primary-400" />
                      </Show>
                    </div>
                  </div>
                  {props.children?.(p)}
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
    </Show>
  );
}
