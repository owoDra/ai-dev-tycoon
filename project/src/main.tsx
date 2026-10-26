import { createMemo, createSignal, For, lazy, onCleanup, Show } from 'solid-js';
import { render } from 'solid-js/web';
import './styles/index.css';
import { startLoop } from './app/loop';
import { createGameStore } from './app/store';
import type { IconName } from './assets/icons';
import { balance } from './content/balance';
import { content } from './content/index';
import { defaultWorldLookId, type WorldLook, type WorldLookId, worldLooks } from './content/look/world';
import { assertValidContent } from './content/validate';
import { createInitialState } from './core/state';
import { parseDevFlags } from './dev/flags';
import { ja } from './i18n/ja';
import { Icon } from './ui/Icon';
import { ProjectPanel } from './ui/ProjectPanel';
import { createSelection } from './ui/selection';
import { WorldCanvas } from './ui/WorldCanvas';
import { clockView } from './view/clock';
import { describeEntity, type EntityKind, type WorldViewModel } from './view/world';
import { DRAW_CALL_BUDGET, type World } from './world/index';

const PROJECT_ID = 'ecRenewal';

// 開発用の調整パネル。本番ビルドでは条件が定数 false になり、コードごと取り除かれる
const WorldTweak = import.meta.env.DEV
  ? lazy(() => import('./dev/world/WorldTweak').then((m) => ({ default: m.WorldTweak })))
  : null;

const kindIcon: Record<EntityKind, IconName> = { island: 'workflow', human: 'human', agent: 'ai', packet: 'project' };

// 仮の画面。2.5D ワールドの上に、ゲーム内時計・一時停止・速度変更・案件の仮パネル・選択の仮表示を重ねる。本番の HUD は Phase 06 で作る
function App(props: { tweak: boolean }) {
  const store = createGameStore(createInitialState('dev'));
  onCleanup(startLoop(store));
  const selection = createSelection();
  const [lookId, setLookId] = createSignal<WorldLookId>(defaultWorldLookId);
  const [look, setLook] = createSignal<WorldLook>(worldLooks[defaultWorldLookId]);
  const [world, setWorld] = createSignal<{ world: World; vm: () => WorldViewModel }>();

  const clock = createMemo(() => clockView(store.state().clock));
  const paused = createMemo(() => store.state().paused);
  const speed = createMemo(() => store.state().speed);
  const selected = createMemo(() => {
    const id = selection.selected();
    const w = world();
    return id && w ? describeEntity(w.vm(), id) : null;
  });

  return (
    <main class="relative h-dvh w-full overflow-hidden bg-bg text-ink">
      <WorldCanvas
        store={store}
        projectId={PROJECT_ID}
        look={look}
        selection={selection}
        onWorld={(w, vm) => setWorld({ world: w, vm })}
      />
      <header class="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-3 p-3">
        <h1 class="text-xl font-bold tracking-tight">{ja.title}</h1>
        <p class="rounded-lg bg-surface/90 px-3 py-1 font-mono text-lg tabular-nums" aria-live="off">
          {ja.clock.day(clock().day)} {clock().time}
        </p>
        <p class="flex items-center gap-1 text-sm">
          {paused() ? <PauseIcon /> : <PlayIcon />}
          {paused() ? ja.controls.paused : ja.controls.running}
        </p>
        <div class="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            class="flex items-center gap-2 rounded-lg bg-accent-400 px-3 py-1.5 font-bold text-on-accent"
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
                  class="rounded-lg border-2 border-line/30 bg-surface/90 px-2 py-1 font-bold aria-pressed:border-line"
                  onClick={() => store.dispatch({ type: 'SetSpeed', speed: s })}
                >
                  {ja.controls.speed(s)}
                </button>
              )}
            </For>
          </fieldset>
        </div>
        <p class="ml-auto flex items-center gap-2 rounded-lg bg-surface/90 px-3 py-1 text-sm" aria-live="polite">
          <Show when={selected()} fallback={<span class="text-ink-muted">{ja.world.noSelection}</span>}>
            {(s) => (
              <>
                <Icon name={kindIcon[s().kind]} />
                <span class="text-ink-muted">{ja.world.selected}</span>
                <span class="text-ink-muted">{ja.world.kinds[s().kind]}</span>
                <strong>{s().label}</strong>
              </>
            )}
          </Show>
        </p>
      </header>
      <div class="absolute bottom-3 left-3 max-h-[45vh] w-[min(44rem,calc(100%-1.5rem))] overflow-auto rounded-xl text-white">
        <ProjectPanel store={store} projectId={PROJECT_ID} />
      </div>
      <Show when={import.meta.env.DEV && world()}>{(w) => <DevStats world={w().world} />}</Show>
      <Show when={WorldTweak && props.tweak && WorldTweak}>
        {(Tweak) => {
          const Panel = Tweak();
          return (
            <Panel
              lookId={lookId()}
              look={look()}
              onPreset={(id) => {
                setLookId(id);
                setLook(worldLooks[id]);
              }}
              onChange={setLook}
            />
          );
        }}
      </Show>
    </main>
  );
}

/** 開発時だけ表示する描画の計測（draw call・描画したフレーム数・ループが止まっているか） */
function DevStats(props: { world: World }) {
  const [stats, setStats] = createSignal({ ...props.world.stats });
  const timer = setInterval(() => setStats({ ...props.world.stats }), 500);
  onCleanup(() => clearInterval(timer));
  return (
    <p class="pointer-events-none absolute right-3 bottom-3 rounded bg-slate-900/80 px-2 py-1 font-mono text-xs text-white">
      <span classList={{ 'text-rose-300': stats().drawCalls > DRAW_CALL_BUDGET }}>
        {ja.world.drawCalls(stats().drawCalls, DRAW_CALL_BUDGET)}
      </span>
      {' · '}
      {ja.world.frames(stats().frames)}
      <Show when={!stats().running}> · {ja.world.idle}</Show>
    </p>
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
// `?dev=explore`（調整パネル付きは `?dev=explore,tweak`）。`?dev=tweak` だけならゲーム画面でワールドを調整する
const devFlags = parseDevFlags(location.search);
if (import.meta.env.MODE === 'explore' || (import.meta.env.DEV && devFlags.has('explore'))) {
  void import('./dev/explore/main').then((m) => m.mountExplore(root, { tweak: devFlags.has('tweak') }));
} else if (import.meta.env.DEV && devFlags.has('styleguide')) {
  // スタイルガイド（src/dev/styleguide）。開発サーバーだけで開ける
  void import('./dev/styleguide/main').then((m) => m.mountStyleguide(root));
} else {
  render(() => <App tweak={import.meta.env.DEV && devFlags.has('tweak')} />, root);
}
