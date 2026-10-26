import { createEffect, createSignal, lazy, Match, on, onCleanup, Show, Switch } from 'solid-js';
import { content } from '../content/index';
import { uiLayout } from '../content/look/layout';
import { defaultWorldLookId, type WorldLook, type WorldLookId, worldLooks } from '../content/look/world';
import { tutorialScript } from '../content/tutorial';
import { activeProjects } from '../core/campaign';
import { createInitialState, type GameState } from '../core/state';
import type { FxDirector } from '../fx/director';
import { ja } from '../i18n/ja';
import { AudioHost } from '../ui/audio/AudioHost';
import { FxHost } from '../ui/fx/FxHost';
import { PlayScreen } from '../ui/play/PlayScreen';
import { TermCards } from '../ui/play/TermCards';
import { SettingsSheet } from '../ui/SettingsSheet';
import { CampaignBoard } from '../ui/screens/CampaignBoard';
import { ResultScreen } from '../ui/screens/ResultScreen';
import { TitleScreen } from '../ui/screens/TitleScreen';
import { createSelection } from '../ui/selection';
import { WorldCanvas } from '../ui/WorldCanvas';
import type { WorldViewModel } from '../view/world';
import { DRAW_CALL_BUDGET, type World } from '../world/index';
import { PARTICLE_TOTAL } from '../world/vfx/particles';
import { startLoop } from './loop';
import { markTutorialDone } from './progress';
import { clearCampaign, loadCampaign, saveCampaign } from './save';
import { createScreens } from './screens';
import { createGameStore, type GameStore } from './store';

// 開発用の調整パネル。本番ビルドでは条件が定数 false になり、コードごと取り除かれる
const WorldTweak = import.meta.env.DEV
  ? lazy(() => import('../dev/world/WorldTweak').then((m) => ({ default: m.WorldTweak })))
  : null;

// プレイログ（開発用）。本番ビルドでは条件が定数 false になり、コードごと取り除かれる
const PlayLogHost =
  import.meta.env.DEV || import.meta.env.MODE === 'playtest'
    ? lazy(() => import('../dev/log/PlayLogHost').then((m) => ({ default: m.PlayLogHost })))
    : null;

/** タイトル画面の後ろで動かす（案件を始めていない）ワールドの seed */
const IDLE_SEED = 'title';

/** 自動セーブの間隔（ms）。納品・受注・Seat の変更のときは、すぐにも保存する */
const AUTOSAVE_MS = 5000;

/**
 * ゲーム本体。3D ワールドを画面全体に1つだけ敷き、その上に画面（タイトル → 案件ボード → プレイ → 結果）を重ねる。
 * キャンペーン1回ごとに新しい GameStore を作り、ゲームループを回す。キャンペーンはチュートリアル案件から始まり、
 * 進み具合（解放・社員・Harness・案件）は1つの GameState で持ち越して自動セーブする（タイトルの「続きから」で再開）。
 * 複数の案件はプレイ画面のタブで切り替え（3D は案件ごとのフロア）、最後の進行中の案件を納品したら結果画面へ進む。
 */
