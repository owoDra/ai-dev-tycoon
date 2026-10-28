import { createEffect, createSignal, For, type JSX, Match, onCleanup, onMount, Show, Switch } from 'solid-js';
import { App } from '../../../app/App';
import { settings } from '../../../app/settings';
import type { GameStore } from '../../../app/store';
import { audio } from '../../../audio/index';
import { getProject } from '../../../content/index';
import { type FeelIntensityId, type FeelMotionId, feelIntensities, feelMotions } from '../../../content/look/feel';
import { type SoundPaletteId, soundPalettes } from '../../../content/look/sound';
import { defaultWorldLookId, worldLooks } from '../../../content/look/world';
import { reduce } from '../../../core/commands';
import type { GameState } from '../../../core/state';
import { step } from '../../../core/step';
import { feelChoice, selectFeel } from '../../../fx/feel';
import { ja } from '../../../i18n/ja';
import { installUiSounds } from '../../../ui/audio/uiSounds';
import { FxHost, type FxHostApi } from '../../../ui/fx/FxHost';
import { createSelection } from '../../../ui/selection';
import { WorldCanvas } from '../../../ui/WorldCanvas';
import { islandId, type WorldViewModel } from '../../../view/world';
import type { World } from '../../../world/index';
import { DEMO_PROJECT, demoInitialState, isDemoDone } from '../d2/demo';
import { ExploreShell } from '../ExploreShell';
import { createVariantSelection } from '../selection';

/** デモで実時間1秒に進めるゲーム内の分（本編は1日ずつ進めるので、デモだけの速さ） */
const DEMO_MINUTES_PER_SECOND = 24;

import {
  beatsBetween,
  beatTier,
  DEMO_SECONDS,
  type DemoBeat,
  demoTimeline,
  type FeelComboId,
  feelComboIds,
  feelCombos,
  matchCombo,
  momentumAt,
} from './demo';

const t = ja.explore.d4;
const intensityIds = Object.keys(feelIntensities) as FeelIntensityId[];
const motionIds = Object.keys(feelMotions) as FeelMotionId[];
const paletteIds = Object.keys(soundPalettes) as SoundPaletteId[];
const modeIds = ['demo', 'play'] as const;
type ModeId = (typeof modeIds)[number];

/** 背景のワールドの進む速さ（1倍速に対する倍率）。仕事が流れている様子を見せるだけで、演出とは関係しない */
const AMBIENT_SPEED = 3;
/** デモの時計を進める間隔（ms） */
const TICK_MS = 50;
/** 島を選んでから選択を外すまで（ms） */
const SELECT_HOLD_MS = 1200;
const MAX_FRAME_SECONDS = 0.25;

const button =
  'rounded-lg px-2.5 py-1.5 font-bold ring-1 ring-slate-600 hover:bg-slate-700 aria-pressed:bg-white aria-pressed:text-slate-900 aria-pressed:ring-white';

/**
 * D4「手触り」の確認ページ。採用した組み合わせ（demo.ts の feelCombos）を、約60秒のデモ再生（demo.ts）か、
 * 実際のゲームを遊びながら確かめる。設定画面に残した「演出の強さ」の3段階は、再生中でもその場で切り替えられる。
 */
