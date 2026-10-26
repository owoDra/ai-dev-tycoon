import { createMemo, onMount, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import { textureUrl } from '../../assets/registry';
import { scoreProject } from '../../core/scoring';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { baselineProfitPerHumanHour } from '../../view/hud';
import { Icon } from '../Icon';
import { ghostButton, panel, primaryButton } from '../parts';

/**
 * 結果画面（仮）。Profit / Human Hour と、人間だけで進めた場合の見込みからの伸び、主な数字だけを出す。
 * 振り返りと演出は Phase 14 で作る
 */
export function ResultScreen(props: { store: GameStore; projectId: string; onRetry: () => void; onTitle: () => void }) {
  const score = createMemo(() => scoreProject(props.store.state(), props.projectId));
  const baseline = createMemo(() => baselineProfitPerHumanHour(props.projectId));
  let el!: HTMLDivElement;
  onMount(() => {
    enter(el, 'below');
    el.querySelector<HTMLButtonElement>('[data-retry]')?.focus();
  });
  const t = ja.screens.result;
  return (
    <div
      class="absolute inset-0 flex items-center justify-center overflow-y-auto bg-cover bg-center p-4"
      style={{ 'background-image': `url(${textureUrl('resultBg')})` }}
    >
      <div ref={el} class={`${panel} flex w-full max-w-md flex-col items-center gap-4 p-6 text-center`}>
        <p class="flex items-center gap-2 font-heading text-2xl">
          <Icon name="success" class="text-3xl" />
          {t.title}
        </p>
        <p class="text-xs font-bold text-ink-muted">{t.lead}</p>
        <Show when={score()}>
          {(s) => (
            <>
              <div class="flex flex-col items-center">
                <span class="text-xs font-bold text-ink-muted">{t.profitPerHumanHour}</span>
                <span class="font-heading text-4xl tabular-nums">{ja.hud.yenPerHour(s().profitPerHumanHour)}</span>
                <Show when={baseline() > 0}>
                  <span class="flex items-center gap-2 text-sm font-bold text-ink-muted tabular-nums" data-baseline>
                    {t.baseline} {ja.hud.yenPerHour(baseline())}
                    <span class="rounded-full border-2 border-line bg-accent-200 px-2 text-ink">
                      {t.gain(s().profitPerHumanHour / baseline())}
                    </span>
                  </span>
                </Show>
              </div>
              <dl class="grid w-full grid-cols-2 gap-x-4 gap-y-1 text-left text-sm">
                <dt class="text-ink-muted">{ja.score.profit}</dt>
                <dd class="text-right font-bold tabular-nums">{ja.score.yen(s().profit)}</dd>
                <dt class="text-ink-muted">{ja.score.humanHours}</dt>
                <dd class="text-right font-bold tabular-nums">{ja.score.minutes(s().humanMinutes)}</dd>
                <dt class="text-ink-muted">{ja.score.quality}</dt>
                <dd class="text-right font-bold tabular-nums">{ja.score.percent(s().quality)}</dd>
              </dl>
            </>
          )}
        </Show>
        <div class="flex flex-wrap justify-center gap-2">
          <button type="button" data-retry class={primaryButton} onClick={() => props.onRetry()}>
            {t.retry}
          </button>
          <button type="button" class={ghostButton} onClick={() => props.onTitle()}>
            {t.toTitle}
          </button>
        </div>
      </div>
    </div>
  );
}
