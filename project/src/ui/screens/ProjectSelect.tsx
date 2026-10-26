import { For, onMount } from 'solid-js';
import { content } from '../../content/index';
import { tutorialScript } from '../../content/tutorial';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { Icon } from '../Icon';
import { ghostButton, panel, primaryButton } from '../parts';

/** 案件選択。content.projects のうち、チュートリアル案件（タイトルから始める）以外を並べる */
export function ProjectSelect(props: { onChoose: (projectId: string) => void; onBack: () => void }) {
  let el!: HTMLDivElement;
  onMount(() => {
    enter(el, 'below');
    el.querySelector<HTMLButtonElement>('[data-start]')?.focus();
  });
  return (
    <div class="absolute inset-0 flex items-center justify-center overflow-y-auto bg-bg/40 p-4">
      <div ref={el} class={`${panel} flex w-full max-w-xl flex-col gap-4 p-4 sm:p-6`}>
        <h1 class="font-heading text-2xl">{ja.screens.select.title}</h1>
        <ul class="flex flex-col gap-3">
          <For each={content.projects.filter((p) => p.id !== tutorialScript.projectId)}>
            {(p) => (
              <li class="flex flex-col gap-3 rounded-lg border-[3px] border-line bg-sunken p-4 sm:flex-row sm:items-center">
                <div class="flex min-w-0 flex-1 items-center gap-3">
                  <Icon name="project" class="shrink-0 text-4xl" />
                  <div class="flex min-w-0 flex-col">
                    <h2 class="font-heading text-lg">{p.name}</h2>
                    <p class="flex flex-wrap gap-x-3 text-xs font-bold text-ink-muted">
                      <span>{ja.project.deadline(p.deadlineDays)}</span>
                      <span>{ja.screens.select.revenue(p.revenue)}</span>
                      <span>{ja.screens.select.tasks(p.tasks.length)}</span>
                    </p>
                  </div>
                </div>
                <button type="button" data-start class={primaryButton} onClick={() => props.onChoose(p.id)}>
                  {ja.screens.select.start}
                </button>
              </li>
            )}
          </For>
        </ul>
        <button type="button" class={`${ghostButton} self-start`} onClick={() => props.onBack()}>
          {ja.screens.select.back}
        </button>
      </div>
    </div>
  );
}
