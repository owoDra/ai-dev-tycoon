import { type Accessor, createEffect, createSignal, on, onCleanup, onMount, Show } from 'solid-js';
import type { GameStore } from '../app/store';
import { visual } from '../content/look/visual';
import type { WorldLook } from '../content/look/world';
import { reducedMotion } from '../fx/reduced';
import { ja } from '../i18n/ja';
import { type WorldViewModel, worldView } from '../view/world';
import { createWorld, type World } from '../world/index';
import type { Selection } from './selection';

/**
 * 2.5D ワールドのキャンバス。store の state を WorldViewModel にしてワールドへ渡し、
 * クリックによる選択を Selection に送る。ワールドは state を読むだけで変えない。
 */
export function WorldCanvas(props: {
  store: GameStore;
  /** 映す案件。null なら会社のオフィス（ホーム） */
  projectId: string | null;
  look: Accessor<WorldLook>;
  selection: Selection;
  onWorld?: (world: World, vm: Accessor<WorldViewModel>) => void;
}) {
  let canvas!: HTMLCanvasElement;
  const [status, setStatus] = createSignal<'loading' | 'ready' | 'error'>('loading');
  const vm = () => worldView(props.store.state(), props.projectId, props.look());

  onMount(() => {
    let world: World;
    try {
      world = createWorld(canvas, {
        look: props.look(),
        visual,
        reducedMotion,
        onSelect: (command) => props.selection.dispatch(command),
      });
    } catch (e) {
      console.error(e);
      setStatus('error');
      return;
    }
    world.ready.then(
      () => setStatus('ready'),
      (e: unknown) => {
        console.error(e);
        setStatus('error');
      },
    );
    createEffect(() => world.setViewModel(vm()));
    createEffect(on(props.look, (look) => world.setLook(look), { defer: true }));
    createEffect(() => world.setSelected(props.selection.selected()));
    createEffect(on(reducedMotion, () => world.redraw(), { defer: true }));
    props.onWorld?.(world, vm);
    onCleanup(() => world.dispose());
  });

  return (
    <div class="absolute inset-0">
      <canvas ref={canvas} class="block size-full" role="img" aria-label={ja.world.label} />
      <Show when={status() !== 'ready'}>
        <p class="pointer-events-none absolute inset-0 flex items-center justify-center text-lg font-bold text-ink">
          {status() === 'error' ? ja.world.error : ja.world.loading}
        </p>
      </Show>
    </div>
  );
}
