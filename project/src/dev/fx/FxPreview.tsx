import { createSignal, For, onCleanup, Show } from 'solid-js';
import { type MotionPreference, motionPreferences, settings, updateSettings } from '../../app/settings';
import { createGameStore } from '../../app/store';
import { type FxId, fxTable } from '../../content/fx';
import { content } from '../../content/index';
import { type FeelId, feelPresets } from '../../content/look/feel';
import { defaultWorldLookId, worldLooks } from '../../content/look/world';
import { createInitialState } from '../../core/state';
import { feelId, selectFeelPreset } from '../../fx/feel';
import { reducedMotion } from '../../fx/reduced';
import { ja } from '../../i18n/ja';
import { FxHost, type FxHostApi } from '../../ui/fx/FxHost';
import { Num } from '../../ui/Num';
import { createSelection } from '../../ui/selection';
import { WorldCanvas } from '../../ui/WorldCanvas';
import type { FxSignal } from '../../view/fx';
import type { WorldViewModel } from '../../view/world';
import type { World } from '../../world/index';
import { PARTICLE_TOTAL } from '../../world/vfx/particles';

const t = ja.fx.preview;
/** 自動化の演出で見せる数字（企画書43章の例） */
const SAMPLE_HOURS = 6.4;
/** コンボのボタンで続ける Task 完了の数と間隔（ms） */
const COMBO_COUNT = 6;
const COMBO_GAP = 350;
/** 「順に再生」の間隔（ms） */
const SEQUENCE_GAP = 1600;

/**
 * 演出のプレビュー（`?dev=fx`）。本物のワールドと FxHost の上で、すべての演出をボタンで発火して確かめる。
 * ゲームの state は変えず、FxSignal を直接 director に流す（島の選択だけは本物の選択操作で Tier 0 を起こす）。
 * 演出中もワールドのドラッグ・ズーム・選択と、このパネルのボタンはすべて操作できる。
 */
