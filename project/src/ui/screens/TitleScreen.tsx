import { createSignal, onMount, Show } from 'solid-js';
import { textureSrcset, textureUrl } from '../../assets/registry';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { Icon } from '../Icon';
import { ghostButton, iconButton, panel, primaryButton, SettingsIcon } from '../parts';

/**
 * タイトル画面。後ろでは 3D ワールドがアイドル表示で動き（App が描く）、手前にキービジュアル（WebP）と
 * タイトル・はじめるボタンを重ねる。ワールドが透けて見えるよう、カードの外は薄く覆うだけにする。
 * チュートリアルを終えた後は「チュートリアルをもう一度」と「チュートリアルなしで始める」を出す（onTutorial・onQuickStart を渡したときだけ）。
 * セーブがあれば（onContinue を渡したとき）「続きから」を先頭に出し、「はじめから」はセーブを消す確認を1回挟む。
 * 以前の形式で読み込めないセーブが残っていれば、その旨を知らせる。持ち込み（自分の Claude Code の設定をゲームの部品にする）への入口も置く。
 * 紹介動画があるビルドでは、右下（狭い画面ではカードの下）に紹介動画のボタンを出す。
 */
export function TitleScreen(props: {
  onStart: () => void;
  onContinue?: () => void;
  onTutorial?: () => void;
  /** チュートリアルなしで始める（最初の社員は seed から生成した2人）。セーブがあれば確認を1回挟む */
  onQuickStart?: () => void;
  /** 持ち込み（自分の Claude Code の設定の評価と持ち寄りバトル）を開く */
  onBring?: () => void;
  onSettings: () => void;
  /** 紹介動画を開く（動画のあるビルドだけ。ui/IntroVideo.tsx） */
  onIntroVideo?: () => void;
  /** 以前の形式（固定の案件のキャンペーン）で読み込めないセーブが残っている */
  outdatedSave?: boolean;
}) {
  const [confirming, setConfirming] = createSignal(false);
  const [confirmingQuick, setConfirmingQuick] = createSignal(false);
  let el!: HTMLDivElement;
  let start!: HTMLButtonElement;
  onMount(() => {
    enter(el, 'below');
    start.focus();
  });
  return (
    <div class="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto bg-bg/40 p-4">
      <div ref={el} class={`${panel} flex w-full max-w-xl flex-col items-center gap-4 p-4 text-center sm:p-6`}>
        <img
          src={textureUrl('titleKey')}
          srcset={textureSrcset('titleKey')}
          alt={ja.screens.title.keyVisual}
          class="aspect-video w-full rounded-md border-[3px] border-line object-cover"
        />
        <Show when={props.outdatedSave}>
          <p
            class="flex items-center gap-2 rounded-md border-[3px] border-line bg-sunken p-2 text-left text-sm"
            data-outdated-save
          >
            <Icon name="warning" class="shrink-0 text-xl" />
            {ja.board.outdatedSave}
          </p>
        </Show>
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
        <Show when={props.onQuickStart}>
          {(quick) => (
            <button
              type="button"
              data-quick-start
              class={ghostButton}
              onClick={() => (!props.onContinue || confirmingQuick() ? quick()() : setConfirmingQuick(true))}
            >
              <Show
                when={confirmingQuick()}
                fallback={
                  <span class="flex flex-col items-center leading-tight">
                    <span>{ja.screens.title.quickStart}</span>
                    <span class="text-[11px] font-normal text-ink-muted">{ja.screens.title.quickStartHint}</span>
                  </span>
                }
              >
                <span class="flex items-center gap-1">
                  <Icon name="warning" />
                  {ja.screens.title.confirmQuick}
                </span>
              </Show>
            </button>
          )}
        </Show>
        <Show when={props.onBring}>
          {(open) => (
            <button type="button" data-open-bring class={ghostButton} onClick={() => open()()}>
              <span class="flex flex-col items-center leading-tight">
                <span>{ja.bring.open}</span>
                <span class="text-[11px] font-normal text-ink-muted">{ja.bring.openHint}</span>
              </span>
            </button>
          )}
        </Show>
        <button type="button" class={iconButton} aria-label={ja.settings.open} onClick={() => props.onSettings()}>
          <SettingsIcon />
        </button>
      </div>
      <Show when={props.onIntroVideo}>
        {(open) => (
          <button
            type="button"
            data-intro-video-open
            class={`${ghostButton} mt-3 shrink-0 bg-surface sm:absolute sm:right-4 sm:bottom-4 sm:mt-0`}
            onClick={() => open()()}
          >
            <span class="flex items-center gap-2">
              <Icon name="video" class="text-2xl" />
              {ja.screens.title.introVideo}
            </span>
          </button>
        )}
      </Show>
    </div>
  );
}
