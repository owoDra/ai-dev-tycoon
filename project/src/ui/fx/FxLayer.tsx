import { animate } from 'motion';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import type { IconName } from '../../assets/icons';
import type { FxId, FxTone } from '../../content/fx';
import type { FxCue } from '../../fx/director';
import { countUp, ease } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { Icon } from '../Icon';

/** 演出の文字に添えるアイコン（色だけでなく形でも伝える） */
const LABEL_ICON: Record<FxId, IconName> = {
  islandSelect: 'workflow',
  taskDone: 'success',
  taskDefect: 'defect',
  reviewCatch: 'review',
  bottleneckCleared: 'bottleneck',
  automation: 'automation',
  incident: 'warning',
  autoRepair: 'hook',
  autonomyStreak: 'subagent',
  projectComplete: 'release',
};

/**
 * 演出の文字の色。ボタンに見えないよう、枠と背景を付けずに文字とアイコンだけを色で塗る
 * （下の縁取りで、どの背景の上でも読めるようにする）
 */
const TONE_TEXT: Record<FxTone, string> = {
  success: 'text-success-700',
  danger: 'text-danger-700',
  info: 'text-primary-700',
  accent: 'text-accent-800',
};

/** 文字の縁取り：地の色で8方向に width px 縁取り、少し下に影を落とす */
function halo(width: number): string {
  const d = [-width, 0, width];
  return [
    ...d.flatMap((x) => d.filter((y) => x !== 0 || y !== 0).map((y) => `${x}px ${y}px 0 var(--color-surface)`)),
    `0 ${width * 2}px ${width * 3}px rgb(0 0 0 / 0.18)`,
  ].join(', ');
}
/** ポップの文字と、中央の大きな文字の縁取り */
const HALO = halo(2);
const BIG_HALO = halo(3);

/** ポップの文字が浮き上がる距離（px） */
const RISE = 44;
const MS = 1000;
/** これより狭い画面（px）では大きな文字を拡大しない */
const NARROW = 640;

interface Pop {
  key: number;
  cue: FxCue;
  x: number;
  y: number;
}

export interface FxLayer {
  /** DOM の部品（文字・大きな数字・フラッシュ）を再生する。3D の部品は world が受け持つ */
  play(cue: FxCue, at: { x: number; y: number } | null): void;
  cancel(tokens: readonly number[]): void;
}

/**
 * DOM の演出（ポップの文字・コンボ・中央の大きな文字と数字・画面フラッシュ）。
 * レイヤー全体が pointer-events: none で、下の UI とワールドへのクリック・タッチ・ホバーをすべて素通りさせる。
 * 演出の終わりを待つ処理はなく、要素は時間が来たら自分で消える（操作はブロックしない）。
 * 読み上げは、大きな演出の文字だけを polite で伝える（Task 完了などはお知らせが伝える）。
 */
