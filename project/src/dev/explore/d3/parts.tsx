import { type Accessor, createMemo, For, type JSX, Match, Show, Switch } from 'solid-js';
import type { GameStore } from '../../../app/store';
import type { IconName } from '../../../assets/icons';
import { assignModes } from '../../../content/assignModes';
import { balance } from '../../../content/balance';
import type { HudItemId, LayoutForm, UiLayout } from '../../../content/look/layout';
import type { AssignModeId } from '../../../content/types';
import { ja } from '../../../i18n/ja';
import { Icon } from '../../../ui/Icon';
import type { Selection } from '../../../ui/selection';
import { type TaskRowView, taskRows } from '../../../view/project';
import { describeEntity, type WorldViewModel } from '../../../view/world';
import type { World } from '../../../world/index';
import { type HudValues, type Problem, SANDBOX_PROJECT } from './sandbox';

export const t = ja.explore.d3;

/** プロトタイプの UI が受け取るもの（ワールド・状態・選択・幅に応じた構成） */
export interface Proto {
  readonly store: GameStore;
  readonly layout: UiLayout;
  readonly form: Accessor<LayoutForm>;
  readonly compact: Accessor<boolean>;
  /** 枠の大きさ（CSS ピクセル） */
  readonly size: Accessor<{ width: number; height: number }>;
  readonly world: Accessor<World | undefined>;
  readonly vm: Accessor<WorldViewModel | undefined>;
  readonly selection: Selection;
  readonly hud: Accessor<HudValues>;
  readonly problems: Accessor<Problem[]>;
  select(entityId: string | null): void;
  /** 問題の「次の行動」：該当するものを選び、隠れていない範囲の中心（中心から offset ずらした位置）へカメラを寄せる */
  goTo(entityId: string, offset: { x: number; y: number }): void;
  assign(taskId: string, mode: AssignModeId): void;
}

export const panel = 'rounded-lg border-[3px] border-line bg-surface text-ink shadow-pop';
export const primaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border-[3px] border-line bg-accent-400 px-4 font-heading text-on-accent shadow-pop transition-transform active:translate-y-1 active:shadow-none';
export const ghostButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border-[3px] border-line bg-surface px-3 font-bold text-ink hover:bg-sunken';

export const modeIcon: Record<AssignModeId, IconName> = {
  human: 'human',
  ai: 'ai',
  aiThenHumanReview: 'review',
  aiThenEval: 'eval',
  humanThenAi: 'handoff',
  agentWorkflow: 'workflow',
};

// ---- HUD ----

export function HudItem(props: { id: HudItemId; proto: Proto; dense?: boolean; onProblems?: () => void }) {
  return (
    <Switch>
      <Match when={props.id === 'profitPerPersonDay'}>
        <ProfitItem value={props.proto.hud().profitPerPersonDay} dense={props.dense} />
      </Match>
      <Match when={props.id === 'remaining'}>
        <RemainingItem hud={props.proto.hud()} dense={props.dense} />
      </Match>
      <Match when={props.id === 'utilization'}>
        <UtilizationItem hud={props.proto.hud()} dense={props.dense} />
      </Match>
      <Match when={props.id === 'speed'}>
        <SpeedItem store={props.proto.store} dense={props.dense} />
      </Match>
      <Match when={props.id === 'problems'}>
        <ProblemsItem count={props.proto.problems().length} onClick={() => props.onProblems?.()} />
      </Match>
    </Switch>
  );
}

function ProfitItem(props: { value: number; dense?: boolean }) {
  return (
    <div class="flex items-center gap-2">
      <Icon name="money" class={props.dense ? 'text-xl' : 'text-2xl'} />
      <div class="flex flex-col leading-tight">
        <span class="text-[11px] font-bold whitespace-nowrap text-ink-muted">{t.hud.profit}</span>
        <span class={`font-heading whitespace-nowrap tabular-nums ${props.dense ? 'text-base' : 'text-xl'}`}>
          {t.hud.yenPerPersonDay(props.value)}
        </span>
      </div>
    </div>
  );
}

