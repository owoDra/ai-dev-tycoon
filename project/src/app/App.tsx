import { createEffect, createSignal, lazy, Match, on, onCleanup, Show, Switch } from 'solid-js';
import { content } from '../content/index';
import { uiLayout } from '../content/look/layout';
import { defaultWorldLookId, type WorldLook, type WorldLookId, worldLooks } from '../content/look/world';
import { tutorialScript } from '../content/tutorial';
import { catchUp, dayEnd, runsUnattended } from '../core/away';
import { activeProjects } from '../core/campaign';
import { createInitialState, type GameState } from '../core/state';
import { businessDay } from '../core/team';
import type { FxDirector } from '../fx/director';
import { ja } from '../i18n/ja';
import { AudioHost } from '../ui/audio/AudioHost';
import { FxHost } from '../ui/fx/FxHost';
import { PlayScreen } from '../ui/play/PlayScreen';
import { DayBreakCard, RecapCard } from '../ui/play/SessionCards';
import { TermCards } from '../ui/play/TermCards';
import { PracticeScreen } from '../ui/practice/PracticeScreen';
import { SettingsSheet } from '../ui/SettingsSheet';
import { CampaignBoard } from '../ui/screens/CampaignBoard';
import { ResultScreen } from '../ui/screens/ResultScreen';
import { TitleScreen } from '../ui/screens/TitleScreen';
import { createSelection } from '../ui/selection';
import { WorldCanvas } from '../ui/WorldCanvas';
import { type DaySummary, daySummary, type Recap, recapView } from '../view/session';
import type { WorldViewModel } from '../view/world';
import { DRAW_CALL_BUDGET, type World } from '../world/index';
import { PARTICLE_TOTAL } from '../world/vfx/particles';
import { startLoop } from './loop';
import { markTutorialDone, progress } from './progress';
import { clearCampaign, loadCampaign, loadSavedAt, saveCampaign } from './save';
import { createScreens } from './screens';
import { settings } from './settings';
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
 * ゲーム本体。3D ワールドを画面全体に1つだけ敷き、その上に画面（タイトル → 案件ボード → プレイ → 結果、タイトル → 実務モード）を重ねる。
 * キャンペーン1回ごとに新しい GameStore を作り、ゲームループを回す。キャンペーンはチュートリアル案件から始まり、
 * 進み具合（解放・社員・Harness・案件）は1つの GameState で持ち越して自動セーブする（タイトルの「続きから」で再開）。
 * 複数の案件はプレイ画面のタブで切り替え（3D は案件ごとのフロア）、最後の進行中の案件を納品したら結果画面へ進む。
 * 隙間時間に少しずつ遊べるよう、営業日の終わりで一時停止してその日の成果を出し（設定で切り替え）、
 * 「続きから」では閉じていた間の進行（core/away.ts）を適用して、一時停止したままあらすじを出す。
 */
