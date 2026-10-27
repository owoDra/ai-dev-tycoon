import { For, onCleanup, onMount, Show } from 'solid-js';
import { ja } from '../../i18n/ja';
import type { BottleneckMove, StageRow } from '../../view/bottleneck';
import type { World } from '../../world/index';
import { Icon } from '../Icon';
import { panel, primaryButton, smallButton } from '../parts';

const t = ja.bottleneck;

/** 画面の端からの余白（px）。矢印が画面外の島を指すときは、この内側に貼り付ける */
const EDGE = 28;

const fmt = (m: number) => (m >= 60 ? `${(m / 60).toFixed(1)}h` : `${Math.round(m)}m`);

/**
 * ボトルネックの移動の案内（企画書20章「次のボトルネックがどこへ移動するか」）。
 * カメラは勝手に動かさず、新しいボトルネックの島を指す矢印と「見に行く」ボタンで知らせる（旧ボトルネックの島は輪が消えて落ち着く）。
 * 「工程の時間を比べる」で、工程ごとの時間を 人間だけ → 今の配置 の棒グラフで並べるミニパネルを開く。
 */
export function BottleneckGuide(props: {
  move: BottleneckMove;
  rows: readonly StageRow[];
  world?: World;
  /** スマホ幅では上端を「次に対応すべき問題」が使うので、ドックの上に出す（bottom はその位置、px） */
  compact: boolean;
  bottom: number;
  compare: boolean;
  onCompare: (open: boolean) => void;
  onGo: (entityId: string) => void;
  onClose: () => void;
  /** 左上に会社の帯（ui/company/CompanyStrip.tsx）が出ている。その下に出す */
  belowStrip?: boolean;
}) {
  return (
    <>
      <Show when={props.world}>
        {(w) => <GuideArrow world={w()} entityId={props.move.entityId} to={props.move.to} />}
      </Show>
      <section
        aria-label={t.moved}
        data-bottleneck-guide
        class={`${panel} pointer-events-auto absolute left-2 flex w-[min(22rem,calc(100%-1rem))] flex-col gap-2 p-2.5 text-xs`}
        classList={{
          'top-2': !props.compact && !props.belowStrip,
          'top-14': !props.compact && props.belowStrip === true,
        }}
        style={{ bottom: props.compact ? `${props.bottom}px` : undefined }}
      >
        <p class="flex items-center gap-1.5 font-bold">
          <Icon name="bottleneck" tone="danger" class="text-base" />
          {t.moved}
        </p>
        <p class="font-bold">{t.movedTo(props.move.to)}</p>
        <Show when={props.move.from}>{(from) => <p class="text-ink-muted">{t.movedFrom(from())}</p>}</Show>
        <div class="flex flex-wrap gap-1.5">
          <button type="button" class={`${primaryButton} px-3 text-sm`} onClick={() => props.onGo(props.move.entityId)}>
            {t.go}
          </button>
          <button
            type="button"
            class={smallButton}
            aria-expanded={props.compare}
            onClick={() => props.onCompare(!props.compare)}
          >
            {props.compare ? t.hideCompare : t.compare}
          </button>
          <button type="button" class={smallButton} onClick={() => props.onClose()}>
            {t.close}
          </button>
        </div>
        <Show when={props.compare}>
          <StagePanel rows={props.rows} />
        </Show>
      </section>
    </>
  );
}

