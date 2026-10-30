import { createEffect, createMemo, createSignal, lazy, Match, on, onCleanup, Show, Switch } from 'solid-js';
import { screenRegions, uiLayout } from '../content/look/layout';
import { defaultWorldLookId, type WorldLook, type WorldLookId, worldLooks } from '../content/look/world';
import { tutorialScript } from '../content/tutorial';
import { createBattle } from '../core/battle';
import { activeProjects } from '../core/board';
import { isBankrupt } from '../core/funds';
import { createInitialState, type GameState } from '../core/state';
import type { FxDirector } from '../fx/director';
import { ja } from '../i18n/ja';
import { AudioHost } from '../ui/audio/AudioHost';
import { BringScreen } from '../ui/bring/BringScreen';
import { PluginExportSheet } from '../ui/bring/PluginExportSheet';
import { CompanyStrip } from '../ui/company/CompanyStrip';
import { DeliveryCards, DeliveryModal } from '../ui/company/DeliveryCard';
import { fitColumn } from '../ui/fitColumn';
import { FxHost } from '../ui/fx/FxHost';
import { createHoldTimers } from '../ui/holdTimers';
import { IntroVideoSheet, introVideo } from '../ui/IntroVideo';
import { rectStyle } from '../ui/parts';
import { PlayScreen } from '../ui/play/PlayScreen';
import { createTermCards, TermCardList } from '../ui/play/TermCards';
import { SettingsSheet } from '../ui/SettingsSheet';
import { BankruptScreen } from '../ui/screens/BankruptScreen';
import { FiscalScreen } from '../ui/screens/FiscalScreen';
import { ResultScreen } from '../ui/screens/ResultScreen';
import { TitleScreen } from '../ui/screens/TitleScreen';
import { createSelection } from '../ui/selection';
import { createSafeBox } from '../ui/viewport';
import { WorldCanvas } from '../ui/WorldCanvas';
import { type DeliveryView, deliveryView } from '../view/fiscal';
import type { WorldViewModel } from '../view/world';
import { DRAW_CALL_BUDGET, type World } from '../world/index';
import { PARTICLE_TOTAL } from '../world/vfx/particles';
import { loadBringCards } from './bringStore';
import { startLoop } from './loop';
import { createMilestones } from './milestones';
import { markTutorialDone, progress } from './progress';
import { clearCompany, hasOutdatedSave, loadCompany, saveCompany } from './save';
import { afterDelivery, createScreens } from './screens';
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

/** 自動セーブの間隔（ms）。納品・受注・Seat の枚数の変更のときは、すぐにも保存する */
const AUTOSAVE_MS = 5000;

