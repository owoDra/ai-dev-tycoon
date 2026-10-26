import { createMemo, For, onCleanup } from 'solid-js';
import { render } from 'solid-js/web';
import './styles/index.css';
import { startLoop } from './app/loop';
import { createGameStore } from './app/store';
import { balance } from './content/balance';
import { content } from './content/index';
import { assertValidContent } from './content/validate';
import { createInitialState } from './core/state';
import { parseDevFlags } from './dev/flags';
import { ja } from './i18n/ja';
import { ProjectPanel } from './ui/ProjectPanel';
import { clockView } from './view/clock';

// 仮の画面。ゲーム内時計・一時停止・速度変更と、案件の仮パネルを置く。本番の HUD は Phase 06 で作る
function App() {
  const store = createGameStore(createInitialState('dev'));
  onCleanup(startLoop(store));

  const clock = createMemo(() => clockView(store.state().clock));
  const paused = createMemo(() => store.state().paused);
  const speed = createMemo(() => store.state().speed);

  return (
    <main class="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-900 p-4 text-white">
      <h1 class="text-4xl font-bold tracking-tight text-amber-300">{ja.title}</h1>
      <p class="font-mono text-3xl tabular-nums" aria-live="off">
        {ja.clock.day(clock().day)} {clock().time}
      </p>
      <p class="flex items-center gap-2 text-sm text-slate-300">
        {paused() ? <PauseIcon /> : <PlayIcon />}
        {paused() ? ja.controls.paused : ja.controls.running}
      </p>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 font-bold text-slate-900"
          onClick={() => store.dispatch({ type: 'TogglePause' })}
        >
          {paused() ? <PlayIcon /> : <PauseIcon />}
          {paused() ? ja.controls.resume : ja.controls.pause}
        </button>
        <fieldset class="flex gap-1" aria-label={ja.controls.speedGroup}>
          <For each={balance.time.speeds}>
            {(s) => (
              <button
                type="button"
                aria-pressed={speed() === s}
                class="rounded-lg border-2 px-3 py-2 font-bold"
                classList={{
                  'border-amber-300 bg-amber-300/20 text-amber-200': speed() === s,
                  'border-slate-600 text-slate-300': speed() !== s,
                }}
                onClick={() => store.dispatch({ type: 'SetSpeed', speed: s })}
              >
                {ja.controls.speed(s)}
              </button>
            )}
          </For>
        </fieldset>
      </div>
      <ProjectPanel store={store} projectId="ecRenewal" />
    </main>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" class="size-4 fill-current" aria-hidden="true">
      <path d="M4 2.5v11l9-5.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" class="size-4 fill-current" aria-hidden="true">
      <path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" />
    </svg>
  );
}

assertValidContent(content);
const root = document.getElementById('root');
if (!root) throw new Error('#root が見つからない');

// デザイン比較ページ（src/dev/explore）。本番ビルドでは条件が定数 false になり、コードごと取り除かれる
const devFlags = parseDevFlags(location.search);
if (import.meta.env.MODE === 'explore' || (import.meta.env.DEV && (devFlags.has('explore') || devFlags.has('tweak')))) {
  void import('./dev/explore/main').then((m) => m.mountExplore(root, { tweak: devFlags.has('tweak') }));
} else {
  render(() => <App />, root);
}