export function FxLayerView(props: { ref: (layer: FxLayer) => void }) {
  const [pops, setPops] = createSignal<Pop[]>([]);
  const [big, setBig] = createSignal<FxCue | null>(null);
  const [flash, setFlash] = createSignal<{ key: number; opacity: number } | null>(null);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let key = 0;
  const later = (ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  onCleanup(() => {
    for (const id of timers) clearTimeout(id);
  });

  props.ref({
    play(cue, at) {
      const has = (p: string) => cue.parts.includes(p as never);
      if (cue.def.label && (has('popLabel') || has('fadeLabel'))) {
        const pop: Pop = { key: ++key, cue, x: at?.x ?? window.innerWidth / 2, y: at?.y ?? window.innerHeight / 3 };
        setPops((list) => [...list, pop]);
        later(cue.durationMs, () => setPops((list) => list.filter((p) => p !== pop)));
      }
      if (has('bigType') || has('fadeBigType') || has('bigNumber') || has('fadeBigNumber')) {
        setBig(cue);
        later(cue.durationMs, () => setBig((b) => (b === cue ? null : b)));
      }
      if (has('flash') && cue.feel.tiers[cue.tier].flash > 0) {
        const f = { key: ++key, opacity: cue.feel.tiers[cue.tier].flash };
        setFlash(f);
        later(cue.durationMs / 4, () => setFlash((x) => (x === f ? null : x)));
      }
    },
    cancel(tokens) {
      if (tokens.length === 0) return;
      setBig((b) => (b && tokens.includes(b.token) ? null : b));
      setPops((list) => list.filter((p) => !tokens.includes(p.cue.token)));
    },
  });

  return (
    <div class="pointer-events-none fixed inset-0 z-40 overflow-hidden" data-fx-layer>
      <Show when={flash()} keyed>
        {(f) => (
          <div
            aria-hidden="true"
            class="absolute inset-0 bg-white"
            ref={(el) => {
              el.style.opacity = '0';
              if (typeof el.animate === 'function')
                animate(el, { opacity: [f.opacity, 0] }, { duration: 0.35, ease: ease.out });
            }}
          />
        )}
      </Show>
      <div aria-hidden="true">
        <For each={pops()}>{(p) => <PopLabel pop={p} />}</For>
      </div>
      <div role="status" aria-live="polite" class="absolute inset-x-0 top-[22%] flex justify-center px-4">
        <Show when={big()} keyed>
          {(cue) => <BigMoment cue={cue} />}
        </Show>
      </div>
    </div>
  );
}

function PopLabel(props: { pop: Pop }) {
  const cue = props.pop.cue;
  const label = cue.def.label;
  const fade = cue.parts.includes('fadeLabel');
  const showCombo = !fade && cue.parts.includes('comboLabel') && cue.combo >= 2;
  return (
    <div
      class="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1"
      style={{ left: `${props.pop.x}px`, top: `${props.pop.y}px` }}
      ref={(el) => {
        if (typeof el.animate !== 'function') return;
        const d = cue.durationMs / MS;
        if (fade) {
          animate(el, { opacity: [0, 1, 1, 0] }, { duration: d, times: [0, 0.15, 0.75, 1] });
          return;
        }
        const s = cue.intensity;
        const p = cue.feel.motion.pop;
        animate(
          el,
          {
            opacity: [0, 1, 1, 0],
            scale: [p.from, p.overshoot * s, s, s],
            y: [0, -RISE * 0.6, -RISE * 0.8, -RISE],
          },
          { duration: d, times: [0, 0.2, 0.7, 1], ease: p.ease },
        );
      }}
    >
      <Show when={label}>
        {(l) => (
          <span
            class={`inline-flex items-center gap-1 font-heading text-lg whitespace-nowrap ${TONE_TEXT[l().tone]}`}
            style={{ 'text-shadow': HALO }}
          >
            <Icon name={LABEL_ICON[cue.id]} class="text-xl drop-shadow-[0_0_2px_var(--color-surface)]" />
            {ja.fx.labels[l().key]}
          </span>
        )}
      </Show>
      <Show when={showCombo}>
        <span class="font-heading text-sm whitespace-nowrap text-accent-800" style={{ 'text-shadow': HALO }}>
          {ja.fx.combo(cue.combo)}
        </span>
      </Show>
    </div>
  );
}

function BigMoment(props: { cue: FxCue }) {
  const cue = props.cue;
  const label = cue.def.label;
  const fade = cue.reduced;
  const showNumber = cue.amount !== undefined && cue.parts.some((p) => p === 'bigNumber' || p === 'fadeBigNumber');
  return (
    <div
      class="flex flex-col items-center gap-2 text-center"
      ref={(el) => {
        if (typeof el.animate !== 'function') return;
        const d = cue.durationMs / MS;
        if (fade) {
          animate(el, { opacity: [0, 1, 1, 0] }, { duration: d, times: [0, 0.12, 0.8, 1] });
          return;
        }
        // 狭い画面では拡大しすぎて画面からはみ出さないようにする
        const s = Math.min(window.innerWidth < NARROW ? 1 : 1.6, cue.intensity);
        const p = cue.feel.motion.pop;
        animate(
          el,
          { opacity: [0, 1, 1, 0], scale: [p.from, p.overshoot * s, s, s * 0.96] },
          { duration: d, times: [0, 0.18, 0.8, 1], ease: p.ease },
        );
      }}
    >
      <Show when={label}>
        {(l) => (
          <p
            class={`inline-flex items-center gap-2 font-heading text-2xl tracking-wide whitespace-nowrap sm:text-4xl ${TONE_TEXT[l().tone]}`}
            style={{ 'text-shadow': BIG_HALO }}
          >
            <Icon name={LABEL_ICON[cue.id]} class="text-3xl drop-shadow-[0_0_3px_var(--color-surface)] sm:text-4xl" />
            {ja.fx.labels[l().key]}
          </p>
        )}
      </Show>
      <Show when={showNumber}>
        <p
          class="font-heading text-3xl whitespace-nowrap text-ink tabular-nums [text-shadow:0_3px_0_var(--color-surface)] sm:text-display"
          ref={(el) => {
            const amount = cue.amount ?? 0;
            el.textContent = ja.fx.savedHours(fade ? amount : 0);
            if (!fade) countUp(el, 0, amount, ja.fx.savedHours, cue.durationMs * 0.4);
          }}
        />
      </Show>
    </div>
  );
}
