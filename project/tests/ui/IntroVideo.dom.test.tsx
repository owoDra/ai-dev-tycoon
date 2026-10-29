import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { ja } from '../../src/i18n/ja';
import { IntroVideoSheet, introVideo } from '../../src/ui/IntroVideo';
import { TitleScreen } from '../../src/ui/screens/TitleScreen';

let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = '';
});

const mount = (ui: () => JSX.Element) => {
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(ui, root);
  return root;
};

describe('紹介動画', () => {
  it('Cloudflare Pages 向けのビルド（テストも同じ）では動画・ポスター・字幕の場所がある', () => {
    expect(introVideo).toEqual({ src: '/intro.mp4', poster: '/intro-poster.jpg', captions: '/intro.vtt' });
  });

  it('タイトル画面は、onIntroVideo を渡したときだけ紹介動画のボタンを出す', () => {
    let opened = 0;
    const root = mount(() => (
      <>
        <TitleScreen onStart={() => {}} onSettings={() => {}} />
        <TitleScreen onStart={() => {}} onSettings={() => {}} onIntroVideo={() => opened++} />
      </>
    ));
    const buttons = root.querySelectorAll<HTMLButtonElement>('[data-intro-video-open]');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toContain(ja.screens.title.introVideo);
    buttons[0]?.click();
    expect(opened).toBe(1);
  });

  it('シートは字幕トラック付きの動画を出し、Esc と「閉じる」で閉じる', () => {
    const video = introVideo;
    if (!video) throw new Error('紹介動画のあるビルドで試す');
    let closed = 0;
    const root = mount(() => <IntroVideoSheet video={video} onClose={() => closed++} />);
    const player = root.querySelector('video');
    expect(player?.getAttribute('src')).toBe(video.src);
    expect(player?.querySelector('track[kind="captions"]')?.getAttribute('src')).toBe(video.captions);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(closed).toBe(1);
    root.querySelector<HTMLButtonElement>('[role="dialog"] button')?.click();
    expect(closed).toBe(2);
  });
});