export function App(props: { tweak: boolean; log?: boolean }) {
  const screens = createScreens();
  const selection = createSelection();
  const [game, setGame] = createSignal<GameStore>(createGameStore(createInitialState(IDLE_SEED)));
  const [saved, setSaved] = createSignal(loadCampaign() !== null);
  const [world, setWorld] = createSignal<{ world: World; vm: () => WorldViewModel }>();
  const [lookId, setLookId] = createSignal<WorldLookId>(defaultWorldLookId);
  const [look, setLook] = createSignal<WorldLook>(worldLooks[defaultWorldLookId]);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const openSettings = () => setSettingsOpen(true);
  let director: FxDirector | undefined;

  /** ワールドに映す案件（フロア）。案件ボードでは進行中の案件のどれか */
  const worldProject = () => {
    const s = screens.screen();
    if (s.id === 'play' || s.id === 'result') return s.projectId;
    return activeProjects(game().state())[0] ?? content.projects[0]?.id ?? '';
  };

  const useState = (state: GameState) => {
    selection.dispatch({ type: 'SelectEntity', entityId: null });
    setGame(createGameStore(state));
  };

  const save = () => {
    saveCampaign(game().state());
    setSaved(game().state().campaign !== null);
  };

  /** キャンペーンをはじめから始める。最初の案件（チュートリアル）をすぐに受注してプレイへ進む */
  const newCampaign = () => {
    clearCampaign();
    useState(createInitialState(tutorialScript.seed, { campaign: true }));
    game().dispatch({ type: 'StartProject', projectId: tutorialScript.projectId });
    save();
    screens.go({ type: 'StartTutorial', projectId: tutorialScript.projectId });
  };

  /** 保存したキャンペーンを読み込んで案件ボードへ進む */
  const continueCampaign = () => {
    const state = loadCampaign();
    if (!state) return newCampaign();
    useState({ ...state, paused: false });
    screens.go({ type: 'Open' });
  };

  const toTitle = () => {
    save();
    useState(createInitialState(IDLE_SEED));
    screens.go({ type: 'ToTitle' });
  };

  createEffect(
    on(game, (store) => {
      onCleanup(startLoop(store));
      if (store.state().campaign) {
        const timer = setInterval(save, AUTOSAVE_MS);
        onCleanup(() => clearInterval(timer));
      }
      onCleanup(
        store.onEvents((events) => {
          if (events.some((e) => e.type === 'TutorialEnded')) markTutorialDone();
          if (events.some((e) => e.type === 'SeatChanged' || e.type === 'ProjectsOffered')) save();
          const done = events.filter((e) => e.type === 'ProjectCompleted').map((e) => e.projectId);
          if (done.length === 0) return;
          save();
          const screen = screens.screen();
          if (screen.id !== 'play') return;
          // 進行中の案件が残っていれば、そのフロアへ移って続ける。最後の案件を納品したら結果画面へ
          const rest = activeProjects(store.state());
          if (rest.length === 0) {
            selection.dispatch({ type: 'SelectEntity', entityId: null });
            if (!done.includes(screen.projectId)) screens.go({ type: 'Switch', projectId: done.at(-1) ?? '' });
            screens.go({ type: 'Complete' });
          } else if (done.includes(screen.projectId)) {
            selection.dispatch({ type: 'SelectEntity', entityId: null });
            screens.go({ type: 'Switch', projectId: rest[0] ?? screen.projectId });
          }
        }),
      );
    }),
  );
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', save);
    onCleanup(() => window.removeEventListener('pagehide', save));
  }

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
          <TitleScreen
            onStart={newCampaign}
            onContinue={saved() ? continueCampaign : undefined}
            onSettings={openSettings}
          />
        </Match>
        <Match when={screens.screen().id === 'select'}>
          <CampaignBoard
            store={game()}
            onOpen={(projectId) => {
              selection.dispatch({ type: 'SelectEntity', entityId: null });
              screens.go({ type: 'Choose', projectId });
            }}
            onBack={toTitle}
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
            onSwitch={(projectId) => {
              selection.dispatch({ type: 'SelectEntity', entityId: null });
              screens.go({ type: 'Switch', projectId });
            }}
            onBoard={() => {
              selection.dispatch({ type: 'SelectEntity', entityId: null });
              screens.go({ type: 'Board' });
            }}
          />
        </Match>
        <Match when={screens.screen().id === 'result'}>
          <ResultScreen
            store={game()}
            projectId={worldProject()}
            onNext={() => screens.go({ type: 'Board' })}
            onTitle={toTitle}
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
      <TermCards store={game()} durationMs={uiLayout.flow.termCardMs} />
      <Show when={settingsOpen()}>
        <SettingsSheet onClose={() => setSettingsOpen(false)} />
      </Show>
      <Show when={import.meta.env.DEV && world()}>{(w) => <DevStats world={w().world} />}</Show>
      <Show when={PlayLogHost && props.log && PlayLogHost}>
        {(Host) => {
          const Log = Host();
          return <Log store={game()} selection={selection} />;
        }}
      </Show>
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