export function D4Explore() {
  const [mode, setMode] = createVariantSelection<ModeId>('d4mode', modeIds, 'demo');
  // 演出の強さは設定画面の選択肢として残した3段階を切り替える（設定に保存される）。モーションの性格と音色は採用した1つだけ
  const intensity = () => feelChoice().intensity;
  const motion = () => feelChoice().motion;
  const palette = () => audio.paletteId();
  const combo = () => matchCombo({ intensity: intensity(), motion: motion(), palette: palette() });
  const applyCombo = (id: FeelComboId) => {
    const c = feelCombos[id];
    selectFeel({ intensity: c.intensity, motion: c.motion });
    audio.setPalette(c.palette);
  };

  const [unlocked, setUnlocked] = createSignal(audio.unlocked());
  onMount(() => {
    const unlock = () => {
      audio.unlock();
      setTimeout(() => setUnlocked(audio.unlocked()), 100);
    };
    const opts = { capture: true } as const;
    window.addEventListener('pointerdown', unlock, opts);
    window.addEventListener('keydown', unlock, opts);
    const poll = setInterval(() => setUnlocked(audio.unlocked()), 500);
    onCleanup(() => {
      window.removeEventListener('pointerdown', unlock, opts);
      window.removeEventListener('keydown', unlock, opts);
      clearInterval(poll);
    });
  });
  createEffect(() => audio.setVolumes(settings().audio));

  const axis = <T extends string>(
    label: string,
    ids: readonly T[],
    selected: () => T,
    onSelect: (id: T) => void,
    name: (id: T) => string,
  ): JSX.Element => (
    <fieldset class="flex items-center gap-1" aria-label={label}>
      <span class="mr-1 text-xs font-bold text-slate-400">{label}</span>
      <For each={ids}>
        {(id) => (
          <button type="button" aria-pressed={selected() === id} class={button} onClick={() => onSelect(id)}>
            {name(id)}
          </button>
        )}
      </For>
    </fieldset>
  );

  return (
    <ExploreShell<FeelComboId | 'custom'>
      title={t.title}
      placement="top"
      options={feelComboIds.map((id) => ({ id, label: t.combos[id].name, aim: t.combos[id].aim }))}
      selected={combo() ?? 'custom'}
      onSelect={(id) => id !== 'custom' && applyCombo(id)}
      tweakOpen={false}
      onToggleTweak={() => {}}
      tweak={null}
      extra={
        <>
          {axis(
            t.axes.intensity,
            intensityIds,
            intensity,
            (id) => selectFeel({ intensity: id }),
            (id) => ja.fx.intensities[id],
          )}
          {axis(
            t.axes.motion,
            motionIds,
            motion,
            (id) => selectFeel({ motion: id }),
            (id) => ja.fx.motions[id],
          )}
          {axis(
            t.axes.palette,
            paletteIds,
            palette,
            (id) => audio.setPalette(id),
            (id) => ja.audio.palettes[id],
          )}
          {axis(t.modeGroup, modeIds, mode, setMode, (id) => t.modes[id])}
          <span
            class="rounded-lg px-2 py-1 text-xs font-bold ring-1"
            classList={{
              'text-emerald-300 ring-emerald-700': unlocked(),
              'bg-amber-300 text-slate-900 ring-amber-300': !unlocked(),
            }}
            title={t.soundHint}
          >
            {unlocked() ? t.soundOn : t.soundOff}
          </span>
          <span class="text-xs text-slate-400">{t.soundHint}</span>
          <Show when={combo() === null}>
            <p class="basis-full text-xs text-slate-300">{t.custom}</p>
          </Show>
          <ul class="basis-full text-xs leading-relaxed text-slate-300">
            <li>
              {ja.fx.intensities[intensity()]}：{t.aims.intensity[intensity()]}
            </li>
            <li>
              {ja.fx.motions[motion()]}：{t.aims.motion[motion()]}
            </li>
            <li>
              {ja.audio.palettes[palette()]}：{t.aims.palette[palette()]}
            </li>
          </ul>
        </>
      }
    >
      <Switch>
        <Match when={mode() === 'demo'}>
          <DemoStage />
        </Match>
        <Match when={mode() === 'play'}>
          {/* transform を付けて、ゲームの fixed の要素をこの領域の中に収める */}
          <div class="absolute inset-0 overflow-hidden" style={{ transform: 'translateZ(0)' }}>
            <App tweak={false} />
          </div>
        </Match>
      </Switch>
    </ExploreShell>
  );
}