/** 工程ごとの時間の Before → After の棒グラフ（最大の時間を棒の幅いっぱいにする） */
export function StagePanel(props: { rows: readonly StageRow[] }) {
  const max = () => Math.max(1, ...props.rows.flatMap((r) => [r.before, r.after]));
  const width = (m: number) => `${Math.max(1, Math.round((m / max()) * 100))}%`;
  return (
    <figure class="flex flex-col gap-1" data-stage-panel>
      <figcaption class="flex items-center justify-between font-bold">
        {t.panelTitle}
        <span class="flex items-center gap-2 text-[10px] text-ink-muted">
          <span class="flex items-center gap-1">
            <span class="inline-block size-2.5 rounded-sm border border-line bg-neutral-200" />
            {t.before}
          </span>
          <span class="flex items-center gap-1">
            <span class="inline-block size-2.5 rounded-sm border border-line bg-primary-400" />
            {t.after}
          </span>
        </span>
      </figcaption>
      <ul class="flex max-h-56 flex-col gap-1 overflow-y-auto">
        <For each={props.rows}>
          {(row) => (
            <li
              class="grid grid-cols-[6.5rem_1fr] items-center gap-1.5"
              aria-label={`${t.rowLabel(row.name, fmt(row.before), fmt(row.after))}${row.bottleneck ? `（${t.current}）` : ''}`}
              data-stage-row={row.key}
              data-bottleneck={row.bottleneck || undefined}
            >
              <span class="flex min-w-0 items-center gap-1" classList={{ 'font-bold text-danger-ink': row.bottleneck }}>
                <Show when={row.bottleneck}>
                  <Icon name="bottleneck" tone="danger" class="shrink-0 text-sm" />
                </Show>
                <span class="truncate">{row.name}</span>
              </span>
              <span class="flex flex-col gap-px" aria-hidden="true">
                <span class="flex items-center gap-1">
                  <span class="h-1.5 rounded-sm bg-neutral-200" style={{ width: width(row.before) }} />
                  <span class="text-[10px] text-ink-muted tabular-nums">{fmt(row.before)}</span>
                </span>
                <span class="flex items-center gap-1">
                  <span
                    class="h-2 rounded-sm border border-line"
                    classList={{ 'bg-danger-400': row.bottleneck, 'bg-primary-400': !row.bottleneck }}
                    style={{ width: width(row.after) }}
                  />
                  <span class="text-[10px] font-bold tabular-nums">{fmt(row.after)}</span>
                </span>
              </span>
            </li>
          )}
        </For>
      </ul>
    </figure>
  );
}

/**
 * 新しいボトルネックを指す矢印。島が画面に見えていればその頭上で下を指し、見えていなければ画面の端に貼り付けて島の方を指す。
 * 位置はカメラに追従させるため毎フレーム更新する（transform だけを書き換える）
 */
function GuideArrow(props: { world: World; entityId: string; to: string }) {
  let el!: HTMLDivElement;
  let frame = 0;
  onMount(() => {
    const tick = () => {
      const p = props.world.project(props.entityId);
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (p) {
        const inside = p.visible && p.x > EDGE && p.x < w - EDGE && p.y > EDGE && p.y < h - EDGE;
        const x = Math.min(w - EDGE, Math.max(EDGE, p.x));
        const y = Math.min(h - EDGE, Math.max(EDGE, p.y));
        // 見えていれば下（島）を、見えていなければ画面の中心から島の方を向く
        const angle = inside ? 90 : (Math.atan2(p.y - h / 2, p.x - w / 2) * 180) / Math.PI;
        el.style.visibility = 'visible';
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - (inside ? 36 : 0))}px) translate(-50%, -50%) rotate(${angle}deg)`;
      } else el.style.visibility = 'hidden';
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
  onCleanup(() => cancelAnimationFrame(frame));
  return (
    <div
      ref={el}
      role="img"
      aria-label={t.arrow(props.to)}
      data-bottleneck-arrow
      class="pointer-events-none absolute top-0 left-0 flex size-9 items-center justify-center rounded-full border-[3px] border-line bg-danger-400 text-ink shadow-pop"
      style={{ visibility: 'hidden' }}
    >
      <svg viewBox="0 0 24 24" class="size-5" aria-hidden="true">
        <path
          d="M5 12h12M12 6l6 6-6 6"
          fill="none"
          stroke="currentColor"
          stroke-width="3.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  );
}