function RemainingItem(props: { hud: HudValues; dense?: boolean }) {
  return (
    <div class="flex items-center gap-2">
      <Icon name="clock" class={props.dense ? 'text-xl' : 'text-2xl'} />
      <div class="flex flex-col leading-tight">
        <span class="text-[11px] font-bold whitespace-nowrap text-ink-muted">{t.hud.remaining}</span>
        <span class={`font-heading whitespace-nowrap tabular-nums ${props.dense ? 'text-base' : 'text-xl'}`}>
          {t.hud.remainingValue(props.hud.remainingDays, props.hud.remainingTime)}
        </span>
      </div>
    </div>
  );
}

function UtilizationItem(props: { hud: HudValues; dense?: boolean }) {
  const bar = (label: string, icon: IconName, ratio: number, color: string) => (
    <div class="flex items-center gap-1.5">
      <Icon name={icon} class="text-base" />
      <span class="w-7 text-[11px] font-bold">{label}</span>
      <span
        class={`relative h-2.5 overflow-hidden rounded-full border-2 border-line bg-sunken ${props.dense ? 'w-12' : 'w-20'}`}
        aria-hidden="true"
      >
        <span class={`absolute inset-y-0 left-0 ${color} transition-[width]`} style={{ width: `${ratio * 100}%` }} />
      </span>
      <span class="sr-only">{ja.score.percent(ratio)}</span>
    </div>
  );
  return (
    <div class="flex flex-col gap-0.5" title={t.hud.utilization}>
      {bar(t.hud.human, 'human', props.hud.human, 'bg-primary-400')}
      {bar(t.hud.ai, 'ai', props.hud.ai, 'bg-success-400')}
    </div>
  );
}

function SpeedItem(props: { store: GameStore; dense?: boolean }) {
  const paused = () => props.store.state().paused;
  return (
    <div class="flex items-center gap-1">
      <button
        type="button"
        class="flex size-11 items-center justify-center rounded-md border-[3px] border-line bg-accent-400 text-on-accent"
        aria-label={paused() ? ja.controls.resume : ja.controls.pause}
        onClick={() => props.store.dispatch({ type: 'TogglePause' })}
      >
        <svg viewBox="0 0 16 16" class="size-4 fill-current" aria-hidden="true">
          <path d={paused() ? 'M4 2.5v11l9-5.5z' : 'M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z'} />
        </svg>
      </button>
      <Show when={!props.dense}>
        <fieldset class="flex gap-1" aria-label={ja.controls.speedGroup}>
          <For each={balance.time.speeds}>
            {(s) => (
              <button
                type="button"
                aria-pressed={props.store.state().speed === s}
                class="h-11 min-w-9 rounded-md border-[3px] border-line/30 bg-surface px-1.5 text-sm font-bold aria-pressed:border-line aria-pressed:bg-accent-200"
                onClick={() => props.store.dispatch({ type: 'SetSpeed', speed: s })}
              >
                {t.hud.speed(s)}
              </button>
            )}
          </For>
        </fieldset>
      </Show>
      <Show when={props.dense}>
        <button
          type="button"
          class="h-11 min-w-11 rounded-md border-[3px] border-line bg-surface px-1.5 text-sm font-bold"
          aria-label={ja.controls.speedGroup}
          onClick={() => {
            const speeds = balance.time.speeds;
            const i = speeds.indexOf(props.store.state().speed);
            props.store.dispatch({ type: 'SetSpeed', speed: speeds[(i + 1) % speeds.length] ?? speeds[0] });
          }}
        >
          {t.hud.speed(props.store.state().speed)}
        </button>
      </Show>
    </div>
  );
}

function ProblemsItem(props: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      class="relative flex size-11 items-center justify-center rounded-md border-[3px] border-line bg-surface text-2xl"
      aria-label={t.hud.problemsCount(props.count)}
      onClick={() => props.onClick()}
    >
      <Icon name="warning" />
      <Show when={props.count > 0}>
        <span class="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border-2 border-line bg-danger-500 text-[11px] font-heading text-white">
          {props.count}
        </span>
      </Show>
    </button>
  );
}

