import { render } from 'solid-js/web';
import './styles/index.css';
import { App } from './app/App';
import { content } from './content/index';
import { assertValidContent } from './content/validate';
import { parseDevFlags } from './dev/flags';

assertValidContent(content);
const root = document.getElementById('root');
if (!root) throw new Error('#root が見つからない');

// デザイン比較ページ（src/dev/explore）。本番ビルドでは条件が定数 false になり、コードごと取り除かれる
// `?dev=explore`（調整パネル付きは `?dev=explore,tweak`）。`?dev=tweak` だけならゲーム画面でワールドを調整する
const devFlags = parseDevFlags(location.search);
if (import.meta.env.MODE === 'explore' || (import.meta.env.DEV && devFlags.has('explore'))) {
  void import('./dev/explore/main').then((m) => m.mountExplore(root, { tweak: devFlags.has('tweak') }));
} else if (import.meta.env.DEV && devFlags.has('styleguide')) {
  // スタイルガイド（src/dev/styleguide）。開発サーバーだけで開ける
  void import('./dev/styleguide/main').then((m) => m.mountStyleguide(root));
} else if (import.meta.env.DEV && devFlags.has('fx')) {
  // 演出のプレビュー（src/dev/fx）。すべての演出をボタンで発火して確かめる。開発サーバーだけで開ける
  void import('./dev/fx/main').then((m) => m.mountFxPreview(root));
} else if (import.meta.env.DEV && devFlags.has('audio')) {
  // サウンドテスト（src/dev/audio）。すべての効果音と BGM の各レイヤーを試聴する。開発サーバーだけで開ける
  void import('./dev/audio/main').then((m) => m.mountSoundTest(root));
} else {
  // プレイログ（src/dev/log）。`?dev=log` か、D5 の通しプレイ用ビルド（`--mode playtest`）で有効
  const log = import.meta.env.MODE === 'playtest' || (import.meta.env.DEV && devFlags.has('log'));
  // 性能の計測（FPS・draw call・パーティクル・JS ヒープ）。実際の重さを本番のビルドで測れるよう、`?dev=perf` は本番でも有効
  const perf = devFlags.has('perf');
  render(() => <App tweak={import.meta.env.DEV && devFlags.has('tweak')} log={log} perf={perf} />, root);
}
