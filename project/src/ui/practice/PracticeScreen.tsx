import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { loadPracticeJob, savePracticeJob } from '../../app/practiceStore';
import { balance } from '../../content/balance';
import { content } from '../../content/index';
import { layoutFormFor, uiLayout } from '../../content/look/layout';
import { practiceAptitudeOrder, practiceFrequencies, practiceTemplates } from '../../content/practice/index';
import type {
  AssignModeId,
  PracticeAptitude,
  PracticeFrequency,
  PracticeJobInput,
  PracticeStepInput,
  TaskKind,
} from '../../content/types';
import { estimatePractice, newPracticeStep, type PracticeEstimate, usesAi } from '../../core/practice';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import {
  applyPracticeCommand,
  blankJob,
  formatRoi,
  practiceForecast,
  practiceHarness,
  practiceHeadline,
  practiceReport,
} from '../../view/practice';
import { CopyButton } from '../CopyButton';
import { Icon } from '../Icon';
import { Presence } from '../Presence';
import { ghostButton, modeIcon, panel } from '../parts';
import { HarnessSheet } from '../play/HarnessSheet';

const t = ja.practice;
const field = 'rounded-md border-2 border-line bg-surface px-2 py-1 text-sm font-normal';
const KINDS = Object.keys(ja.harness.kinds) as TaskKind[];

/**
 * 実務モード（企画書24章）。実際の業務を工程に分けて入力し、各工程に担当モードと Harness 部品を割り当てると、
 * ゲームと同じ式（core/practice.ts）で改善後の人間時間・年間の削減時間・AI の追加コスト・ROI・人日あたりの利益を出す。
 * Harness の設計はゲームの Harness Builder（HarnessSheet）をそのまま使う。結果は「2.0h → 0.3h / −88%」のように数字を主役にし、
 * テキストか Markdown でコピーできる。入力は localStorage に保存する（保存できなくても動く）
 */
