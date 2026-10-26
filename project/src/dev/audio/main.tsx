import { render } from 'solid-js/web';
import '../../styles/index.css';
import { ja } from '../../i18n/ja';
import { SoundTest } from './SoundTest';

/** サウンドテストの起動。`npm run dev` で `?dev=audio` を開く */
export function mountSoundTest(root: HTMLElement): void {
  document.title = ja.audio.test.title;
  render(() => <SoundTest />, root);
}
