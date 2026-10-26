import { createMemo, createSignal, For, onCleanup, onMount } from 'solid-js';
import { layoutFormFor, MAX_HUD_ITEMS, uiLayout } from '../../../content/look/layout';
import { defaultWorldLookId, worldLooks } from '../../../content/look/world';
import { scoreProject } from '../../../core/scoring';
import { ja } from '../../../i18n/ja';
import { createSelection } from '../../../ui/selection';
import { WorldCanvas } from '../../../ui/WorldCanvas';
import { defaultWorkerFor } from '../../../view/project';
import type { WorldViewModel } from '../../../view/world';
import type { World } from '../../../world/index';
import { ExploreShell } from '../ExploreShell';
import { loadStored, readHashParam, resolveVariant, saveStored, writeHashParam } from '../persist';
import { DockLayout } from './DockLayout';
import type { Proto } from './parts';
import { createSandbox, hudValues, SANDBOX_PROJECT, sandboxBoosts, sandboxProblems } from './sandbox';

const t = ja.explore.d3;

/** 比較ページの案の切り替え。採用した1案だけを残している */
const ADOPTED = 'dock';

/** 比べる表示幅。PC は 1440×900、スマホは 375×812 の枠を、ページに収まるように縮小して表示する */
const devices = {
  wide: { width: 1440, height: 900 },
  compact: { width: 375, height: 812 },
} as const;
type DeviceId = keyof typeof devices;
const deviceIds = Object.keys(devices) as DeviceId[];

const STORAGE_DEVICE = 'explore:d3:device';

/**
 * D3「画面構成」の確認ページ。ワールドと遊び場（sandbox.ts）の上に、採用した構成（content/look/layout.ts）の
 * プロトタイプを重ねる。島を選ぶ → 詳細が出る → 担当を変える → 問題から島へ移動する、の一連の操作を
 * PC 幅とスマホ幅で試せる。
 */
export function D3Explore() {
  const [device, setDevice] = createSignal<DeviceId>(
    resolveVariant(deviceIds, readHashParam(location.hash, 'device'), loadStored(STORAGE_DEVICE), 'wide'),
  );
  const chooseDevice = (id: DeviceId) => {
    setDevice(id);
    saveStored(STORAGE_DEVICE, id);
    history.replaceState(null, '', writeHashParam(location.hash, 'device', id));
  };

  const sandbox = createSandbox();
  const selection = createSelection();
  const [world, setWorld] = createSignal<{ world: World; vm: () => WorldViewModel }>();
  const vm = createMemo(() => world()?.vm());

  const size = () => devices[device()];
  const layout = createMemo(() => layoutFormFor(uiLayout, size().width));
  const hud = createMemo(() =>
    hudValues(
      sandbox.store.state(),
      vm(),
      scoreProject(sandbox.store.state(), SANDBOX_PROJECT)?.profitPerHumanHour ?? 0,
    ),
  );
  // 中身が同じなら同じ配列を返し、問題の表示を毎フレーム作り直さない
  const problems = createMemo(() => sandboxProblems(sandbox.store.state(), vm()), [], {
    equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });

  const select = (entityId: string | null) => selection.dispatch({ type: 'SelectEntity', entityId });
  const proto: Proto = {
    store: sandbox.store,
    layout: uiLayout,
    form: () => layout().form,
    compact: () => layout().compact,
    size,
    world: () => world()?.world,
    vm,
    selection,
    hud,
    problems,
    select,
    goTo(entityId, offset) {
      select(entityId);
      world()?.world.focus(entityId, offset, uiLayout.flow.focusZoom);
    },
    assign(taskId, mode) {
      sandbox.store.dispatch({
        type: 'AssignTask',
        projectId: SANDBOX_PROJECT,
        taskId,
        mode,
        workerId: defaultWorkerFor(mode),
      });
      if (!uiLayout.flow.keepDetailAfterAssign) select(null);
    },
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  // 枠を、使える領域に収まる倍率で縮小する
  let stage!: HTMLDivElement;
  const [room, setRoom] = createSignal({ width: 1, height: 1 });
  onMount(() => {
    const ro = new ResizeObserver(() => setRoom({ width: stage.clientWidth, height: stage.clientHeight }));
    ro.observe(stage);
    onCleanup(() => ro.disconnect());
  });
  const scale = () => Math.min(1, (room().width - 16) / size().width, (room().height - 16) / size().height);

  const button =
    'rounded-lg px-2.5 py-1.5 font-bold ring-1 ring-slate-600 hover:bg-slate-700 aria-pressed:bg-white aria-pressed:text-slate-900 aria-pressed:ring-white';
  const hudCount = () => layout().form.dock.items.length;

  return (
    <ExploreShell
      title={t.title}
      placement="top"
      options={[{ id: ADOPTED, label: t.adopted.name, aim: t.adopted.aim }]}
      selected={ADOPTED}
      onSelect={() => {}}
      tweakOpen={false}
      onToggleTweak={() => {}}
      tweak={null}
      extra={
        <>
          <fieldset class="flex gap-1" aria-label={t.device.group}>
            <For each={deviceIds}>
              {(id) => (
                <button type="button" aria-pressed={device() === id} class={button} onClick={() => chooseDevice(id)}>
                  {t.device[id]}
                </button>
              )}
            </For>
          </fieldset>
          <fieldset class="flex gap-1" aria-label={t.boostGroup}>
            <For each={sandboxBoosts}>
              {(b) => (
                <button
                  type="button"
                  aria-pressed={sandbox.boost() === b}
                  class={button}
                  onClick={() => sandbox.setBoost(b)}
                >
                  {t.boost(b)}
                </button>
              )}
            </For>
          </fieldset>
          <button
            type="button"
            class={button}
            onClick={() => {
              select(null);
              sandbox.reset();
            }}
          >
            {t.reset}
          </button>
          <span
            class="rounded-lg px-2 py-1 text-xs font-bold ring-1"
            classList={{
              'text-emerald-300 ring-emerald-700': hudCount() <= MAX_HUD_ITEMS,
              'text-rose-300 ring-rose-700': hudCount() > MAX_HUD_ITEMS,
            }}
          >
            {t.hudCount(hudCount(), MAX_HUD_ITEMS)}
          </span>
          <span class="text-xs text-slate-400">{t.flowHint}</span>
        </>
      }
    >
      <div ref={stage} class="absolute inset-0 flex items-center justify-center overflow-hidden">
        <div
          class="relative shrink-0 overflow-hidden rounded-lg bg-bg font-sans text-ink shadow-2xl ring-4 ring-slate-700"
          style={{
            width: `${size().width}px`,
            height: `${size().height}px`,
            transform: `scale(${scale()})`,
          }}
        >
          <WorldCanvas
            store={sandbox.store}
            projectId={SANDBOX_PROJECT}
            look={() => worldLooks[defaultWorldLookId]}
            selection={selection}
            onWorld={(w, v) => setWorld({ world: w, vm: v })}
          />
          <DockLayout proto={proto} />
        </div>
      </div>
    </ExploreShell>
  );
}
