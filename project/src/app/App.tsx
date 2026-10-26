import { createEffect, createSignal, lazy, Match, on, onCleanup, Show, Switch } from 'solid-js';
import { content } from '../content/index';
import { defaultWorldLookId, type WorldLook, type WorldLookId, worldLooks } from '../content/look/world';
import { createInitialState } from '../core/state';
import type { FxDirector } from '../fx/director';
import { ja } from '../i18n/ja';
import { AudioHost } from '../ui/audio/AudioHost';
import { FxHost } from '../ui/fx/FxHost';
import { PlayScreen } from '../ui/play/PlayScreen';
import { SettingsSheet } from '../ui/SettingsSheet';
import { ProjectSelect } from '../ui/screens/ProjectSelect';
import { ResultScreen } from '../ui/screens/ResultScreen';
import { TitleScreen } from '../ui/screens/TitleScreen';
import { createSelection } from '../ui/selection';
import { WorldCanvas } from '../ui/WorldCanvas';
import type { WorldViewModel } from '../view/world';
import { DRAW_CALL_BUDGET, type World } from '../world/index';
import { PARTICLE_TOTAL } from '../world/vfx/particles';
import { startLoop } from './loop';
import { createScreens } from './screens';
import { createGameStore, type GameStore } from './store';

// 開発用の調整パネル。本番ビルドでは条件が定数 false になり、コードごと取り除かれる
const WorldTweak = import.meta.env.DEV
  ? lazy(() => import('../dev/world/WorldTweak').then((m) => ({ default: m.WorldTweak })))
  : null;

/** タイトル画面の後ろで動かす（案件を始めていない）ワールドの seed */
const IDLE_SEED = 'title';

/**
 * ゲーム本体。3D ワールドを画面全体に1つだけ敷き、その上に画面（タイトル → 案件選択 → プレイ → 結果）を重ねる。
 * 1回のプレイごとに新しい GameStore を作り、ゲームループを回す。案件が納品されたら結果画面へ進む。
 */
export function App(props: { tweak: boolean }) {
  const screens = createScreens();
  const selection = createSelection();
  const [game, setGame] = createSignal<GameStore>(createGameStore(createInitialState(IDLE_SEED)));
  const [world, setWorld] = createSignal<{ world: World; vm: () => WorldViewModel }>();
  const [lookId, setLookId] = createSignal<WorldLookId>(defaultWorldLookId);
  const [look, setLook] = createSignal<WorldLook>(worldLooks[defaultWorldLookId]);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const openSettings = () => setSettingsOpen(true);
  let director: FxDirector | undefined;
  let plays = 0;

  const worldProject = () => {
    const s = screens.screen();
    return s.id === 'play' || s.id === 'result' ? s.projectId : (content.projects[0]?.id ?? '');
  };

  /** 新しいゲームを始める（案件の開始も Command で行う） */
  const newGame = (projectId: string | null) => {
    plays++;
    const store = createGameStore(createInitialState(projectId ? `play-${plays}` : IDLE_SEED));
    if (projectId) store.dispatch({ type: 'StartProject', projectId });
    selection.dispatch({ type: 'SelectEntity', entityId: null });
    setGame(store);
  };

  createEffect(
    on(game, (store) => {
      onCleanup(startLoop(store));
      onCleanup(
        store.onEvents((events) => {
          if (events.some((e) => e.type === 'ProjectCompleted')) {
            selection.dispatch({ type: 'SelectEntity', entityId: null });
            screens.go({ type: 'Complete' });
          }
        }),
      );
    }),
  );

  return (
    <main class="fixed inset-0 overflow-hidden bg-bg font-sans text-ink">
      <WorldCanvas
        store={game()}
        projectId={worldProject()}
        look={look}
        selection={selection}
        onWorld={(w, vm) => setWorld({ world: w, vm })}
      />
      <Switch>
        <Match when={screens.screen().id === 'title'}>
          <TitleScreen onStart={() => screens.go({ type: 'Open' })} onSettings={openSettings} />
        </Match>
        <Match when={screens.screen().id === 'select'}>
          <ProjectSelect
            onChoose={(projectId) => {
              newGame(projectId);
              screens.go({ type: 'Choose', projectId });
            }}
            onBack={() => screens.go({ type: 'Back' })}
          />
        </Match>
        <Match when={screens.screen().id === 'play'}>
          <PlayScreen
            store={game()}
            projectId={worldProject()}
            selection={selection}
            vm={() => world()?.vm()}
            world={() => world()?.world}
            onSettings={openSettings}
          />
        </Match>
        <Match when={screens.screen().id === 'result'}>
          <ResultScreen
            store={game()}
            projectId={worldProject()}
            onRetry={() => {
              newGame(worldProject());
              screens.go({ type: 'Retry' });
            }}
            onTitle={() => {
              newGame(null);
              screens.go({ type: 'ToTitle' });
            }}
          />
        </Match>
      </Switch>
      <FxHost
        store={game()}
        projectId={screens.screen().id === 'play' || screens.screen().id === 'result' ? worldProject() : null}
        world={() => world()?.world}
        vm={() => world()?.vm()}
        selection={selection}
        ref={(api) => {
          director = api.director;
        }}
      />
      <AudioHost
        store={game()}
        song={screens.screen().id === 'result' ? 'result' : 'play'}
        projectId={screens.screen().id === 'play' ? worldProject() : null}
        world={() => world()?.world}
        combo={() => director?.combo() ?? 0}
      />
      <Show when={settingsOpen()}>
        <SettingsSheet onClose={() => setSettingsOpen(false)} />
      </Show>
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
  const read = () => ({ ...props.world.stats, particles: props.world.particleCount() });
  const [stats, setStats] = createSignal(read());
  const timer = setInterval(() => setStats(read()), 500);
  onCleanup(() => clearInterval(timer));
  return (
    <p class="pointer-events-none absolute top-1 left-1 rounded bg-slate-900/70 px-2 py-0.5 font-mono text-[10px] text-white">
      <span classList={{ 'text-rose-300': stats().drawCalls > DRAW_CALL_BUDGET }}>
        {ja.world.drawCalls(stats().drawCalls, DRAW_CALL_BUDGET)}
      </span>
      {' · '}
      {ja.world.frames(stats().frames)}
      {' · '}
      {ja.fx.preview.particles(stats().particles, PARTICLE_TOTAL)}
      <Show when={!stats().running}> · {ja.world.idle}</Show>
    </p>
  );
}