export function FxPreview() {
  const projectId = content.projects[0]?.id ?? '';
  const store = createGameStore(createInitialState('fx-preview'));
  store.dispatch({ type: 'StartProject', projectId });
  const selection = createSelection();
  const [world, setWorld] = createSignal<{ world: World; vm: () => WorldViewModel }>();
  const [money, setMoney] = createSignal(12000);
  const [particles, setParticles] = createSignal(0);
  const look = () => worldLooks[defaultWorldLookId];
  let host: FxHostApi | undefined;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const poll = setInterval(() => setParticles(world()?.world.particleCount() ?? 0), 250);
  onCleanup(() => {
    clearInterval(poll);
    for (const id of timers) clearTimeout(id);
  });

  const islands = () => world()?.vm().islands ?? [];
  /** パネルに隠れないよう、中ほどの島から順に使う */
  const island = (i: number) => {
    const list = islands();
    return list[(Math.floor(list.length / 2) + i) % Math.max(1, list.length)]?.id ?? null;
  };
  const human = () =>
    world()
      ?.vm()
      .actors.find((a) => a.kind === 'human')?.id;

  const fire = (id: FxId, n = 0) => {
    const entityId = island(n);
    const signal = (): FxSignal | null => {
      switch (id) {
        case 'islandSelect':
          selection.dispatch({ type: 'SelectEntity', entityId });
          return null;
        case 'taskDone':
          setMoney((m) => m + 1800);
          return { kind: 'taskDone', entityId };
        case 'taskDefect':
          setMoney((m) => m - 900);
          return { kind: 'taskDefect', entityId };
        case 'reviewCatch': {
          const actorId = human();
          return { kind: 'reviewCatch', entityId, ...(actorId ? { actorId } : {}) };
        }
        case 'bottleneckCleared':
          return { kind: 'bottleneckCleared', entityId };
        case 'automation':
          return { kind: 'automation', entityId, amount: SAMPLE_HOURS };
        case 'projectComplete':
          return { kind: 'projectComplete', entityId: null };
      }
    };
    const s = signal();
    if (s) host?.trigger([s]);
  };

  const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
  const combo = () => {
    for (let i = 0; i < COMBO_COUNT; i++) later(i * COMBO_GAP, () => fire('taskDone', i));
  };
  const sequence = () => {
    fxTable.forEach((def, i) => {
      later(i * SEQUENCE_GAP, () => fire(def.id, i));
    });
  };

  return (
    <main class="fixed inset-0 overflow-hidden bg-bg font-sans text-ink">
      <WorldCanvas
        store={store}
        projectId={projectId}
        look={look}
        selection={selection}
        onWorld={(w, vm) => setWorld({ world: w, vm })}
      />
      <FxHost
        store={store}
        projectId={projectId}
        world={() => world()?.world}
        vm={() => world()?.vm()}
        selection={selection}
        ref={(api) => {
          host = api;
        }}
      />
      <aside
        aria-label={t.title}
        class="absolute top-2 left-2 z-50 flex max-h-[calc(100vh-1rem)] w-[min(24rem,calc(100vw-1rem))] flex-col gap-3 overflow-y-auto rounded-lg border-[3px] border-line bg-surface p-3 shadow-pop"
      >
        <header>
          <h1 class="font-heading text-xl">{t.title}</h1>
          <p class="text-xs text-ink-muted">{t.lead}</p>
        </header>
        <ul class="flex flex-col gap-1.5">
          <For each={fxTable}>
            {(def) => (
              <li>
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded-md border-[3px] border-line bg-surface px-2 py-1.5 text-left shadow-pop transition-transform hover:bg-sunken active:translate-y-1 active:shadow-none"
                  onClick={() => fire(def.id)}
                >
                  <span class="rounded-full bg-accent-300 px-2 font-heading text-xs whitespace-nowrap text-on-accent">
                    {t.tier(def.tier)}
                  </span>
                  <span class="flex min-w-0 flex-col">
                    <span class="font-bold">{t.ids[def.id]}</span>
                    <span class="truncate font-mono text-[10px] text-ink-muted">
                      {(reducedMotion() ? def.reducedAlternative : def.parts).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
        <div class="flex flex-wrap gap-1.5">
          <button
            type="button"
            class="rounded-md border-[3px] border-line bg-accent-400 px-2 py-1 font-bold"
            onClick={combo}
          >
            {t.combo}
          </button>
          <button
            type="button"
            class="rounded-md border-[3px] border-line bg-primary-200 px-2 py-1 font-bold"
            onClick={sequence}
          >
            {t.all}
          </button>
        </div>
        <p class="flex items-center gap-2 text-sm font-bold">
          {ja.score.profit}
          <Num value={money()} format={ja.score.yen} />
        </p>
        <fieldset class="flex flex-col gap-1">
          <legend class="text-xs font-bold">{t.motion}</legend>
          <div class="flex flex-wrap gap-1">
            <For each={motionPreferences}>
              {(pref: MotionPreference) => (
                <button
                  type="button"
                  aria-pressed={settings().motion === pref}
                  class="rounded-md border-2 border-line/30 px-2 py-0.5 text-xs font-bold aria-pressed:border-line aria-pressed:bg-accent-200"
                  onClick={() => updateSettings({ motion: pref })}
                >
                  {ja.settings.motionOptions[pref]}
                </button>
              )}
            </For>
          </div>
        </fieldset>
        <fieldset class="flex flex-col gap-1">
          <legend class="text-xs font-bold">{t.feel}</legend>
          <div class="flex flex-wrap gap-1">
            <For each={Object.keys(feelPresets) as FeelId[]}>
              {(id) => (
                <button
                  type="button"
                  aria-pressed={feelId() === id}
                  class="rounded-md border-2 border-line/30 px-2 py-0.5 text-xs font-bold aria-pressed:border-line aria-pressed:bg-accent-200"
                  onClick={() => selectFeelPreset(id)}
                >
                  {ja.fx.feels[id]}
                </button>
              )}
            </For>
          </div>
        </fieldset>
        <Show when={world()}>
          <p class="font-mono text-[10px] text-ink-muted">{t.particles(particles(), PARTICLE_TOTAL)}</p>
        </Show>
      </aside>
    </main>
  );
}
