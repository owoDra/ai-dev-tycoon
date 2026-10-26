import { render } from 'solid-js/web';
import '../../styles/index.css';
import { ja } from '../../i18n/ja';
import { D1Explore } from './d1/D1Explore';
import { D2Explore } from './d2/D2Explore';
import { readHashParam } from './persist';

/**
 * デザイン比較ページの起動。`npm run dev` では `?dev=explore`（調整パネル付きは `?dev=explore,tweak`）で開き、
 * `npm run build:explore` では常にこのページになる。既定は最新の D2 で、`#page=d1` を付けると D1 を開く。
 */
export function mountExplore(root: HTMLElement, options: { tweak: boolean }): void {
  document.title = ja.explore.title;
  const page = readHashParam(location.hash, 'page');
  render(() => (page === 'd1' ? <D1Explore tweak={options.tweak} /> : <D2Explore tweak={options.tweak} />), root);
}
