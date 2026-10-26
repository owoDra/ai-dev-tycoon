import { render } from 'solid-js/web';
import '../../styles/index.css';
import { ja } from '../../i18n/ja';
import { Styleguide } from './Styleguide';

/** スタイルガイドの起動。`npm run dev` で `?dev=styleguide` を開く */
export function mountStyleguide(root: HTMLElement): void {
  document.title = ja.styleguide.title;
  render(() => <Styleguide />, root);
}
