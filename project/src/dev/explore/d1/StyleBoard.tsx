import { animate } from 'motion';
import { createEffect, createSignal, For, type JSX, on, onCleanup, Show } from 'solid-js';
import { contrastPairs, type VisualPreset } from '../../../content/look/visual';
import { ja } from '../../../i18n/ja';
import { contrastRatio } from '../../../styles/color';
import { visualCssVars } from '../../../styles/visualVars';
import { IsoIsland } from './IsoIsland';
import { GlyphIcon, glyphNames } from './icons';
import './styleboard.css';

const t = ja.explore.d1;

/** D1 のスタイルボード。どの案も同じ構成で並べ、違いがプリセットの値だけから生まれるようにする */
export function StyleBoard(props: { preset: VisualPreset; presetName: string }) {
  const vars = () => visualCssVars(props.preset);
  return (
    <div class="sb min-h-screen px-4 pt-6 pb-40 sm:px-8" style={vars()}>
      <div class="mx-auto flex max-w-6xl flex-col gap-8">
        <header class="flex flex-col gap-1">
          <p class="sb-small">{t.title}</p>
          <h1 class="sb-h1">{props.presetName}</h1>
        </header>

        <div class="grid gap-6 lg:grid-cols-2">
          <Section title={t.sections.hud}>
            <Hud preset={props.preset} />
          </Section>
          <Section title={t.sections.bigNumber}>
            <BigNumber preset={props.preset} />
          </Section>
        </div>

        <div class="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Section title={t.sections.island}>
            <div class="sb-sunken p-2">
              <IsoIsland preset={props.preset} title={t.islandCaption} />
            </div>
            <p class="sb-small mt-2">{t.islandCaption}</p>
          </Section>
          <div class="flex flex-col gap-6">
            <Section title={t.sections.surfaces}>
              <div class="sb-card p-5">
                <div class="flex items-center gap-3">
                  <GlyphIcon name="ai" preset={props.preset} size={40} />
                  <div>
                    <p class="sb-h3">{t.card.title}</p>
                    <p class="sb-small">{t.card.meta}</p>
                  </div>
                </div>
                <p class="mt-3">{t.card.body}</p>
              </div>
            </Section>
            <Section title={t.sections.status}>
              <div class="flex flex-col gap-2">
                <StatusRow tone="success" label={t.status.done} detail={t.statusDetail.done} />
                <StatusRow tone="warning" label={t.status.caution} detail={t.statusDetail.caution} />
                <StatusRow tone="danger" label={t.status.failed} detail={t.statusDetail.failed} />
              </div>
            </Section>
          </div>
        </div>

        <Section title={t.sections.buttons}>
          <div class="flex flex-wrap items-end gap-6">
            <For each={['normal', 'hover', 'pressed', 'disabled'] as const}>
              {(state) => (
                <div class="flex flex-col items-start gap-2">
                  <span class="sb-small">{t.buttonStates[state]}</span>
                  <button
                    type="button"
                    class="sb-btn"
                    data-state={state === 'hover' || state === 'pressed' ? state : undefined}
                    disabled={state === 'disabled'}
                  >
                    <GlyphIcon name="human" preset={props.preset} size={22} mono />
                    {t.buttonLabel}
                  </button>
                </div>
              )}
            </For>
          </div>
        </Section>

        <Section title={t.sections.icons}>
          <div class="grid grid-cols-4 gap-4 sm:grid-cols-8">
            <For each={glyphNames}>
              {(name) => (
                <div class="sb-card flex flex-col items-center gap-2 px-2 py-4">
                  <GlyphIcon name={name} preset={props.preset} size={48} />
                  <span class="sb-small">{t.icons[name]}</span>
                </div>
              )}
            </For>
          </div>
        </Section>

        <div class="grid gap-6 lg:grid-cols-2">
          <Section title={t.sections.type}>
            <div class="sb-card flex flex-col gap-3 p-5">
              <p class="sb-h1">{t.typeSamples.h1}</p>
              <p class="sb-h2">{t.typeSamples.h2}</p>
              <p class="sb-h3">{t.typeSamples.h3}</p>
              <p>{t.typeSamples.body}</p>
              <p class="sb-small">{t.typeSamples.small}</p>
            </div>
          </Section>
          <Section title={t.sections.contrast}>
            <ContrastTable preset={props.preset} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section(props: { title: string; children: JSX.Element }) {
  return (
    <section class="flex flex-col gap-3">
      <h2 class="sb-h3">{props.title}</h2>
      {props.children}
    </section>
  );
}

function Hud(props: { preset: VisualPreset }) {
  return (
    <div class="sb-card flex flex-col gap-4 p-5">
      <div class="flex flex-wrap items-center gap-6">
        <div class="flex items-center gap-3">
          <GlyphIcon name="money" preset={props.preset} size={40} />
          <div>
            <p class="sb-small">{t.hud.profit}</p>
            <p class="sb-num sb-h2">{t.hud.profitValue}</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <GlyphIcon name="clock" preset={props.preset} size={40} />
          <div>
            <p class="sb-small">{t.hud.remaining}</p>
            <p class="sb-num sb-h2">{t.hud.remainingValue}</p>
          </div>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <p class="sb-small">{t.hud.utilization}</p>
        <For each={t.hud.workers}>
          {(w) => (
            <div class="grid grid-cols-[28px_3em_1fr_3em] items-center gap-2">
              <GlyphIcon name={w.ai ? 'ai' : 'human'} preset={props.preset} size={26} />
              <span>{w.name}</span>
              <div class="sb-bar" data-tone={w.ai ? 'accent' : undefined}>
                <span style={{ width: `${w.ratio * 100}%` }} />
              </div>
              <span class="sb-num text-right">{Math.round(w.ratio * 100)}%</span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

function BigNumber(props: { preset: VisualPreset }) {
  const [run, setRun] = createSignal(0);
  const [value, setValue] = createSignal<string>(t.bigNumber.value);
  const target = Number(t.bigNumber.value);

  createEffect(
    on([run, () => props.preset], () => {
      const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) {
        setValue(t.bigNumber.value);
        return;
      }
      const controls = animate(0, target, {
        duration: props.preset.motion.popDuration / 1000,
        ease: 'easeOut',
        onUpdate: (v) => setValue(v.toFixed(1)),
      });
      onCleanup(() => controls.stop());
    }),
  );

  return (
    <div class="sb-card flex min-h-[220px] flex-col items-start justify-center gap-3 p-6">
      <Show when={run() + 1} keyed>
        <div class="flex items-center gap-3">
          <GlyphIcon name="clock" preset={props.preset} size={56} />
          <p class="sb-big">
            <span>{value()}</span>
            <span class="sb-big-unit">{t.bigNumber.unit}</span>
          </p>
        </div>
      </Show>
      <p>
        <span class="sb-accent-tag">{t.icons.hook}</span> {t.bigNumber.reason}
      </p>
      <button type="button" class="sb-btn" onClick={() => setRun((n) => n + 1)}>
        {t.bigNumber.replay}
      </button>
    </div>
  );
}

const marks: Record<'success' | 'warning' | 'danger', string> = {
  success: 'M4 8.5l2.7 2.7L12 5.5',
  warning: 'M8 3.5v5.5M8 12v.5',
  danger: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
};

/** 状態のマーク（チェック・感嘆符・バツ）。色だけに頼らず形でも区別する */
function StatusMark(props: { tone: 'success' | 'warning' | 'danger' }) {
  return (
    <span class="sb-chip-mark">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d={marks[props.tone]} fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
      </svg>
    </span>
  );
}

function StatusRow(props: { tone: 'success' | 'warning' | 'danger'; label: string; detail: string }) {
  return (
    <div class="sb-card flex items-center gap-3 px-4 py-3">
      <span class="sb-chip" data-tone={props.tone}>
        <StatusMark tone={props.tone} />
        {props.label}
      </span>
      <span>{props.detail}</span>
    </div>
  );
}

function ContrastTable(props: { preset: VisualPreset }) {
  const rows = () =>
    contrastPairs(props.preset).map((pair) => {
      const ratio = contrastRatio(pair.fg, pair.bg);
      return { ...pair, ratio, ok: ratio >= pair.min };
    });
  const allOk = () => rows().every((r) => r.ok);
  return (
    <div class="sb-card p-4">
      <p class="mb-2 flex items-center gap-2 font-bold">
        <span class="sb-chip" data-tone={allOk() ? 'success' : 'danger'}>
          <StatusMark tone={allOk() ? 'success' : 'danger'} />
          {allOk() ? t.pass : t.fail}
        </span>
        <span class="sb-num">
          {rows().filter((r) => r.ok).length} / {rows().length}
        </span>
      </p>
      <table class="w-full text-left" style={{ 'font-size': 'var(--v-font-small)' }}>
        <tbody>
          <For each={rows()}>
            {(r) => (
              <tr class="border-t" style={{ 'border-color': 'var(--v-line)' }}>
                <td class="py-1 pr-2">
                  <span
                    class="inline-flex items-center rounded px-2 py-0.5 font-bold"
                    style={{ background: r.bg, color: r.fg, border: '1px solid var(--v-line)' }}
                  >
                    Aa
                  </span>
                </td>
                <td class="py-1">{t.contrast[r.id as keyof typeof t.contrast]}</td>
                <td class="sb-num py-1 text-right">{r.ratio.toFixed(2)}</td>
                <td class="py-1 pl-2 text-right">
                  <span class="sb-chip" data-tone={r.ok ? 'success' : 'danger'}>
                    <StatusMark tone={r.ok ? 'success' : 'danger'} />
                    {r.ok ? t.pass : t.fail}
                  </span>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