export function PracticeScreen(props: { onBack: () => void }) {
  const [job, setJob] = createSignal<PracticeJobInput>(loadPracticeJob() ?? practiceTemplates[0]?.job ?? blankJob());
  const [editing, setEditing] = createSignal<number | null>(null);
  const estimate = createMemo(() => estimatePractice(job()));
  createEffect(() => savePracticeJob(job()));

  const [view, setView] = createSignal({ width: window.innerWidth, height: window.innerHeight });
  const onResize = () => setView({ width: window.innerWidth, height: window.innerHeight });
  window.addEventListener('resize', onResize);
  onCleanup(() => window.removeEventListener('resize', onResize));
  const sheet = () => layoutFormFor(uiLayout, view().width).form.sheet;

  let el!: HTMLDivElement;
  onMount(() => enter(el, 'below'));

  const update = (patch: Partial<PracticeJobInput>) => setJob((j) => ({ ...j, ...patch }));
  const updateStep = (index: number, patch: Partial<PracticeStepInput>) =>
    setJob((j) => ({ ...j, steps: j.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  const moveStep = (index: number, by: number) =>
    setJob((j) => {
      const steps = [...j.steps];
      const [s] = steps.splice(index, 1);
      if (s) steps.splice(Math.max(0, Math.min(steps.length, index + by)), 0, s);
      return { ...j, steps };
    });
  const removeStep = (index: number) => {
    setEditing(null);
    setJob((j) => ({ ...j, steps: j.steps.filter((_, i) => i !== index) }));
  };
  const addStep = () =>
    setJob((j) =>
      j.steps.length >= balance.practice.maxSteps
        ? j
        : { ...j, steps: [...j.steps, newPracticeStep(t.steps.newStep(j.steps.length + 1))] },
    );
  const harness = createMemo(() => {
    const i = editing();
    return i === null ? null : practiceHarness(job(), i);
  });

  return (
    <div class="absolute inset-0 overflow-y-auto bg-bg/70 p-3 sm:p-6" data-practice-screen>
      <div ref={el} class={`${panel} mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6`}>
        <header class="flex items-start justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-md border-[3px] border-line bg-accent-200 text-2xl">
              <Icon name="workflow" />
            </span>
            <div class="flex min-w-0 flex-col leading-tight">
              <h1 class="font-heading text-2xl">{t.title}</h1>
              <p class="text-xs text-ink-muted">{t.lead}</p>
            </div>
          </div>
          <button type="button" class={ghostButton} data-practice-back onClick={() => props.onBack()}>
            {t.back}
          </button>
        </header>

        <section class="flex flex-wrap items-center gap-2" aria-label={t.template.label}>
          <span class="text-sm font-bold">{t.template.label}</span>
          <For each={practiceTemplates}>
            {(tpl) => (
              <button
                type="button"
                class={ghostButton}
                data-practice-template={tpl.id}
                onClick={() => {
                  setEditing(null);
                  setJob(tpl.job);
                }}
              >
                {tpl.job.name}
              </button>
            )}
          </For>
          <button
            type="button"
            class={ghostButton}
            data-practice-blank
            onClick={() => {
              setEditing(null);
              setJob(blankJob());
            }}
          >
            {t.template.blank}
          </button>
        </section>

        <ResultPanel job={job()} estimate={estimate()} />

        <section class="grid gap-3 sm:grid-cols-2" aria-label={t.job.name}>
          <Field label={t.job.name}>
            {(id) => (
              <input
                id={id}
                class={field}
                value={job().name}
                maxLength={balance.practice.maxNameLength}
                onInput={(e) => update({ name: e.currentTarget.value })}
                data-practice-name
              />
            )}
          </Field>
          <fieldset class="flex flex-col gap-1">
            <legend class="mb-1 text-xs font-bold">{t.job.frequency}</legend>
            <div class="flex gap-1.5">
              <For each={practiceFrequencies}>
                {(f) => (
                  <button
                    type="button"
                    aria-pressed={job().frequency === f}
                    class="min-h-9 rounded-md border-2 border-line bg-surface px-3 text-sm font-bold aria-pressed:bg-accent-300"
                    data-practice-frequency={f}
                    onClick={() => update({ frequency: f as PracticeFrequency })}
                  >
                    {t.job.frequencies[f]}
                  </button>
                )}
              </For>
            </div>
          </fieldset>
          <Field label={t.job.wage}>
            {(id) => (
              <NumberInput
                id={id}
                value={job().dailyWage}
                max={Number.MAX_SAFE_INTEGER}
                onChange={(v) => update({ dailyWage: v })}
              />
            )}
          </Field>
          <Field label={t.job.value}>
            {(id) => (
              <NumberInput
                id={id}
                value={job().valuePerRun}
                max={Number.MAX_SAFE_INTEGER}
                onChange={(v) => update({ valuePerRun: v })}
              />
            )}
          </Field>
          <p class="text-sm font-bold sm:col-span-2" data-practice-current>
            {t.job.current(estimate().beforeMinutes)}
          </p>
        </section>

        <section class="flex flex-col gap-2" aria-label={t.steps.title}>
          <h2 class="font-heading text-lg">{t.steps.title}</h2>
          <ol class="flex flex-col gap-2">
            <For each={job().steps}>
              {(step, i) => (
                <li>
                  <StepCard
                    step={step}
                    index={i()}
                    count={job().steps.length}
                    after={estimate().steps[i()]?.afterMinutes ?? step.minutes}
                    onChange={(patch) => updateStep(i(), patch)}
                    onMove={(by) => moveStep(i(), by)}
                    onRemove={() => removeStep(i())}
                    onHarness={() => setEditing(i())}
                  />
                </li>
              )}
            </For>
          </ol>
          <Show
            when={job().steps.length < balance.practice.maxSteps}
            fallback={<p class="text-xs text-ink-muted">{t.steps.max(balance.practice.maxSteps)}</p>}
          >
            <button type="button" class={`${ghostButton} self-start`} data-practice-add onClick={addStep}>
              {t.steps.add}
            </button>
          </Show>
        </section>
      </div>
      <Presence when={harness()} enter={false} class="pointer-events-auto fixed inset-0 z-10">
        {(v) => (
          <HarnessSheet
            view={v()}
            kicker={t.steps.harness}
            layout={sheet()}
            bottom={0}
            viewHeight={view().height}
            forecast={(command) => practiceForecast(job(), editing() ?? 0, command)}
            dispatch={(command) => setJob((j) => applyPracticeCommand(j, editing() ?? 0, command))}
            onClose={() => setEditing(null)}
          />
        )}
      </Presence>
    </div>
  );
}

/** 見出し付きの入力欄。children に入力欄の id を渡し、見出しと結び付ける */
function Field(props: { label: string; children: (id: string) => JSX.Element }) {
  const id = createUniqueId();
  return (
    <div class="flex flex-col gap-1 text-xs font-bold">
      <label for={id}>{props.label}</label>
      {props.children(id)}
    </div>
  );
}

/** 0 以上の数値の入力。空や不正な値は 0 にし、上限に収める */
function NumberInput(props: { id?: string; value: number; max: number; onChange: (v: number) => void; data?: string }) {
  return (
    <input
      id={props.id}
      type="number"
      inputmode="numeric"
      min="0"
      class={`${field} tabular-nums`}
      value={props.value}
      data-number={props.data ?? ''}
      onInput={(e) => {
        const v = Number(e.currentTarget.value);
        props.onChange(Number.isFinite(v) ? Math.min(props.max, Math.max(0, v)) : 0);
      }}
    />
  );
}

function StepCard(props: {
  step: PracticeStepInput;
  index: number;
  count: number;
  after: number;
  onChange: (patch: Partial<PracticeStepInput>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
  onHarness: () => void;
}) {
  const s = () => props.step;
  const s2 = t.steps;
  return (
    <article
      class="flex flex-col gap-2 rounded-lg border-[3px] border-line bg-surface p-3 shadow-pop"
      data-practice-step={props.index}
    >
      <div class="flex items-center justify-between gap-2">
        <span class="font-heading text-sm">{props.index + 1}.</span>
        <span class="flex-1 text-right text-xs font-bold tabular-nums" data-step-after>
          {t.minutes(s().minutes)} → {s2.after(props.after)}
        </span>
        <div class="flex gap-1">
          <button
            type="button"
            class={ghostButton}
            disabled={props.index === 0}
            aria-label={s2.up}
            onClick={() => props.onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            class={ghostButton}
            disabled={props.index === props.count - 1}
            aria-label={s2.down}
            onClick={() => props.onMove(1)}
          >
            ↓
          </button>
          <button type="button" class={ghostButton} data-step-remove onClick={() => props.onRemove()}>
            {s2.remove}
          </button>
        </div>
      </div>
      <div class="grid gap-2 sm:grid-cols-3">
        <Field label={s2.name}>
          {(id) => (
            <input
              id={id}
              class={field}
              value={s().name}
              maxLength={balance.practice.maxNameLength}
              onInput={(e) => props.onChange({ name: e.currentTarget.value })}
            />
          )}
        </Field>
        <Field label={s2.minutes}>
          {(id) => (
            <NumberInput
              id={id}
              value={s().minutes}
              max={balance.practice.maxStepMinutes}
              data="minutes"
              onChange={(v) => props.onChange({ minutes: v })}
            />
          )}
        </Field>
        <Field label={s2.kind}>
          {(id) => (
            <select
              id={id}
              class={field}
              value={s().kind}
              onChange={(e) => props.onChange({ kind: e.currentTarget.value as TaskKind })}
            >
              <For each={KINDS}>{(k) => <option value={k}>{ja.harness.kinds[k]}</option>}</For>
            </select>
          )}
        </Field>
        <Field label={s2.aptitude}>
          {(id) => (
            <select
              id={id}
              class={field}
              value={s().aptitude}
              data-step-aptitude
              onChange={(e) => props.onChange({ aptitude: e.currentTarget.value as PracticeAptitude })}
            >
              <For each={practiceAptitudeOrder}>{(a) => <option value={a}>{s2.aptitudes[a]}</option>}</For>
            </select>
          )}
        </Field>
        <Field label={s2.mode}>
          {(id) => (
            <select
              id={id}
              class={field}
              value={s().mode}
              data-step-mode
              onChange={(e) => props.onChange({ mode: e.currentTarget.value as AssignModeId })}
            >
              <For each={content.assignModes}>{(m) => <option value={m.id}>{m.name}</option>}</For>
            </select>
          )}
        </Field>
        <Show when={usesAi(s())}>
          <div class="flex flex-col justify-end">
            <button type="button" class={ghostButton} data-step-harness onClick={() => props.onHarness()}>
              <Icon name={modeIcon[s().mode]} />
              {s2.harness}
              <span class="text-[11px] font-normal text-ink-muted">（{s().parts.length}）</span>
            </button>
          </div>
        </Show>
      </div>
    </article>
  );
}

/** 試算の結果。人間時間の Before → After と削減率を大きく出し、年間の数字を並べる */
function ResultPanel(props: { job: PracticeJobInput; estimate: PracticeEstimate }) {
  const e = () => props.estimate;
  const h = () => practiceHeadline(e());
  const r = t.result;
  const perHour = (v: number | null) => (v === null ? t.none : t.yenPerPersonDay(v));
  return (
    <section
      class="flex flex-col gap-3 rounded-lg border-[3px] border-line bg-sunken p-3"
      aria-label={r.title}
      data-practice-result
    >
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span class="text-xs font-bold text-ink-muted">{r.perRun}</span>
        <span class="font-heading text-3xl tabular-nums sm:text-4xl" data-headline>
          {h().before} → {h().after}
        </span>
        <span
          class="rounded-md border-[3px] border-line bg-success-200 px-2 font-heading text-2xl tabular-nums"
          classList={{ 'bg-danger-200': e().reduction < 0 }}
          data-reduction
        >
          {h().rate}
        </span>
      </div>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <Stat label={r.perYear} value={`${t.hours(e().annualBeforeHours)} → ${t.hours(e().annualAfterHours)}`} />
        <Stat label={r.savedHours} value={t.hours(e().annualSavedHours)} data="saved" />
        <Stat
          label={r.aiCost}
          value={t.yen(e().aiExtraCost)}
          note={r.aiCostDetail(t.yen(e().annualAiCost), t.yen(e().installCost))}
          data="ai-cost"
        />
        <Stat label={r.roi} value={formatRoi(e().roi)} data="roi" />
        <Stat
          label={r.profit}
          value={`${perHour(e().profitPerPersonDay.before)} → ${perHour(e().profitPerPersonDay.after)}`}
        />
        <Stat label={r.quality} value={t.percent(e().quality)} />
      </dl>
      <div class="flex flex-wrap gap-3">
        <CopyButton
          text={() => practiceReport(props.job, e(), 'text')}
          label={r.copyText}
          copied={r.copied}
          failed={r.copyFailed}
          data="text"
        />
        <CopyButton
          text={() => practiceReport(props.job, e(), 'markdown')}
          label={r.copyMarkdown}
          copied={r.copied}
          failed={r.copyFailed}
          data="markdown"
        />
      </div>
    </section>
  );
}

function Stat(props: { label: string; value: string; note?: string; data?: string }) {
  return (
    <div class="flex flex-col" data-stat={props.data ?? ''}>
      <dt class="text-[11px] text-ink-muted">{props.label}</dt>
      <dd class="font-heading text-base tabular-nums">{props.value}</dd>
      <Show when={props.note}>
        <dd class="text-[11px] text-ink-muted">{props.note}</dd>
      </Show>
    </div>
  );
}
