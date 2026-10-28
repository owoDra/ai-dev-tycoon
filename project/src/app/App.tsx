import { createEffect, createMemo, createSignal, lazy, Match, on, onCleanup, Show, Switch } from 'solid-js';
import { screenRegions, uiLayout } from '../content/look/layout';
import { defaultWorldLookId, type WorldLook, type WorldLookId, worldLooks } from '../content/look/world';
import { tutorialScript } from '../content/tutorial';
import { catchUp, dayEnd, runsUnattended } from '../core/away';
import { activeProjects } from '../core/board';
import { businessDay } from '../core/clock';
import { isBankrupt } from '../core/funds';
import { createInitialState, type GameState } from '../core/state';
import type { FxDirector } from '../fx/director';
import { ja } from '../i18n/ja';
import { AudioHost } from '../ui/audio/AudioHost';
import { CompanyStrip } from '../ui/company/CompanyStrip';
import { DeliveryCards } from '../ui/company/DeliveryCard';
import { fitColumn } from '../ui/fitColumn';
import { FxHost } from '../ui/fx/FxHost';
import { createHoldTimers } from '../ui/holdTimers';
import { PlayScreen, rectStyle } from '../ui/play/PlayScreen';
import { DayBreakCard, RecapCard, type SessionLinks } from '../ui/play/SessionCards';
import { createTermCards, TermCardList } from '../ui/play/TermCards';
import { PracticeScreen } from '../ui/practice/PracticeScreen';
import { SettingsSheet } from '../ui/SettingsSheet';
import { BankruptScreen } from '../ui/screens/BankruptScreen';
import { FiscalScreen } from '../ui/screens/FiscalScreen';
import { ResultScreen } from '../ui/screens/ResultScreen';
import { TitleScreen } from '../ui/screens/TitleScreen';
import { createSelection } from '../ui/selection';
import { createSafeBox } from '../ui/viewport';
import { WorldCanvas } from '../ui/WorldCanvas';
import { type DeliveryView, deliveryView } from '../view/fiscal';
import { daySummary, recapView } from '../view/session';
import type { WorldViewModel } from '../view/world';
import { DRAW_CALL_BUDGET, type World } from '../world/index';
import { PARTICLE_TOTAL } from '../world/vfx/particles';
import { startLoop } from './loop';
import { createMilestones } from './milestones';
import { markTutorialDone, progress } from './progress';
import { clearCompany, hasOutdatedSave, loadCompany, loadSavedAt, saveCompany } from './save';
import { afterDelivery, createScreens } from './screens';
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
 * ゲーム本体。3D ワールドを画面全体に1つだけ敷き、その上に画面（タイトル → プレイ（ホーム）→ 結果、タイトル → 実務モード）を重ねる。
 * 会社1つごとに新しい GameStore を作り、ゲームループを回す。会社はチュートリアル案件から始まり、終えると案件ボード（ホームの上のシート）に引き合いが届く。
 * 進み具合（解放・社員・Harness・案件・評判）は1つの GameState で持ち越して自動セーブする（タイトルの「続きから」で再開）。
 * 複数の案件はプレイ画面のタブで切り替え（3D は案件ごとのフロア）、最後の進行中の案件を納品したらホーム（会社のオフィス）へ戻る。
 * 隙間時間に少しずつ遊べるよう、営業日の終わりで一時停止してその日の成果を出し（設定で切り替え）、
 * 「続きから」では閉じていた間の進行（core/away.ts）を適用して、一時停止したままあらすじを出す。
 */
