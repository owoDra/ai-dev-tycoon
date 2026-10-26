import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { settings } from '../../app/settings';
import { audio } from '../../audio/index';
import { activeLayers } from '../../audio/music/intensity';
import { type SoundPaletteId, soundPalettes } from '../../content/look/sound';
import { type MusicLayerId, musicStageThresholds, type SongId, songs } from '../../content/music';
import { type SfxBus, type SfxId, sfxCatalog } from '../../content/sfx';
import { ja } from '../../i18n/ja';
import { installUiSounds } from '../../ui/audio/uiSounds';

const t = ja.audio.test;
const BUSES: readonly SfxBus[] = ['ui', 'sfx'];
const STAGES = musicStageThresholds.map((_, i) => i);
const card = 'rounded-lg border-[3px] border-line bg-surface p-3 shadow-pop';
const chip =
  'rounded-md border-[3px] border-line bg-surface px-2 py-1 text-left shadow-pop transition-transform hover:bg-sunken active:translate-y-1 active:shadow-none';

/**
 * サウンドテスト（`?dev=audio`）。すべての効果音と BGM の各レイヤーを試聴する。
 * 音色のパレットを切り替えると、効果音も BGM も同じ譜面のまま音色だけが変わる（D4 の比較に使う）。
 */
export function SoundTest() {
  const [combo, setCombo] = createSignal(2);
  const [song, setSong] = createSignal<SongId | null>(null);
  const [stage, setStage] = createSignal<number | null>(null);
  const [momentum, setMomentum] = createSignal(0);
  const [paused, setPaused] = createSignal(false);
  const [muted, setMuted] = createSignal<ReadonlySet<MusicLayerId>>(new Set());
  const [palette, setPalette] = createSignal<SoundPaletteId>(audio.paletteId());
  const [live, setLive] = createSignal({ unlocked: false, stage: 0, momentum: 0, baked: [] as readonly SfxId[] });

  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });
  onCleanup(() => window.removeEventListener('pointerdown', unlock, { capture: true }));
  onCleanup(installUiSounds(document, (id) => audio.play(id)));
  const poll = setInterval(
    () =>
      setLive({
        unlocked: audio.unlocked(),
        stage: audio.music()?.stage() ?? 0,
        momentum: audio.music()?.momentum() ?? 0,
        baked: audio.prerendered(),
      }),
    200,
  );
  onCleanup(() => {
    clearInterval(poll);
    audio.setSong(null);
  });

  createEffect(() => audio.setVolumes(settings().audio));
  createEffect(() => audio.setSong(song()));
  createEffect(() => audio.forceStage(stage()));
  createEffect(() => audio.setMomentum(momentum()));
  createEffect(() => audio.setPaused(paused()));
  createEffect(() => audio.muteLayers(muted()));
  createEffect(() => audio.setPalette(palette()));

  const shownStage = () => stage() ?? live().stage;
  const current = () => {
    const id = song();
    return id ? songs[id] : null;
  };
  const toggleLayer = (id: MusicLayerId) =>
    setMuted((m) => {
      const next = new Set(m);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <main class="min-h-screen bg-bg p-4 font-sans text-ink">
      <div class="mx-auto flex max-w-5xl flex-col gap-4">
        <header class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 class="font-heading text-2xl">{t.title}</h1>
            <p class="text-sm text-ink-muted">{t.lead}</p>
          </div>
          <Show when={!live().unlocked}>
            <button type="button" class={chip} onClick={unlock}>
              {t.unlock}
            </button>
          </Show>
        </header>

        <section class={`${card} flex flex-wrap items-center gap-3`}>
          <span class="font-bold">{t.palette}</span>
          <For each={Object.keys(soundPalettes) as SoundPaletteId[]}>
            {(id) => (
              <label class="flex items-center gap-2">
                <input type="radio" name="palette" checked={palette() === id} onChange={() => setPalette(id)} />
                {ja.audio.palettes[id]}
              </label>
            )}
          </For>
        </section>

        <section class={card}>
          <h2 class="mb-2 font-heading text-xl">{t.sfx}</h2>
          <For each={BUSES}>
            {(bus) => (
              <div class="mb-3">
                <h3 class="mb-1 text-sm font-bold text-ink-muted">{t.bus[bus]}</h3>
                <ul class="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2">
                  <For each={sfxCatalog.filter((d) => d.bus === bus)}>
                    {(def) => (
                      <li>
                        <button
                          type="button"
                          class={`${chip} flex w-full flex-col`}
                          onClick={() => audio.play(def.id, { combo: combo() })}
                        >
                          <span class="font-bold">{ja.audio.sfxNames[def.id]}</span>
                          <span class="font-mono text-[10px] text-ink-muted">
                            {def.id} · Tier {def.tier} · {t.layers(def.layers.length)}
                            <Show when={live().baked.includes(def.id)}> · {t.prerendered}</Show>
                          </span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            )}
          </For>
          <label class="flex items-center gap-2 text-sm">
            {t.combo}
            <input
              type="range"
              min="2"
              max="14"
              value={combo()}
              onInput={(e) => setCombo(e.currentTarget.valueAsNumber)}
            />
            <span class="font-mono">×{combo()}</span>
          </label>
        </section>

        <section class={`${card} flex flex-col gap-3`}>
          <h2 class="font-heading text-xl">{t.music}</h2>
          <div class="flex flex-wrap items-center gap-3">
            <span class="font-bold">{t.song}</span>
            <For each={Object.keys(songs) as SongId[]}>
              {(id) => (
                <label class="flex items-center gap-2">
                  <input type="radio" name="song" checked={song() === id} onChange={() => setSong(id)} />
                  {t.songs[id]}
                </label>
              )}
            </For>
            <button type="button" class={chip} onClick={() => setSong(null)}>
              {t.stop}
            </button>
            <label class="flex items-center gap-2">
              <input type="checkbox" checked={paused()} onChange={(e) => setPaused(e.currentTarget.checked)} />
              {t.paused}
            </label>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-2">
              <input type="radio" name="stage" checked={stage() === null} onChange={() => setStage(null)} />
              {t.auto}
            </label>
            <For each={STAGES}>
              {(s) => (
                <label class="flex items-center gap-2">
                  <input type="radio" name="stage" checked={stage() === s} onChange={() => setStage(s)} />
                  {t.stage(s)}
                </label>
              )}
            </For>
          </div>
          <label class="flex items-center gap-2 text-sm">
            {t.momentum}
            <input
              type="range"
              min="0"
              max="100"
              value={momentum() * 100}
              disabled={stage() !== null}
              onInput={(e) => setMomentum(e.currentTarget.valueAsNumber / 100)}
            />
            <span class="font-mono">
              {live().momentum.toFixed(2)} → {t.stage(shownStage())}
            </span>
          </label>
          <Show when={current()}>
            {(s) => (
              <ul class="flex flex-col gap-1">
                <For each={s().layers}>
                  {(layer) => (
                    <li class="flex items-center gap-3">
                      <label class="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!muted().has(layer.id)}
                          onChange={() => toggleLayer(layer.id)}
                        />
                        <span class="w-40 font-bold">{ja.audio.layerNames[layer.id]}</span>
                      </label>
                      <span class="font-mono text-xs text-ink-muted">
                        {layer.voice} · {t.stage(layer.fromStage)}〜
                      </span>
                      <span
                        class="rounded-full px-2 text-xs font-bold"
                        classList={{
                          'bg-accent-300 text-on-accent': activeLayers(s(), shownStage()).includes(layer.id),
                          'bg-sunken text-ink-muted': !activeLayers(s(), shownStage()).includes(layer.id),
                        }}
                      >
                        {activeLayers(s(), shownStage()).includes(layer.id) ? 'ON' : 'OFF'}
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            )}
          </Show>
        </section>
      </div>
    </main>
  );
}