// ---- 選択したものの詳細 ----

export interface Picked {
  kind: 'island' | 'human' | 'agent' | 'packet';
  label: string;
  /** 島なら Task の行 */
  row: TaskRowView | null;
  progress: number;
  queue: number;
  /** キャラクターなら居る島の名前 */
  place: string | null;
}

export function usePicked(proto: Proto): Accessor<Picked | null> {
  return createMemo(() => {
    const id = proto.selection.selected();
    const vm = proto.vm();
    if (!id || !vm) return null;
    const d = describeEntity(vm, id);
    if (!d) return null;
    const island = vm.islands.find((i) => i.id === id);
    const row = island
      ? (taskRows(proto.store.state(), SANDBOX_PROJECT).find((r) => r.id === island.taskId) ?? null)
      : null;
    const actor = vm.actors.find((a) => a.id === id);
    const at = actor?.islandId ? vm.islands.find((i) => i.id === actor.islandId) : undefined;
    return {
      kind: d.kind,
      label: d.label,
      row,
      progress: island?.progress ?? 0,
      queue: island?.queueLength ?? 0,
      place: actor ? (at?.label ?? t.detail.rest) : null,
    };
  });
}

export const kindIcon: Record<Picked['kind'], IconName> = {
  island: 'workflow',
  human: 'human',
  agent: 'ai',
  packet: 'project',
};

/** 詳細の見出し（アイコン・種類・名前） */
export function DetailTitle(props: { picked: Picked }) {
  return (
    <div class="flex min-w-0 items-center gap-2">
      <span class="flex size-10 shrink-0 items-center justify-center rounded-md border-[3px] border-line bg-accent-200 text-2xl">
        <Icon name={kindIcon[props.picked.kind]} />
      </span>
      <div class="flex min-w-0 flex-col leading-tight">
        <span class="text-[11px] font-bold text-ink-muted">{ja.world.kinds[props.picked.kind]}</span>
        <span class="truncate font-heading text-lg">{props.picked.label}</span>
      </div>
    </div>
  );
}

/** 詳細の情報（状態・担当・進み具合など）。全部は見せず、選んだものの要点だけ */
export function DetailFacts(props: { picked: Picked }) {
  const p = () => props.picked;
  return (
    <dl class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
      <Show when={p().row}>
        {(row) => (
          <>
            <dt class="text-ink-muted">{t.detail.status}</dt>
            <dd class="flex items-center gap-1 font-bold">
              <StatusIcon status={row().status} />
              {ja.project.status[row().status]}
              <Show when={row().stage}>
                {(s) => <span class="font-normal text-ink-muted">· {ja.stages[s()]}</span>}
              </Show>
            </dd>
            <dt class="text-ink-muted">{t.detail.assign}</dt>
            <dd class="flex items-center gap-1 font-bold">
              <Show when={row().mode} fallback={<span class="text-danger-ink">{t.detail.unassigned}</span>}>
                {(m) => (
                  <>
                    <Icon name={modeIcon[m()]} />
                    {ja.modes[m()]}
                  </>
                )}
              </Show>
            </dd>
            <dt class="text-ink-muted">{t.detail.progress}</dt>
            <dd class="flex items-center gap-2">
              <span class="relative h-2.5 w-full max-w-40 overflow-hidden rounded-full border-2 border-line bg-sunken">
                <span class="absolute inset-y-0 left-0 bg-primary-400" style={{ width: `${p().progress * 100}%` }} />
              </span>
              <span class="tabular-nums">{ja.score.percent(p().progress)}</span>
            </dd>
            <Show when={p().queue > 0}>
              <dt class="text-ink-muted">{t.detail.queue}</dt>
              <dd class="flex items-center gap-1 font-bold text-danger-ink">
                <Icon name="bottleneck" />
                {ja.world.queue(p().queue)}
              </dd>
            </Show>
          </>
        )}
      </Show>
      <Show when={p().place}>
        {(place) => (
          <>
            <dt class="text-ink-muted">{t.detail.place}</dt>
            <dd class="font-bold">{place()}</dd>
          </>
        )}
      </Show>
    </dl>
  );
}