export function App(props: { tweak: boolean; log?: boolean; perf?: boolean }) {
  const screens = createScreens();
  const selection = createSelection();
  const [game, setGame] = createSignal<GameStore>(createGameStore(createInitialState(IDLE_SEED)));
  const [saved, setSaved] = createSignal(loadCampaign() !== null);
  const [world, setWorld] = createSignal<{ world: World; vm: () => WorldViewModel }>();
  const [lookId, setLookId] = createSignal<WorldLookId>(defaultWorldLookId);
  const [look, setLook] = createSignal<WorldLook>(worldLooks[defaultWorldLookId]);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [dayCard, setDayCard] = createSignal<DaySummary | null>(null);
  const [recap, setRecap] = createSignal<Recap | null>(null);
  /** 今の営業日が始まったときの state（その日の成果の比較に使う） */
  let dayStart = game().state();
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
    setDayCard(null);
    setRecap(null);
    dayStart = state;
    setGame(createGameStore(state));
  };

  /** 営業日の終わりで区切るか（設定・キャンペーンの進行中の案件・案件ボードかプレイ画面） */
  const breaksAtDayEnd = () => {
    const id = screens.screen().id;
    return settings().dayBreak && (id === 'play' || id === 'select') && runsUnattended(game().state());
  };

  /** 区切りやあらすじのカードを閉じて再開する */
  const resume = () => {
    setDayCard(null);
    setRecap(null);
    if (game().state().paused) game().dispatch({ type: 'TogglePause' });
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

  /**
   * チュートリアルなしでキャンペーンを始める。最初の社員は seed から生成した平均的な2人で、seed は毎回変える。
   * チュートリアルの案件をコーチなしで受注し（SkipTutorial で機能をすべて解放）、プレイへ進む
   */
  const quickCampaign = () => {
    clearCampaign();
    useState(createInitialState(`run-${Date.now().toString(36)}`, { campaign: true, talent: true }));
    game().dispatch({ type: 'StartProject', projectId: tutorialScript.projectId });
    game().dispatch({ type: 'SkipTutorial' });
    save();
    screens.go({ type: 'StartTutorial', projectId: tutorialScript.projectId });
  };

  /**
   * 保存したキャンペーンを読み込んで案件ボードへ進む。閉じていた間の進行を適用し、一時停止したままあらすじを出す
   * （チュートリアル中はあらすじを出さずにそのまま続ける）
   */
  const continueCampaign = () => {
    const state = loadCampaign();
    if (!state) return newCampaign();
    const savedAt = loadSavedAt();
    const awaySeconds = settings().awayProgress && savedAt !== null ? Math.max(0, (Date.now() - savedAt) / 1000) : 0;
    const { state: after, events } = catchUp(state, awaySeconds);
    const withRecap = after.tutorial === null;
    useState({ ...after, paused: withRecap });
    if (withRecap) setRecap(recapView(state, after, events));
    screens.go({ type: 'Open' });
    save();
  };

  const toTitle = () => {
    save();
    useState(createInitialState(IDLE_SEED));
    screens.go({ type: 'ToTitle' });
  };

  createEffect(
    on(game, (store) => {
      onCleanup(startLoop(store, undefined, () => (breaksAtDayEnd() ? dayEnd(store.state().clock) : null)));
      // 営業日の終わり：一時停止して、その日の成果を出す（区切らない設定でも、成果の起点は進める）
      let day = businessDay(store.state().clock);
      createEffect(() => {
        const state = store.state();
        const now = businessDay(state.clock);
        if (now <= day) return;
        day = now;
        if (breaksAtDayEnd()) {
          setDayCard(daySummary(dayStart, state));
          if (!state.paused) store.dispatch({ type: 'TogglePause' });
          save();
        }
        dayStart = state;
      });
      if (store.state().campaign) {
        const timer = setInterval(save, AUTOSAVE_MS);
        onCleanup(() => clearInterval(timer));
      }
      onCleanup(
        store.onEvents((events) => {
          if (events.some((e) => e.type === 'TutorialEnded')) markTutorialDone();
          // HUD などから再開したら、区切りとあらすじのカードを閉じる
          if (events.some((e) => e.type === 'PauseToggled' && !e.paused)) {
            setDayCard(null);
            setRecap(null);
          }
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
            onQuickStart={progress().tutorialDone ? quickCampaign : undefined}
            onPractice={() => screens.go({ type: 'Practice' })}
            onSettings={openSettings}
          />
        </Match>
        <Match when={screens.screen().id === 'practice'}>
          <PracticeScreen onBack={() => screens.go({ type: 'Back' })} />
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
      <Show when={dayCard()}>{(summary) => <DayBreakCard summary={summary()} onNext={resume} onQuit={toTitle} />}</Show>
      <Show when={recap()}>{(r) => <RecapCard recap={r()} onResume={resume} />}</Show>
      <TermCards store={game()} durationMs={uiLayout.flow.termCardMs} />
      <Show when={settingsOpen()}>
        <SettingsSheet onClose={() => setSettingsOpen(false)} />
      </Show>
      <Show when={(import.meta.env.DEV || props.perf) && world()}>
        {(w) => <DevStats world={w().world} perf={props.perf === true} />}
      </Show>
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

/** Chrome 系だけが持つ JS ヒープの使用量（performance.memory）。無い環境では null */
/** 60fps の1フレームの時間（ミリ秒）。これより間隔が開いていれば赤で示す */
const FRAME_BUDGET_MS = 1000 / 60 + 1;

function heapMegabytes(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? memory.usedJSHeapSize / (1024 * 1024) : null;
}

/**
 * 描画の計測（draw call・描画したフレーム数・パーティクル数・ループが止まっているか）。開発時は常に表示する。
 * `?dev=perf` では FPS・1フレームの CPU 時間・JS ヒープも出す（最も重い場面で 60fps を保てているかを確かめる）
 */
function DevStats(props: { world: World; perf: boolean }) {
  const read = () => ({ ...props.world.stats, particles: props.world.particleCount(), heap: heapMegabytes() });
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
      <Show when={props.perf}>
        <br data-perf />
        <span classList={{ 'text-rose-300': stats().running && stats().intervalMs > FRAME_BUDGET_MS }}>
          {ja.world.fps(stats().intervalMs > 0 ? Math.round(1000 / stats().intervalMs) : 0)}
        </span>
        {' · '}
        {ja.world.cpu(stats().cpuMs)}
        <Show when={stats().heap}>{(mb) => <> · {ja.world.heap(mb())}</>}</Show>
      </Show>
    </p>
  );
}
