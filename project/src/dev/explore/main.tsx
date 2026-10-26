import { render } from 'solid-js/web';
import '../../styles/index.css';
import { ja } from '../../i18n/ja';
import { D1Explore } from './d1/D1Explore';
import { D2Explore } from './d2/D2Explore';
import { D3Explore } from './d3/D3Explore';
import { readHashParam } from './persist';

/**
 * デザイン比較ページの起動。`npm run dev` では `?dev=explore`（調整パネル付きは `?dev=explore,tweak`）で開き、
 * `npm run build:explore` では常にこのページになる。既定は最新の D3 で、`#page=d1` `#page=d2` を付けると D1・D2 を開く。
 */
export function mountExplore(root: HTMLElement, options: { tweak: boolean }): void {
  document.title = ja.explore.title;
  const page = readHashParam(location.hash, 'page');
  render(() => {
    if (page === 'd1') return <D1Explore tweak={options.tweak} />;
    if (page === 'd2') return <D2Explore tweak={options.tweak} />;
    return <D3Explore />;
  }, root);
}