/** 背景で仕事を流し続ける store（AI に任せた配置で進め、案件が終わったら最初に戻す） */
function createAmbientStore(): GameStore {
  const [state, setState] = createSignal<GameState>(demoInitialState('after'));
  const store: GameStore = {
    state,
    dispatch: (command) => setState(reduce(state(), command).state),
    advance: (minutes) => setState(step(state(), minutes).state),
    run: () => null,
    play: () => {},
    stop: () => {},
    onEvents: () => () => {},
  };
  let last: number | undefined;
  let frame = 0;
  const tick = (now: number) => {
    const dt = last === undefined ? 0 : Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
    last = now;
    if (isDemoDone(state())) setState(demoInitialState('after'));
    else store.advance(dt * DEMO_MINUTES_PER_SECOND * AMBIENT_SPEED);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  onCleanup(() => cancelAnimationFrame(frame));
  return store;
}

function DemoStage() {
  const store = createAmbientStore();
  const selection = createSelection();
  const [world, setWorld] = createSignal<{ world: World; vm: () => WorldViewModel }>();
  const [elapsed, setElapsed] = createSignal(0);
  const [playing, setPlaying] = createSignal(true);
  const [loop, setLoop] = createSignal(true);
  let host: FxHostApi | undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const tasks = getProject(DEMO_PROJECT).tasks;

  const islandAt = (i: number) => islandId(tasks[i % tasks.length]?.id ?? '');
  const human = () =>
    world()
      ?.vm()
      .actors.find((a) => a.kind === 'human')?.id;

  const fire = (beat: DemoBeat) => {
    const entityId = islandAt(beat.island);
    switch (beat.kind) {
      case 'select': {
        selection.dispatch({ type: 'SelectEntity', entityId });
        const id = setTimeout(() => {
          timers.delete(id);
          if (selection.selected() === entityId) selection.dispatch({ type: 'SelectEntity', entityId: null });
        }, SELECT_HOLD_MS);
        timers.add(id);
        return;
      }
      case 'taskStart':
        audio.play('taskStart');
        return;
      case 'reviewCatch':
      case 'incident':
      case 'autoRepair': {
        const actorId = human();
        host?.trigger([{ kind: beat.kind, entityId, ...(actorId ? { actorId } : {}) }]);
        return;
      }
      case 'projectComplete':
        host?.trigger([{ kind: 'projectComplete', entityId: null }]);
        return;
      default:
        host?.trigger([{ kind: beat.kind, entityId, ...(beat.amount !== undefined ? { amount: beat.amount } : {}) }]);
    }
  };

  onMount(() => {
    audio.setSong('play');
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
      last = now;
      if (!playing()) return;
      const prev = elapsed();
      let next = prev + dt;
      for (const beat of beatsBetween(demoTimeline, prev, Math.min(next, DEMO_SECONDS))) fire(beat);
      if (next >= DEMO_SECONDS) {
        if (loop()) next = 0;
        else {
          next = DEMO_SECONDS;
          setPlaying(false);
        }
      }
      setElapsed(next);
      audio.setMomentum(momentumAt(demoTimeline, next));
    }, TICK_MS);
    onCleanup(() => {
      clearInterval(timer);
      for (const id of timers) clearTimeout(id);
      audio.setSong(null);
      audio.setMomentum(0);
    });
    onCleanup(installUiSounds(document, (id) => audio.play(id)));
  });
  createEffect(() => audio.setPaused(!playing()));

  const restart = () => {
    setElapsed(0);
    setPlaying(true);
  };
  const current = () => {
    let last: DemoBeat | undefined;
    for (const b of demoTimeline) if (b.at <= elapsed()) last = b;
    return last;
  };

  return (
    // transform を付けて、演出の層（fixed）の基準をこの領域にし、文字が島の位置に出るようにする
    <div class="absolute inset-0 overflow-hidden bg-bg font-sans text-ink" style={{ transform: 'translateZ(0)' }}>
      <WorldCanvas
        store={store}
        projectId={DEMO_PROJECT}
        look={() => worldLooks[defaultWorldLookId]}
        selection={selection}
        onWorld={(w, vm) => setWorld({ world: w, vm })}
      />
      <FxHost
        store={store}
        projectId={null}
        world={() => world()?.world}
        vm={() => world()?.vm()}
        selection={selection}
        ref={(api) => {
          host = api;
        }}
      />
      <aside
        aria-label={t.timeline}
        class="absolute top-2 left-2 z-50 flex max-h-[calc(100%-1rem)] w-[min(19rem,calc(100%-1rem))] flex-col gap-2 rounded-xl bg-slate-900/90 p-3 text-sm text-slate-100 shadow-2xl ring-1 ring-white/10"
      >
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class={button}
            aria-pressed={playing()}
            onClick={() => (elapsed() >= DEMO_SECONDS ? restart() : setPlaying(!playing()))}
          >
            {playing() ? t.pause : t.play}
          </button>
          <button type="button" class={button} onClick={restart}>
            {t.restart}
          </button>
          <button type="button" class={button} aria-pressed={loop()} onClick={() => setLoop(!loop())}>
            {t.loop}
          </button>
          <span class="ml-auto font-mono text-xs tabular-nums text-slate-300">{t.time(elapsed(), DEMO_SECONDS)}</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-slate-700" aria-hidden="true">
          <div class="h-full bg-amber-300" style={{ width: `${(elapsed() / DEMO_SECONDS) * 100}%` }} />
        </div>
        <ol class="flex min-h-0 flex-col gap-0.5 overflow-y-auto text-xs">
          <For each={demoTimeline}>
            {(beat) => (
              <li
                class="flex items-center gap-2 rounded px-1.5 py-0.5"
                classList={{
                  'text-slate-500': beat.at > elapsed(),
                  'bg-white text-slate-900 font-bold': current() === beat,
                }}
              >
                <span class="w-10 shrink-0 font-mono tabular-nums">{beat.at.toFixed(1)}s</span>
                <span class="min-w-0 flex-1 truncate">{t.beats[beat.kind]}</span>
                <span class="shrink-0 rounded bg-slate-700 px-1.5 font-mono text-[10px] text-slate-100">
                  {t.tier(beatTier(beat))}
                </span>
              </li>
            )}
          </For>
        </ol>
      </aside>
    </div>
  );
}
