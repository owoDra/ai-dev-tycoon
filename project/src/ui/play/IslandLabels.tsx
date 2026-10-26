import { Index, onCleanup, onMount, Show } from 'solid-js';
import { ja } from '../../i18n/ja';
import type { IslandView } from '../../view/world';
import type { World } from '../../world/index';
import { Icon } from '../Icon';
import { StatusIcon } from '../parts';

/**
 * 島の上に重ねる名前と状態アイコン（DOM のオーバーレイ。位置は world.project で 3D から求める）。
 * ラベルはボタンなので、Tab で島を順にたどって Enter で選べる（キーボードだけで遊ぶための入口）。
 * 島の並びは変わらないので Index で位置ごとに使い回し、フォーカスを保つ。
 * 位置はカメラの移動に追従させるため毎フレーム更新するが、DOM は transform だけを書き換える。
 */
export function IslandLabels(props: {
  world: World;
  islands: readonly IslandView[];
  selected: string | null;
  /** スマホ幅では島が小さく重なりやすいので、名前を隠して状態アイコンだけにする（選んだ島は名前も出す） */
  compact: boolean;
  onSelect: (entityId: string) => void;
}) {
  const els = new Map<string, HTMLButtonElement>();
  let frame = 0;
  onMount(() => {
    const tick = () => {
      for (const [id, el] of els) {
        const p = props.world.project(id);
        const shown = p?.visible ?? false;
        el.style.visibility = shown ? 'visible' : 'hidden';
        if (p && shown)
          el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
  onCleanup(() => cancelAnimationFrame(frame));

  return (
    <div class="pointer-events-none absolute inset-0 overflow-hidden" data-island-labels>
      <Index each={props.islands}>
        {(island) => (
          <button
            ref={(el) => els.set(island().id, el)}
            type="button"
            data-island={island().id}
            aria-label={`${island().label}（${ja.project.status[island().status]}${island().isBottleneck ? `・${ja.world.bottleneck}` : ''}）`}
            aria-pressed={props.selected === island().id}
            class="pointer-events-auto absolute top-0 left-0 flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-full border-2 border-line bg-surface/95 px-2 text-xs font-bold whitespace-nowrap shadow-pop aria-pressed:bg-accent-300"
            style={{ visibility: 'hidden' }}
            onClick={() => props.onSelect(island().id)}
          >
            <StatusIcon status={island().status} />
            <Show when={!props.compact || props.selected === island().id}>
              <span>{island().label}</span>
            </Show>
            <Show when={island().isBottleneck}>
              <Icon name="bottleneck" tone="danger" class="text-sm" />
            </Show>
          </button>
        )}
      </Index>
    </div>
  );
}