export function App(props: {
  tweak: boolean;
  log?: boolean;
  perf?: boolean;
  /** 開発用の確認ページ（src/dev/layout）：この状態の会社をプレイ画面で開く（projectId が null ならホーム）。保存はしない */
  start?: { state: GameState; projectId: string | null };
}) {
  const screens = createScreens();
  const selection = createSelection();
  const [game, setGame] = createSignal<GameStore>(createGameStore(createInitialState(IDLE_SEED)));
  const [saved, setSaved] = createSignal(loadCompany() !== null);
  const [outdated, setOutdated] = createSignal(hasOutdatedSave());
  const [world, setWorld] = createSignal<{ world: World; vm: () => WorldViewModel }>();
  const [lookId, setLookId] = createSignal<WorldLookId>(defaultWorldLookId);
  const [look, setLook] = createSignal<WorldLook>(worldLooks[defaultWorldLookId]);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  /** 案件ボードを開いているか（見積を考えている間は時間を止める） */
  const [boardOpen, setBoardOpen] = createSignal(false);
  /** 区切りとあらすじのカード・決算・倒産（設定を開いている間は、カードを Space で閉じない） */
  const milestones = createMilestones(game, settingsOpen);
  const { dayCard, recap, fiscal, bankrupt, resume } = milestones;
  const [deliveries, setDeliveries] = createSignal<readonly DeliveryView[]>([]);
  /** 今の営業日が始まったときの state（その日の成果の比較に使う） */
  let dayStart = game().state();
  const openSettings = () => setSettingsOpen(true);
  let director: FxDirector | undefined;
  // 画面の領域（content/look/layout.ts）。セーフエリアの内側の大きさから求め、回転やブラウザのバーの出し入れに追従する
  const [safeEl, setSafeEl] = createSignal<HTMLElement>();
  const safe = createSafeBox(safeEl);
  const regions = createMemo(() => screenRegions(uiLayout, safe()));
  /**
   * 時間を止める画面（決算・倒産・区切りとあらすじのカード・設定）を開いているか。開いている間はプレイ画面のキー操作を効かせない
   */
  const modal = () => settingsOpen() || milestones.open();
  /**
   * ゲーム内の時間を止めているか（時間を止める画面・結果（振り返り）・案件ボード）。
   * ゲームループのほか、お知らせ・納品と用語のカードの消えるまでの時間もこの間は数えない
   */
  const held = () => modal() || screens.screen().id === 'result' || boardOpen();
  const later = createHoldTimers(held);
  const terms = createTermCards(game, uiLayout.flow.termCardMs, held);
  // カメラはプレイ中、3D の世界の領域（上の帯・お知らせの列・ドックを除いた範囲）に構図を合わせる。ほかの画面では画面全体
  createEffect(() => {
    const w = world()?.world;
    if (!w) return;
    const r = regions().world;
    const s = safe();
    w.setFrame(screens.screen().id === 'play' ? { ...r, x: r.x + s.x, y: r.y + s.y } : null);
  });

  /** ワールドに映す案件（フロア）。ホームでは null（会社のオフィス）、タイトルと実務モードではチュートリアルの案件 */
  const worldProject = (): string | null => {
    const s = screens.screen();
    if (s.id === 'play' || s.id === 'result') return s.projectId ?? null;
    return tutorialScript.projectId;
  };

  const useState = (state: GameState) => {
    selection.dispatch({ type: 'SelectEntity', entityId: null });
    milestones.reset(isBankrupt(state));
    setDeliveries([]);
    dayStart = state;
    setGame(createGameStore(state));
  };

  /** 営業日の終わりで区切るか（設定・会社の進行中の案件か結果待ちの見積・プレイ画面（ホームを含む）） */
  const breaksAtDayEnd = () => settings().dayBreak && screens.screen().id === 'play' && runsUnattended(game().state());

  const closeDelivery = (projectId: string) => setDeliveries((cards) => cards.filter((c) => c.projectId !== projectId));

  const save = () => {
    if (props.start) return;
    saveCompany(game().state());
    if (game().state().board === null) return;
    setSaved(true);
    setOutdated(false);
  };

  /** 会社をはじめから始める。最初の案件（チュートリアル）をすぐに始めてプレイへ進む。終えるとホームへ */
  const newCampaign = () => {
    clearCompany();
    useState(createInitialState(tutorialScript.seed, { board: true }));
    game().dispatch({ type: 'StartProject', projectId: tutorialScript.projectId });
    save();
    screens.go({ type: 'StartTutorial', projectId: tutorialScript.projectId });
  };

  /**
   * チュートリアルなしで会社を始める。最初の社員は seed から生成した平均的な2人で、seed は毎回変える。
   * チュートリアルを始めてすぐ飛ばしたのと同じ状態（最初の案件はあり、案内だけがない）にし、その案件へ進む。
   * 機能の解放は、チュートリアルを遊んだ会社と同じ条件で起きる（進め方を変えない）
   */
  const quickCampaign = () => {
    clearCompany();
    useState(createInitialState(`run-${Date.now().toString(36)}`, { board: true, talent: true }));
    game().dispatch({ type: 'StartProject', projectId: tutorialScript.projectId });
    game().dispatch({ type: 'SkipTutorial' });
    save();
    screens.go({ type: 'StartTutorial', projectId: tutorialScript.projectId });
  };

  /**
   * 保存した会社を読み込んでホームへ進む（進行中の案件はドックのタブから開く）。閉じていた間の進行を適用し、一時停止したままあらすじを出す
   * （チュートリアル中はあらすじを出さずにそのまま続ける）
   */
  const continueCampaign = () => {
    const state = loadCompany();
    if (!state) return newCampaign();
    if (isBankrupt(state)) {
      useState(state);
      screens.go({ type: 'Open' });
      return;
    }
    const savedAt = loadSavedAt();
    const awaySeconds = settings().awayProgress && savedAt !== null ? Math.max(0, (Date.now() - savedAt) / 1000) : 0;
    const { state: after, events } = catchUp(state, awaySeconds);
    const withRecap = after.tutorial === null && !isBankrupt(after);
    useState({ ...after, paused: withRecap || after.paused });
    const closed = events.flatMap((e) => (e.type === 'FiscalClosed' ? [e.no] : [])).at(-1) ?? null;
    if (withRecap) milestones.showRecap(recapView(state, after, events), closed);
    screens.go({ type: 'Open' });
    save();
  };

  /** 納品した案件の振り返り（結果画面）を開く */
  const review = (projectId: string) => {
    selection.dispatch({ type: 'SelectEntity', entityId: null });
    screens.go({ type: 'Review', projectId });
  };

  /** 案件ボードを開く頼み（区切りとあらすじのカードから。ボードはプレイ画面のシートなので、回数を渡して開いてもらう） */
  const [boardCall, setBoardCall] = createSignal(0);
  /** 区切りとあらすじのカードから飛ぶ先。カードを閉じて再開してから移る */
  const sessionLinks: SessionLinks = {
    onOpen: (projectId) => {
      resume();
      selection.dispatch({ type: 'SelectEntity', entityId: null });
      screens.go({ type: 'Switch', projectId });
    },
    onReview: (projectId) => {
      resume();
      review(projectId);
    },
    onBoard: () => {
      resume();
      setBoardCall((n) => n + 1);
    },
  };

  const toTitle = () => {
    save();
    useState(createInitialState(IDLE_SEED));
    screens.go({ type: 'ToTitle' });
  };

  if (props.start) {
    const { state, projectId } = props.start;
    useState(state);
    screens.go({ type: 'Open' });
    if (projectId !== null) screens.go({ type: 'Switch', projectId });
  }

  createEffect(
    on(game, (store) => {
      onCleanup(
        startLoop(
          store,
          undefined,
          () => (breaksAtDayEnd() ? dayEnd(store.state().clock) : null),
          // 結果（振り返り）・決算・倒産・区切りとあらすじのカード・設定・案件ボードを見ている間は、ゲーム内の時間を止める
          held,
        ),
      );
      // 営業日の終わり：一時停止して、その日の成果を出す（区切らない設定でも、成果の起点は進める）
      let day = businessDay(store.state().clock);
      createEffect(() => {
        const state = store.state();
        const now = businessDay(state.clock);
        if (now <= day) return;
        day = now;
        if (breaksAtDayEnd()) {
          milestones.showDay(daySummary(dayStart, state));
          if (!state.paused) store.dispatch({ type: 'TogglePause' });
          save();
        }
        dayStart = state;
      });
      if (store.state().board) {
        const timer = setInterval(save, AUTOSAVE_MS);
        onCleanup(() => clearInterval(timer));
      }
      onCleanup(
        store.onEvents((events) => {
          if (events.some((e) => e.type === 'TutorialEnded')) markTutorialDone();
          if (events.some((e) => e.type === 'SeatChanged' || e.type === 'BidWon' || e.type === 'BidSubmitted')) save();
          // ホームで受注したら、その案件のフロアへ移る（担当を決めるまで時間は進まないので、すぐ見せる）
          const won = events.flatMap((e) => (e.type === 'BidWon' ? [e.projectId] : [])).at(0);
          const at = screens.screen();
          if (won !== undefined && at.id === 'play' && at.projectId === undefined) {
            screens.go({ type: 'Switch', projectId: won });
          }
          // 期の終わり：一時停止して決算を出す（その日の区切りのカードの代わり）
          const closed = events.flatMap((e) => (e.type === 'FiscalClosed' ? [e.no] : [])).at(-1);
          if (closed !== undefined && store.state().board) {
            milestones.showFiscal(closed);
            if (!store.state().paused) store.dispatch({ type: 'TogglePause' });
            save();
          }
          if (events.some((e) => e.type === 'CompanyBankrupt')) {
            milestones.showBankrupt();
            save();
          }
          const done = events.filter((e) => e.type === 'ProjectCompleted').map((e) => e.projectId);
          if (done.length === 0) return;
          save();
          // 納品はカードで知らせる（全画面の結果画面には切り替えない。振り返りはカードから開く）
          if (store.state().board) {
            const cards = done.flatMap((id) => {
              const card = deliveryView(store.state(), id);
              return card ? [card] : [];
            });
            setDeliveries((prev) => [...prev, ...cards].slice(-uiLayout.flow.deliveryCards));
            for (const c of cards) later(() => closeDelivery(c.projectId), uiLayout.flow.deliveryCardMs);
          }
          // 進行中の案件が残っていれば、そのフロアへ移って続ける。会社で最後の案件を納品したらホームへ
          // （単発のプレイは、これまでどおり結果画面へ）
          const screen = screens.screen();
          const next = afterDelivery(screen, done, activeProjects(store.state()), store.state().board !== null);
          if (next !== screen) {
            selection.dispatch({ type: 'SelectEntity', entityId: null });
            screens.set(next);
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
    <main class="fixed inset-x-0 top-0 h-dvh overflow-hidden bg-bg font-sans text-ink">
      <WorldCanvas
        store={game()}
        projectId={worldProject()}
        look={look}
        selection={selection}
        onWorld={(w, vm) => setWorld({ world: w, vm })}
      />
      {/* セーフエリア（ノッチやホームバー）の内側。画面の UI はこの中に置く */}
      <div
        ref={setSafeEl}
        class="pointer-events-none absolute top-[env(safe-area-inset-top)] right-[env(safe-area-inset-right)] bottom-[env(safe-area-inset-bottom)] left-[env(safe-area-inset-left)]"
        data-safe-area
      >
        <Switch>
          <Match when={screens.screen().id === 'title'}>
            <div class="pointer-events-auto contents">
              <TitleScreen
                onStart={newCampaign}
                onContinue={saved() ? continueCampaign : undefined}
                onQuickStart={progress().tutorialDone ? quickCampaign : undefined}
                onPractice={() => screens.go({ type: 'Practice' })}
                onSettings={openSettings}
                outdatedSave={outdated() && !saved()}
              />
            </div>
          </Match>
          <Match when={screens.screen().id === 'practice'}>
            <div class="pointer-events-auto contents">
              <PracticeScreen onBack={() => screens.go({ type: 'Back' })} />
            </div>
          </Match>
          <Match when={screens.screen().id === 'play'}>
            <PlayScreen
              store={game()}
              projectId={worldProject()}
              selection={selection}
              vm={() => world()?.vm()}
              world={() => world()?.world}
              regions={regions}
              strip={<CompanyStrip store={game()} dense={regions().shape === 'phone'} />}
              notices={
                <>
                  <DeliveryCards
                    cards={deliveries()}
                    onClose={closeDelivery}
                    onReview={(projectId) => {
                      closeDelivery(projectId);
                      review(projectId);
                    }}
                  />
                  <TermCardList cards={terms.cards()} onClose={terms.close} />
                </>
              }
              held={held}
              onSettings={openSettings}
              onBoardOpen={setBoardOpen}
              onSwitch={(projectId) => {
                selection.dispatch({ type: 'SelectEntity', entityId: null });
                screens.go({ type: 'Switch', projectId });
              }}
              onHome={() => {
                selection.dispatch({ type: 'SelectEntity', entityId: null });
                screens.go({ type: 'Home' });
              }}
              onReview={review}
              boardCall={boardCall}
            />
          </Match>
          <Match when={screens.screen().id === 'result'}>
            <div class="pointer-events-auto contents">
              <ResultScreen
                store={game()}
                projectId={worldProject() ?? ''}
                onNext={() => {
                  // 開く前に見ていた案件がまだ進行中ならそのフロアへ、なければホームへ戻る
                  const at = screens.screen();
                  const from = at.id === 'result' ? at.from : undefined;
                  const active = from !== undefined && activeProjects(game().state()).includes(from);
                  screens.go(active ? { type: 'Return' } : { type: 'Home' });
                }}
                onTitle={toTitle}
              />
            </div>
          </Match>
        </Switch>
        {/* プレイ画面の外（結果画面など）では、用語のカードを同じお知らせの列の位置に出す */}
        <Show when={screens.screen().id !== 'play'}>
          <div
            ref={fitColumn}
            class="pointer-events-none absolute z-30 flex flex-col items-end gap-2 overflow-hidden"
            style={rectStyle(regions().notices)}
          >
            <TermCardList cards={terms.cards()} onClose={terms.close} />
          </div>
        </Show>
      </div>
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
      <Show when={dayCard() && fiscal() === null && !bankrupt() ? dayCard() : null}>
        {(summary) => <DayBreakCard summary={summary()} onNext={resume} onQuit={toTitle} links={sessionLinks} />}
      </Show>
      <Show when={recap()}>{(r) => <RecapCard recap={r()} onResume={resume} links={sessionLinks} />}</Show>
      <Show when={fiscal() !== null && recap() === null && !bankrupt() ? fiscal() : null}>
        {(no) => <FiscalScreen store={game()} no={no()} onNext={resume} onTitle={toTitle} />}
      </Show>
      <Show when={bankrupt()}>
        <BankruptScreen
          store={game()}
          onRestart={() => (progress().tutorialDone ? quickCampaign() : newCampaign())}
          onTitle={() => {
            clearCompany();
            setSaved(false);
            useState(createInitialState(IDLE_SEED));
            screens.go({ type: 'ToTitle' });
          }}
        />
      </Show>
      <Show when={settingsOpen()}>
        <SettingsSheet
          onClose={() => setSettingsOpen(false)}
          onTitle={screens.screen().id === 'play' || screens.screen().id === 'result' ? toTitle : undefined}
        />
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
