import { onCleanup, onMount } from 'solid-js';
import { audio } from '../audio/index';
import { enter, prefersReducedMotion } from '../fx/motion';
import { ja } from '../i18n/ja';
import { ghostButton, panel } from './parts';

const t = ja.screens.introVideo;

/**
 * 紹介動画（project/video で作り、public/ に置く）。Cloudflare Pages 向けのビルド（npm run build）と開発サーバーにだけあり、
 * 単一HTML版（npm run build:standalone）では null（タイトルにボタンを出さない）
 */
export const introVideo = __INTRO_VIDEO__
  ? {
      src: `${import.meta.env.BASE_URL}intro.mp4`,
      poster: `${import.meta.env.BASE_URL}intro-poster.jpg`,
      captions: `${import.meta.env.BASE_URL}intro.vtt`,
    }
  : null;

/**
 * 紹介動画のシート。動画は音声付きなので、開いている間は App が BGM を止める。
 * 字幕（ナレーションの文）はプレイヤーの字幕ボタンで出せる（画面のテロップと重なるので、既定では出さない）。
 * 動きを減らす設定では自動で再生しない（再生ボタンで始める）。Esc か「閉じる」で閉じ、開いたボタンにフォーカスを戻す
 */
export function IntroVideoSheet(props: { video: NonNullable<typeof introVideo>; onClose: () => void }) {
  let el!: HTMLDivElement;
  let player!: HTMLVideoElement;
  const opener = document.activeElement as HTMLElement | null;
  const close = () => {
    props.onClose();
    opener?.focus?.();
  };
  onMount(() => {
    audio.play('panelOpen');
    onCleanup(() => audio.play('panelClose'));
    enter(el, 'below');
    player.focus();
    if (!prefersReducedMotion()) {
      try {
        void player.play()?.catch(() => {});
      } catch {
        // 再生できない環境（テストの jsdom など）では、再生ボタンで始めてもらう
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    onCleanup(() => window.removeEventListener('keydown', onKey, { capture: true }));
  });
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-line/50 p-3" data-intro-video>
      <div
        ref={el}
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-video-title"
        class={`${panel} flex max-h-full w-full max-w-4xl flex-col gap-3 p-3 sm:p-4`}
      >
        <div class="flex items-center justify-between gap-2">
          <h2 id="intro-video-title" class="font-heading text-xl">
            {t.title}
          </h2>
          <button type="button" class={ghostButton} onClick={close}>
            {t.close}
          </button>
        </div>
        <video
          ref={player}
          src={props.video.src}
          poster={props.video.poster}
          controls
          playsinline
          preload="metadata"
          class="aspect-video w-full rounded-md border-[3px] border-line bg-line"
        >
          <track kind="captions" src={props.video.captions} srclang="ja" label={t.captions} />
          {t.fallback}
        </video>
      </div>
    </div>
  );
}
