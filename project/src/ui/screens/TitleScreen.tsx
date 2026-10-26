import { onMount } from 'solid-js';
import { textureSrcset, textureUrl } from '../../assets/registry';
import { ja } from '../../i18n/ja';
import { enter } from '../motion';
import { panel, primaryButton } from '../parts';

/**
 * タイトル画面。後ろでは 3D ワールドがアイドル表示で動き（App が描く）、手前にキービジュアル（WebP）と
 * タイトル・はじめるボタンを重ねる。ワールドが透けて見えるよう、カードの外は薄く覆うだけにする。
 */
export function TitleScreen(props: { onStart: () => void }) {
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
        <button ref={start} type="button" class={`${primaryButton} min-w-48 text-lg`} onClick={() => props.onStart()}>
          {ja.screens.title.start}
        </button>
      </div>
    </div>
  );
}