/** 状態を色だけでなく形でも示す小さなアイコン */
export function StatusIcon(props: { status: TaskRowView['status'] }) {
  const shapes: Record<TaskRowView['status'], () => JSX.Element> = {
    unassigned: () => <circle cx="8" cy="8" r="5" class="fill-none stroke-ink-muted" stroke-width="2" />,
    waiting: () => <circle cx="8" cy="8" r="5" class="fill-ink-muted" />,
    queued: () => <path d="M3 4h10M3 8h10M3 12h10" class="stroke-warning-600" stroke-width="2" />,
    running: () => <path d="M4 2.5v11l9-5.5z" class="fill-primary-500" />,
    done: () => <path d="M3 8.5l3 3 7-7" class="fill-none stroke-success-600" stroke-width="2.5" />,
    defect: () => (
      <path d="M8 2l6.5 12h-13zM8 6.5v3.5M8 11.5v1" class="fill-none stroke-danger-600" stroke-width="1.8" />
    ),
  };
  return (
    <svg viewBox="0 0 16 16" class="size-4 shrink-0" aria-hidden="true">
      {shapes[props.status]()}
    </svg>
  );
}

// ---- 担当変更 ----

export interface AssignProps {
  row: TaskRowView;
  onPick: (mode: AssignModeId) => void;
}

/** 大きなカードから選ぶ。scroll なら横に並べてスクロールし、そうでなければ1行に全部並べる */
export function AssignCards(props: AssignProps & { scroll: boolean }) {
  return (
    <div class="flex flex-col gap-2">
      <p class="text-sm font-bold">{t.detail.change}</p>
      <fieldset
        aria-label={t.detail.change}
        class={props.scroll ? '-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2' : 'grid grid-cols-5 gap-2'}
      >
        <For each={assignModes}>
          {(m) => (
            <button
              type="button"
              aria-pressed={props.row.mode === m.id}
              disabled={!props.row.editable}
              class={`flex shrink-0 snap-start flex-col items-center gap-1 rounded-lg border-[3px] border-line bg-surface p-3 text-center shadow-pop transition-transform active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:shadow-none aria-pressed:bg-accent-300 ${props.scroll ? 'w-32' : ''}`}
              onClick={() => props.onPick(m.id)}
            >
              <span class="text-4xl">
                <Icon name={modeIcon[m.id]} />
              </span>
              <span class="font-heading text-sm leading-tight">{m.name}</span>
              <span class="text-[11px] leading-snug text-ink-muted">{t.modeHints[m.id]}</span>
            </button>
          )}
        </For>
      </fieldset>
      <Show when={!props.row.editable}>
        <p class="text-xs text-ink-muted">{t.detail.locked}</p>
      </Show>
    </div>
  );
}

// ---- 問題 ----

/** 問題 → 原因 → 次の行動 の3段 */
export function ProblemSteps(props: { problem: Problem; dense?: boolean }) {
  return (
    <ol class={`flex flex-col ${props.dense ? 'gap-0.5 text-xs' : 'gap-1 text-sm'}`}>
      <li class="flex items-start gap-1.5">
        <Icon name={props.problem.icon} class="mt-0.5 text-base" tone={props.problem.severity} />
        <span>
          <span class="font-bold">{props.problem.problem}</span>
        </span>
      </li>
      <li class="flex items-start gap-1.5 text-ink-muted">
        <span class="mt-0.5 w-4 shrink-0 text-center font-bold" aria-hidden="true">
          ↳
        </span>
        <span>
          <span class="sr-only">{t.problems.causeLabel}</span>
          {props.problem.cause}
        </span>
      </li>
    </ol>
  );
}
