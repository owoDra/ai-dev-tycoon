import { createSignal, onMount, Show } from 'solid-js';
import { textureSrcset, textureUrl } from '../../assets/registry';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { Icon } from '../Icon';
import { ghostButton, iconButton, panel, primaryButton, SettingsIcon } from '../parts';

/**
 * タイトル画面。後ろでは 3D ワールドがアイドル表示で動き（App が描く）、手前にキービジュアル（WebP）と
 * タイトル・はじめるボタンを重ねる。ワールドが透けて見えるよう、カードの外は薄く覆うだけにする。
 * チュートリアルを終えた後は「チュートリアルをもう一度」を出す（onTutorial を渡したときだけ）。
 * セーブがあれば（onContinue を渡したとき）「続きから」を先頭に出し、「はじめから」はセーブを消す確認を1回挟む。
 * 実務モード（企画書24章）への入口も置く。
 */
export function TitleScreen(props: {
  onStart: () => void;
  onContinue?: () => void;
  onTutorial?: () => void;
  /** 実務モード（実際の仕事の改善効果の試算）を開く */
  onPractice?: () => void;
  onSettings: () => void;
}) {
  const [confirming, setConfirming] = createSignal(false);
  let el!: HTMLDivElement;
  let start!: HTMLButtonElement;
  onMount(() => {
    enter(el, 'below');
    start.focus();
  });
  return (
    <div class="absolute inset-0 flex items-center justify-center overflow-y-auto bg-bg/40 p-4">
      <div ref={el} class={`${panel} flex w-full max-w-xl flex-col items-center gap-4 p-4 text-center sm:p-6`}>
        <img
          src={textureUrl('titleKey')}
          srcset={textureSrcset('titleKey')}
          alt={ja.screens.title.keyVisual}
          class="aspect-video w-full rounded-md border-[3px] border-line object-cover"
        />
        <h1 class="font-heading text-3xl leading-tight sm:text-4xl">{ja.title}</h1>
        <p class="text-sm font-bold text-ink-muted">{ja.screens.title.tagline}</p>
        <Show
          when={props.onContinue}
          fallback={
            <button
              ref={start}
              type="button"
              class={`${primaryButton} min-w-48 text-lg`}
              onClick={() => props.onStart()}
            >
              {ja.screens.title.start}
            </button>
          }
        >
          {(resume) => (
            <>
              <button
                ref={start}
                type="button"
                data-continue
                class={`${primaryButton} min-w-48 text-lg`}
                onClick={() => resume()()}
              >
                {ja.screens.title.continue}
              </button>
              <button
                type="button"
                data-new-game
                class={ghostButton}
                onClick={() => (confirming() ? props.onStart() : setConfirming(true))}
              >
                <Show when={confirming()} fallback={ja.screens.title.newGame}>
                  <span class="flex items-center gap-1">
                    <Icon name="warning" />
                    {ja.screens.title.confirmNew}
                  </span>
                </Show>
              </button>
            </>
          )}
        </Show>
        <Show when={props.onTutorial}>
          {(retry) => (
            <button type="button" data-retry-tutorial class={ghostButton} onClick={() => retry()()}>
              {ja.screens.title.retryTutorial}
            </button>
          )}
        </Show>
        <Show when={props.onPractice}>
          {(open) => (
            <button type="button" data-open-practice class={ghostButton} onClick={() => open()()}>
              <span class="flex flex-col items-center leading-tight">
                <span>{ja.practice.open}</span>
                <span class="text-[11px] font-normal text-ink-muted">{ja.practice.openHint}</span>
              </span>
            </button>
          )}
        </Show>
        <button type="button" class={iconButton} aria-label={ja.settings.open} onClick={() => props.onSettings()}>
          <SettingsIcon />
        </button>
      </div>
    </div>
  );
}
