import { createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import type { GuideSpot, TutorialHighlight } from '../../content/types';
import { currentGuideStep } from '../../core/guides';
import { currentTutorialStep, resolveSay } from '../../core/tutorial';
import { reducedMotion } from '../../fx/reduced';
import { ja } from '../../i18n/ja';
import { islandId } from '../../view/world';
import { panel, primaryButton, smallButton } from '../parts';

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
  if (h.kind === 'nextDay') return root.querySelector('[data-next-day]');
  const sheet = root.querySelector(`[data-detail-sheet][data-task="${h.taskId}"]`);
  if (sheet) return sheet.querySelector(h.mode ? `[data-mode="${h.mode}"]` : '[data-assign-cards]');
  return root.querySelector(`[data-island="${islandId(h.taskId)}"]`);
}

/** 案内（content/guides.ts）で照らす場所の DOM。案件ボードの入口は、メニューかホームのドックにある方 */
const spotSelector: Readonly<Record<Exclude<GuideSpot, null>, string>> = {
  board: '[data-menu-board], [data-board-open]',
  nextDay: '[data-next-day]',
  strip: '[data-company-strip]',
};

/** 吹き出しに出すもの。guide はチュートリアルの後の案内の章（「わかった」と飛ばし方が違う） */
interface CoachView {
  readonly label: string;
  readonly text: string;
  readonly find: ((root: ParentNode) => Element | null) | null;
  readonly guide: boolean;
  /** 「わかった」で進むステップか（案内のみ） */
  readonly ack: boolean;
}

/**
 * チュートリアルのコーチマーク（企画書50章）。今のステップの照らす場所を丸く切り抜いたスポットライトと、短い吹き出しを出す。
 * 「次へ」ボタンはなく、操作すればステップが進む（進行は core が判定する）。スキップは SkipTutorial の Command。
 * チュートリアルの後の案内の章（core/guides.ts）も同じ吹き出しで出す。案内は画面を暗くせず、読むだけのステップは「わかった」（AckGuide）で進み、
 * 章ごと・すべてを飛ばせる（SkipGuide）。
 * スポットライトも吹き出しの外も押せる（pointer-events: none）ので、操作を妨げない。
 */
export function TutorialCoach(props: { store: GameStore; padding: number }) {
  const coach = createMemo((): CoachView | null => {
    const state = props.store.state();
    const t = currentTutorialStep(state);
    if (t) {
      const h = t.highlight;
      return {
        label: ja.tutorial.label,
        text: ja.tutorial.say[resolveSay(state, t.say)],
        find: h ? (root) => findHighlight(root, h) : null,
        guide: false,
        ack: false,
      };
    }
    const g = currentGuideStep(state);
    if (!g || !state.guide) return null;
    const spot = g.spot;
    return {
      label: ja.guides.chapters[state.guide.chapter],
      text: ja.guides.say[g.say as keyof typeof ja.guides.say] ?? g.say,
      find: spot ? (root) => root.querySelector(spotSelector[spot]) : null,
      guide: true,
      ack: g.done === 'ack',
    };
  });

  const [box, setBox] = createSignal<Box | null>(null);
  let frame = 0;
  // 照らす場所はカメラの移動やシートの開閉で動くので、フレームごとに測り直す（変わったときだけ更新する）
  const measure = () => {
    const find = coach()?.find;
    const r = find ? find(document)?.getBoundingClientRect() : undefined;
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
    <Show when={coach()}>
      {(c) => (
        <div
          class="pointer-events-none absolute inset-0 z-20"
          data-tutorial-coach
          data-guide-coach={c().guide ? '' : undefined}
        >
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
                  'box-shadow': c().guide ? undefined : '0 0 0 9999px rgb(15 23 42 / 0.42)',
                }}
              />
            )}
          </Show>
          <section
            role="status"
            aria-label={c().label}
            data-coach-bubble
            class={`${panel} pointer-events-auto absolute flex flex-col gap-1.5 px-4 py-3`}
            style={bubbleStyle()}
          >
            <div class="flex items-center justify-between gap-2">
              <span class="rounded-full border-2 border-line bg-accent-200 px-2 text-[11px] font-bold">
                {c().label}
              </span>
              <button
                type="button"
                class={smallButton}
                data-coach-skip
                onClick={() => props.store.dispatch(c().guide ? { type: 'SkipGuide' } : { type: 'SkipTutorial' })}
              >
                {c().guide ? ja.guides.skip : ja.tutorial.skip}
              </button>
            </div>
            <p class="text-sm font-bold leading-snug">{c().text}</p>
            <Show when={c().guide}>
              <div class="flex items-center justify-between gap-2">
                <button
                  type="button"
                  class={smallButton}
                  data-guide-skip-all
                  onClick={() => props.store.dispatch({ type: 'SkipGuide', all: true })}
                >
                  {ja.guides.skipAll}
                </button>
                <Show when={c().ack}>
                  <button
                    type="button"
                    class={primaryButton}
                    data-guide-ok
                    onClick={() => props.store.dispatch({ type: 'AckGuide' })}
                  >
                    {ja.guides.ok}
                  </button>
                </Show>
              </div>
            </Show>
          </section>
        </div>
      )}
    </Show>
  );
}
