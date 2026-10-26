import { createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import type { TutorialHighlight } from '../../content/types';
import { currentTutorialStep, resolveSay } from '../../core/tutorial';
import { reducedMotion } from '../../fx/reduced';
import { ja } from '../../i18n/ja';
import { islandId } from '../../view/world';
import { panel, smallButton } from '../parts';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** 吹き出しの幅（px）と、照らす場所との間隔（px） */
const BUBBLE_WIDTH = 340;
const BUBBLE_GAP = 14;

/**
 * 照らす DOM 要素を探す。その Task の詳細シートが開いていれば担当カード（mode があればその1枚）、
 * 閉じていればワールドの島のラベル。見つからなければ null
 */
export function findHighlight(root: ParentNode, h: TutorialHighlight): Element | null {
  const sheet = root.querySelector(`[data-detail-sheet][data-task="${h.taskId}"]`);
  if (sheet) return sheet.querySelector(h.mode ? `[data-mode="${h.mode}"]` : '[data-assign-cards]');
  return root.querySelector(`[data-island="${islandId(h.taskId)}"]`);
}

/**
 * チュートリアルのコーチマーク（企画書50章）。今のステップの照らす場所を丸く切り抜いたスポットライトと、短い吹き出しを出す。
 * 「次へ」ボタンはなく、操作すればステップが進む（進行は core が判定する）。スキップは SkipTutorial の Command。
 * スポットライトも吹き出しの外も押せる（pointer-events: none）ので、操作を妨げない。
 */
export function TutorialCoach(props: { store: GameStore; padding: number }) {
  const step = createMemo(() => currentTutorialStep(props.store.state()));
  const say = createMemo(() => {
    const s = step();
    return s ? ja.tutorial.say[resolveSay(props.store.state(), s.say)] : null;
  });

  const [box, setBox] = createSignal<Box | null>(null);
  let frame = 0;
  // 照らす場所はカメラの移動やシートの開閉で動くので、フレームごとに測り直す（変わったときだけ更新する）
  const measure = () => {
    const h = step()?.highlight;
    const r = h ? findHighlight(document, h)?.getBoundingClientRect() : undefined;
    const pad = props.padding;
    const next =
      r && r.width > 0 ? { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 } : null;
    const prev = box();
    if (prev?.x !== next?.x || prev?.y !== next?.y || prev?.w !== next?.w || prev?.h !== next?.h) setBox(next);
    frame = requestAnimationFrame(measure);
  };
  onMount(() => {
    frame = requestAnimationFrame(measure);
  });
  onCleanup(() => cancelAnimationFrame(frame));

  /** 吹き出しの位置。照らす場所があれば、その下（入らなければ上）に寄せる。なければ画面の上部中央 */
  const bubbleStyle = () => {
    const b = box();
    const width = Math.min(BUBBLE_WIDTH, window.innerWidth - 16);
    if (!b) return { width: `${width}px`, left: `calc(50% - ${width / 2}px)`, top: '16px' };
    const left = Math.min(Math.max(8, b.x + b.w / 2 - width / 2), window.innerWidth - width - 8);
    const below = b.y + b.h + BUBBLE_GAP;
    return below + 140 < window.innerHeight
      ? { width: `${width}px`, left: `${left}px`, top: `${below}px` }
      : { width: `${width}px`, left: `${left}px`, bottom: `${window.innerHeight - b.y + BUBBLE_GAP}px` };
  };

  return (
    <Show when={step()}>
      <div class="pointer-events-none absolute inset-0 z-20" data-tutorial-coach>
        <Show when={box()}>
          {(b) => (
            <div
              data-coach-spotlight
              aria-hidden="true"
              class="absolute rounded-full border-4 border-accent-400"
              classList={{ 'transition-all duration-300 ease-out': !reducedMotion() }}
              style={{
                left: `${b().x}px`,
                top: `${b().y}px`,
                width: `${b().w}px`,
                height: `${b().h}px`,
                'box-shadow': '0 0 0 9999px rgb(15 23 42 / 0.42)',
              }}
            />
          )}
        </Show>
        <section
          role="status"
          aria-label={ja.tutorial.label}
          data-coach-bubble
          class={`${panel} pointer-events-auto absolute flex flex-col gap-1.5 px-4 py-3`}
          style={bubbleStyle()}
        >
          <div class="flex items-center justify-between gap-2">
            <span class="rounded-full border-2 border-line bg-accent-200 px-2 text-[11px] font-bold">
              {ja.tutorial.label}
            </span>
            <button
              type="button"
              class={smallButton}
              data-coach-skip
              onClick={() => props.store.dispatch({ type: 'SkipTutorial' })}
            >
              {ja.tutorial.skip}
            </button>
          </div>
          <p class="text-sm font-bold leading-snug">{say()}</p>
        </section>
      </div>
    </Show>
  );
}
