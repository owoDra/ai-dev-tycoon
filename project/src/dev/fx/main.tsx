import { render } from 'solid-js/web';
import '../../styles/index.css';
import { ja } from '../../i18n/ja';
import { FxPreview } from './FxPreview';

/** 演出のプレビューの起動。`npm run dev` で `?dev=fx` を開く */
export function mountFxPreview(root: HTMLElement): void {
  document.title = ja.fx.preview.title;
  render(() => <FxPreview />, root);
}
