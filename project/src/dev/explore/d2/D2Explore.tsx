import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { defaultWorldLookId, type WorldLook, worldLooks } from '../../../content/look/world';
import { ja } from '../../../i18n/ja';
import { createSelection } from '../../../ui/selection';
import { WorldCanvas } from '../../../ui/WorldCanvas';
import { clockView } from '../../../view/clock';
import { describeEntity, type WorldViewModel } from '../../../view/world';
import type { RenderStats, World } from '../../../world/index';
import { worldTweakGroups } from '../../world/fields';
import { ExploreShell } from '../ExploreShell';
import { TweakPanel } from '../TweakPanel';
import { getPath, setPath } from '../tweak';
import { createDemoPlayer, DEMO_PROJECT, demoSpeeds } from './demo';

const t = ja.explore.d2;

/**
 * D2「2.5Dの見せ方」の確認ページ。採用した見た目（content/look/world.ts の既定値）のワールドを
 * デモ再生で動かし、描画負荷を表示する。調整パネルで値を変えて試せる
 */
export function D2Explore(props: { tweak: boolean }) {
  const [tweaked, setTweaked] = createSignal<WorldLook | null>(null);
  const [tweakOpen, setTweakOpen] = createSignal(props.tweak);
  const look = createMemo(() => tweaked() ?? worldLooks[defaultWorldLookId]);

  const demo = createDemoPlayer();
  const picked = createSelection();
  const [world, setWorld] = createSignal<{ world: World; vm: () => WorldViewModel }>();
  const [stats, setStats] = createSignal<RenderStats | null>(null);
  const timer = setInterval(() => {
    const s = world()?.world.stats;
    if (s) setStats({ ...s });
  }, 500);
  onCleanup(() => clearInterval(timer));

  const clock = createMemo(() => clockView(demo.store.state().clock));
  const bottleneck = createMemo(() => {
    const w = world();
    const bn = w?.vm().bottleneck;
    if (!w || !bn) return null;
    const label = describeEntity(w.vm(), bn.entityId)?.label ?? '';
    return t.demo.bottleneck(label, Math.round(bn.intensity * 100));
  });

  const button =
    'rounded-lg px-2 py-1 font-bold ring-1 ring-slate-600 hover:bg-slate-700 aria-pressed:bg-white aria-pressed:text-slate-900 aria-pressed:ring-white';

  return (
    <ExploreShell
      title={t.title}
      options={[{ id: defaultWorldLookId, label: t.adopted.name, aim: t.adopted.aim }]}
      selected={defaultWorldLookId}
      onSelect={() => setTweaked(null)}
      tweakOpen={tweakOpen()}
      onToggleTweak={() => setTweakOpen((v) => !v)}
      tweak={
        <TweakPanel
          value={look()}
          groups={worldTweakGroups}
          onChange={(path, value) => {
            const typed = typeof getPath(look(), path) === 'boolean' ? value === 'true' : value;
            setTweaked(setPath(look(), path, typed));
          }}
          onReset={() => setTweaked(null)}
          onClose={() => setTweakOpen(false)}
        />
      }
    >
      <main class="fixed inset-0 overflow-hidden bg-bg text-ink">
        <WorldCanvas
          store={demo.store}
          projectId={DEMO_PROJECT}
          look={look}
          selection={picked}
          onWorld={(w, vm) => setWorld({ world: w, vm })}
        />
        <section
          aria-label={t.demo.title}
          class="fixed top-2 left-2 z-40 w-[min(26rem,calc(100vw-1rem))] rounded-2xl bg-slate-900/90 p-3 font-sans text-xs text-slate-100 shadow-xl"
        >
          <h2 class="mb-2 text-sm font-bold">{t.demo.title}</h2>
          <div class="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              class="rounded-lg bg-white px-3 py-1 font-bold text-slate-900"
              onClick={() => (demo.playing() ? demo.pause() : demo.play())}
            >
              {demo.playing() ? t.demo.pause : t.demo.play}
            </button>
            <button type="button" class={button} onClick={() => demo.restart()}>
              {t.demo.restart}
            </button>
            <fieldset class="flex gap-1" aria-label={t.demo.speedGroup}>
              <For each={demoSpeeds}>
                {(s) => (
                  <button
                    type="button"
                    aria-pressed={demo.speed() === s}
                    class={button}
                    onClick={() => demo.setSpeed(s)}
                  >
                    {t.demo.speed(s)}
                  </button>
                )}
              </For>
            </fieldset>
          </div>
          <p class="mt-2 font-bold">{t.demo.scenes[demo.scene()]}</p>
          <p class="mt-1 font-mono tabular-nums text-slate-300">
            {t.demo.clock(clock().day, clock().time)}
            <Show when={demo.holding()}> · {t.demo.next}</Show>
          </p>
          <p class="mt-1 text-rose-200" aria-live="polite">
            {bottleneck() ?? t.demo.noBottleneck}
          </p>
        </section>
        <Show when={stats()}>
          {(s) => (
            <section
              aria-label={t.stats.title}
              class="fixed bottom-2 left-2 z-40 hidden rounded-2xl bg-slate-900/90 p-3 font-sans text-xs text-slate-100 shadow-xl sm:block"
            >
              <h2 class="mb-1 text-sm font-bold">{t.stats.title}</h2>
              <dl class="grid grid-cols-[auto_auto] gap-x-4 font-mono tabular-nums">
                <dt class="font-sans text-slate-400">{t.stats.drawCalls}</dt>
                <dd>{s().drawCalls}</dd>
                <dt class="font-sans text-slate-400">{t.stats.triangles}</dt>
                <dd>{s().triangles.toLocaleString()}</dd>
                <dt class="font-sans text-slate-400">{t.stats.cpu}</dt>
                <dd>{t.stats.ms(s().cpuMs)}</dd>
                <dt class="font-sans text-slate-400">{t.stats.interval}</dt>
                <dd>{t.stats.ms(s().intervalMs)}</dd>
              </dl>
              <p class="mt-1 max-w-[18rem] text-[10px] leading-snug text-slate-400">{t.stats.note}</p>
            </section>
          )}
        </Show>
      </main>
    </ExploreShell>
  );
}