/**
 * ゲーム本体。3D ワールドを画面全体に1つだけ敷き、その上に画面（タイトル → プレイ（ホーム）→ 結果、タイトル → 持ち込み）を重ねる。
 * 会社1つごとに新しい GameStore を作り、ゲームループを回す。会社はチュートリアル案件から始まり、終えると案件ボード（ホームの上のシート）に引き合いが届く。
 * 進み具合（解放・社員・Harness・案件・評判）は1つの GameState で持ち越して自動セーブする（タイトルの「続きから」で再開）。
 * 複数の案件はプレイ画面のタブで切り替え（3D は案件ごとのフロア）、最後の進行中の案件を納品したらホーム（会社のオフィス）へ戻る。
 * 時間はプレイヤーが「次の日へ」を押したときだけ進む（app/store.ts の play）。閉じている間には進まない。
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
  /** ハーネスの書き出し（Phase 43）を開いているか */
  const [exportOpen, setExportOpen] = createSignal(false);
  /** プレイ画面のモーダル（詳細・案件ボード・メニューから開く画面）を開いているか（考えている間は時間を止める） */
  const [playModal, setPlayModal] = createSignal(false);
  /** 納品・決算・倒産（設定を開いている間は、納品の結果を Space で閉じない） */
  const milestones = createMilestones(settingsOpen);
  const { fiscal, bankrupt } = milestones;
  const [deliveries, setDeliveries] = createSignal<readonly DeliveryView[]>([]);
  const openSettings = () => setSettingsOpen(true);
  /** 紹介動画のシート（タイトルから開く。開いている間は BGM を止める） */
  const [introOpen, setIntroOpen] = createSignal(false);
  let director: FxDirector | undefined;
  // 画面の領域（content/look/layout.ts）。セーフエリアの内側の大きさから求め、回転やブラウザのバーの出し入れに追従する
  const [safeEl, setSafeEl] = createSignal<HTMLElement>();
  const safe = createSafeBox(safeEl);
  const regions = createMemo(() => screenRegions(uiLayout, safe()));
  /**
   * 時間を止める画面（決算・倒産・納品の結果・設定）を開いているか。開いている間はプレイ画面のキー操作を効かせない
   */
  const modal = () => settingsOpen() || exportOpen() || milestones.open();
  /**
   * ゲーム内の時間を止めているか（時間を止める画面・結果（振り返り）・プレイ画面のモーダル）。
   * ゲームループのほか、お知らせ・納品と用語のカードの消えるまでの時間もこの間は数えない
   */
  const held = () => modal() || screens.screen().id === 'result' || playModal();
  /** プレイ画面の外で時間を止めているか（プレイ画面は、自分のモーダルの間はキー操作を受ける） */
  const heldOutside = () => modal() || screens.screen().id === 'result';
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

  /** ワールドに映す案件（フロア）。ホームでは null（会社のオフィス）、タイトルと持ち込みではチュートリアルの案件 */
  const worldProject = (): string | null => {
    const s = screens.screen();
    if (s.id === 'play' || s.id === 'result') return s.projectId ?? null;
    return tutorialScript.projectId;
  };

  const useState = (state: GameState) => {
    selection.dispatch({ type: 'SelectEntity', entityId: null });
    milestones.reset(isBankrupt(state));
    setDeliveries([]);
    setGame(createGameStore(state));
  };

  const closeDelivery = (projectId: string) => setDeliveries((cards) => cards.filter((c) => c.projectId !== projectId));

  const save = () => {
    if (props.start) return;
    saveCompany(game().state());
    if (game().state().board === null) return;
    setSaved(true);
    setOutdated(false);
  };

  /** 持ち込みカード（このブラウザに保存したもの）を、会社の Harness Builder で選べるようにする */
  const syncBrought = () => game().dispatch({ type: 'SetBroughtParts', parts: loadBringCards().map((c) => c.id) });

  /** 会社をはじめから始める。最初の案件（チュートリアル）をすぐに始めてプレイへ進む。終えるとホームへ */
  const newCampaign = () => {
    clearCompany();
    useState(createInitialState(tutorialScript.seed, { board: true }));
    syncBrought();
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
    syncBrought();
    game().dispatch({ type: 'StartProject', projectId: tutorialScript.projectId });
    game().dispatch({ type: 'SkipTutorial' });
    save();
    screens.go({ type: 'StartTutorial', projectId: tutorialScript.projectId });
  };

  /** 保存した会社を読み込んでホームへ進む（進行中の案件はドックのタブから開く）。閉じていた間には時間は進んでいない */
  const continueCampaign = () => {
    const state = loadCompany();
    if (!state) return newCampaign();
    useState(state);
    syncBrought();
    screens.go({ type: 'Open' });
  };

  /** 書き出す会社：遊んでいる会社か、持ち寄りバトル中・タイトルなら保存した会社（なければ null） */
  const exportSource = (): GameState | null => (game().state().board ? game().state() : loadCompany());
  const openExport = () => {
    save();
    setExportOpen(true);
  };

  /** 納品した案件の振り返り（結果画面）を開く */
  const review = (projectId: string) => {
    selection.dispatch({ type: 'SelectEntity', entityId: null });
    screens.go({ type: 'Review', projectId });
  };

  /**
   * 持ち寄りバトルを始める（会社のセーブは変えない。単発のプレイなので保存もしない）。
   * 合言葉の案件のフロアへ進み、納品すると結果画面（結果コード）へ
   */
  const startBattle = (word: string, parts: readonly string[]) => {
    const state = createBattle(word, parts);
    useState(state);
    const projectId = Object.keys(state.projects)[0];
    if (projectId) screens.go({ type: 'Battle', projectId });
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
      // 結果（振り返り）・決算・倒産・納品の結果・設定・案件ボードを見ている間は、進めている日を止めておく
      onCleanup(startLoop(store, undefined, held));
      // 1日進め終えたら保存する
      createEffect(on(store.run, (run) => run === null && save(), { defer: true }));
      if (store.state().board) {
        const timer = setInterval(save, AUTOSAVE_MS);
        onCleanup(() => clearInterval(timer));
      }
      onCleanup(
        store.onEvents((events) => {
          if (events.some((e) => e.type === 'TutorialEnded')) markTutorialDone();
          if (events.some((e) => e.type === 'SeatsChanged' || e.type === 'OrderAccepted')) save();
          // ホームで受注したら、その案件のフロアへ移る（担当を決めるまで時間は進まないので、すぐ見せる）
          const won = events.flatMap((e) => (e.type === 'OrderAccepted' ? [e.projectId] : [])).at(0);
          const at = screens.screen();
          if (won !== undefined && at.id === 'play' && at.projectId === undefined) {
            screens.go({ type: 'Switch', projectId: won });
          }
          // 期の終わり：決算を出す（まとめ送りもそこで止める）
          const closed = events.flatMap((e) => (e.type === 'FiscalClosed' ? [e.no] : [])).at(-1);
          if (closed !== undefined && store.state().board) {
            milestones.showFiscal(closed);
            store.stop();
            save();
          }
          if (events.some((e) => e.type === 'CompanyBankrupt')) {
            milestones.showBankrupt();
            save();
          }
          // 打ち切った案件のフロアを見ていたら、納品と同じく次の案件かホームへ移る
          const cancelled = events.flatMap((e) => (e.type === 'ProjectCancelled' ? [e.projectId] : []));
          if (cancelled.length > 0) {
            save();
            const screen = screens.screen();
            const next = afterDelivery(screen, cancelled, activeProjects(store.state()), store.state().board !== null);
            if (next !== screen && screen.id === 'play') {
              selection.dispatch({ type: 'SelectEntity', entityId: null });
              screens.set(next);
            }
          }
          const done = events.filter((e) => e.type === 'ProjectCompleted').map((e) => e.projectId);
          if (done.length === 0) return;
          save();
          // 納品は全画面の結果画面に切り替えずに知らせる。直轄の案件はモーダルで（見ている間は時間が進まない）、
          // 管理者に任せた案件はカードで（操作を止めない）。振り返りはどちらからも開ける
          if (store.state().board) {
            const views = done.flatMap((id) => {
              const view = deliveryView(store.state(), id);
              return view ? [view] : [];
            });
            milestones.showDeliveries(views.filter((v) => v.direct));
            const cards = views.filter((v) => !v.direct);
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
                onBring={() => screens.go({ type: 'Bring' })}
                onSettings={openSettings}
                onIntroVideo={introVideo ? () => setIntroOpen(true) : undefined}
                outdatedSave={outdated() && !saved()}
              />
            </div>
          </Match>
          <Match when={screens.screen().id === 'bring'}>
            <div class="pointer-events-auto contents">
              <BringScreen onBack={() => screens.go({ type: 'Back' })} onBattle={startBattle} onExport={openExport} />
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
              held={heldOutside}
              onSettings={openSettings}
              onExport={game().state().board ? openExport : undefined}
              onModalOpen={setPlayModal}
              onSwitch={(projectId) => {
                selection.dispatch({ type: 'SelectEntity', entityId: null });
                screens.go({ type: 'Switch', projectId });
              }}
              onHome={() => {
                selection.dispatch({ type: 'SelectEntity', entityId: null });
                screens.go({ type: 'Home' });
              }}
              onReview={review}
            />
          </Match>
          <Match when={screens.screen().id === 'result'}>
            <div class="pointer-events-auto contents">
              <ResultScreen
                store={game()}
                projectId={worldProject() ?? ''}
                onNext={() => {
                  // 持ち寄りバトル（会社でない単発のプレイ）の後は、結果を比べられるよう持ち込みへ戻る
                  if (game().state().board === null) {
                    useState(createInitialState(IDLE_SEED));
                    screens.go({ type: 'Bring' });
                    return;
                  }
                  // 開く前に見ていた案件がまだ進行中ならそのフロアへ、なければホームへ戻る
                  const at = screens.screen();
                  const from = at.id === 'result' ? at.from : undefined;
                  const active = from !== undefined && activeProjects(game().state()).includes(from);
                  screens.go(active ? { type: 'Return' } : { type: 'Home' });
                }}
                onTitle={toTitle}
                onExport={openExport}
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
        song={introOpen() ? null : screens.screen().id === 'result' ? 'result' : 'play'}
        projectId={screens.screen().id === 'play' ? worldProject() : null}
        world={() => world()?.world}
        combo={() => director?.combo() ?? 0}
      />
      <Show when={fiscal() !== null && !bankrupt() ? fiscal() : null}>
        {(no) => <FiscalScreen store={game()} no={no()} onNext={milestones.closeFiscal} onTitle={toTitle} />}
      </Show>
      <Show when={milestones.delivery()} keyed>
        {(d) => (
          <DeliveryModal
            delivery={d}
            onNext={milestones.closeDelivery}
            onReview={() => {
              milestones.closeDelivery();
              review(d.projectId);
            }}
          />
        )}
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
      <Show when={exportOpen()}>
        <PluginExportSheet state={exportSource()} cards={loadBringCards()} onClose={() => setExportOpen(false)} />
      </Show>
      <Show when={introOpen() && introVideo}>
        {(video) => <IntroVideoSheet video={video()} onClose={() => setIntroOpen(false)} />}
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
