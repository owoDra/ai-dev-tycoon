import { render } from 'solid-js/web';
import '../../styles/index.css';
import { ja } from '../../i18n/ja';
import { D1Explore } from './d1/D1Explore';

/**
 * デザイン比較ページの起動。`npm run dev` では `?dev=explore`（調整パネル付きは `?dev=tweak`）で開き、
 * `npm run build:explore` では常にこのページになる。D2 以降の比較もここに足す。
 */
export function mountExplore(root: HTMLElement, options: { tweak: boolean }): void {
  document.title = ja.explore.title;
  render(() => <D1Explore tweak={options.tweak} />, root);
}
