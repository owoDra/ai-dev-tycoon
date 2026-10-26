import { createMemo, For, type JSX, Match, Show, Switch } from 'solid-js';
import type { GameStore } from '../../app/store';
import { balance } from '../../content/balance';
import { getProject } from '../../content/index';
import type { DockLayout, HudItemId } from '../../content/look/layout';
import { dockFeature } from '../../content/unlocks';
import { isUnlocked } from '../../core/unlocks';
import { ja } from '../../i18n/ja';
import { contextView } from '../../view/context';
import { type HudView, hudView } from '../../view/hud';
import { Icon } from '../Icon';
import { Num } from '../Num';
import { iconButton, Meter, PlayPauseIcon, panel, SettingsIcon } from '../parts';
import { contextStatusIcon } from './ContextSheet';

const t = ja.hud;
/** Profit / Human Hour の増減チップを出す最小の変化（円/人時）。見込みの細かな揺れでは出さない */
const PROFIT_CHIP_MIN = 100;

/**
 * 下部のドック（D3「ゲームのドック」）。先頭に案件名（見出しで、常時表示の項目には数えない）、
 * 続けて dock.items の項目を並べる。スマホ（compact）では画面幅いっぱいの2段にする。
 * 値は view/hud.ts から読み、操作は Command（TogglePause / SetSpeed）で行う。
 * 解放の対象になっている項目（content/unlocks.ts の dockFeature）は、解放されるまで出さない。
 */
export function Dock(props: {
  store: GameStore;
  projectId: string;
  layout: DockLayout;
  compact: boolean;
  problemCount: number;
  onProblems: () => void;
  /** Context のシートを開く */
  onContext?: () => void;
  /** Harness Builder を開く（渡さなければボタンを出さない。解放前） */
  onHarness?: () => void;
  /** 設定を開く（渡さなければボタンを出さない） */
  onSettings?: () => void;
  ref?: (el: HTMLElement) => void;
}) {
  const hud = createMemo(() => hudView(props.store.state(), props.projectId));
  const items = createMemo(() =>
    props.layout.items.filter((id) => {
      const feature = dockFeature[id];
      return feature === undefined || isUnlocked(props.store.state(), feature);
    }),
  );
  return (
    <nav
      ref={props.ref}
      aria-label={t.dock}
      class={`${panel} absolute left-1/2 flex max-w-full -translate-x-1/2 items-center ${
        props.compact
          ? 'w-full flex-wrap justify-between gap-x-3 gap-y-2 rounded-b-none px-3 pt-2 pb-3'
          : 'gap-6 px-5 py-2.5'
      }`}
      style={{ bottom: `${props.layout.bottom}px` }}
    >
      <Show when={props.layout.projectName}>
        <h1
          class={`flex min-w-0 items-center gap-2 font-heading whitespace-nowrap ${props.compact ? 'basis-full text-sm' : 'text-base'}`}
        >
          <Icon name="project" class={props.compact ? 'text-lg' : 'text-2xl'} />
          <span class="truncate">{getProject(props.projectId).name}</span>
        </h1>
      </Show>
      <Show when={hud()}>
        {(h) => (
          <For each={items()}>
            {(id) => (
              <div data-hud-item={id} class="flex min-w-0 items-center">
                <HudItem
                  id={id}
                  hud={h()}
                  store={props.store}
                  dense={props.compact}
                  problemCount={props.problemCount}
                  onProblems={props.onProblems}
                  projectId={props.projectId}
                  onContext={props.onContext}
                />
              </div>
            )}
          </For>
        )}
      </Show>
      <Show when={props.onHarness}>
        {(open) => (
          <button
            type="button"
            data-harness-open
            class="flex h-11 items-center gap-1.5 rounded-md border-[3px] border-line bg-accent-200 px-2 text-sm font-bold whitespace-nowrap"
            aria-label={ja.harness.open}
            onClick={() => open()()}
          >
            <Icon name="ai" class="text-xl" />
            <Show when={!props.compact}>{ja.harness.openShort}</Show>
          </button>
        )}
      </Show>
      <Show when={props.onSettings}>
        {(open) => (
          <button type="button" class={iconButton} aria-label={ja.settings.open} onClick={() => open()()}>
            <SettingsIcon />
          </button>
        )}
      </Show>
    </nav>
  );
}

function HudItem(props: {
  id: HudItemId;
  hud: HudView;
  store: GameStore;
  dense: boolean;
  problemCount: number;
  onProblems: () => void;
  projectId: string;
  onContext?: () => void;
}) {
  return (
    <Switch>
      <Match when={props.id === 'profitPerHumanHour'}>
        <Figure
          icon="money"
          label={props.hud.projected ? `${t.profit}（${t.projected}）` : t.profit}
          value={<Num value={props.hud.profitPerHumanHour} format={t.yenPerHour} chipMin={PROFIT_CHIP_MIN} />}
          dense={props.dense}
        />
      </Match>
      <Match when={props.id === 'remaining'}>
        <Figure
          icon={props.hud.remaining.overdue ? 'warning' : 'clock'}
          label={props.hud.remaining.overdue ? t.overdue : t.remaining}
          value={t.remainingValue(props.hud.remaining.days, props.hud.remaining.time)}
          sub={t.today(props.hud.today.day, props.hud.today.time)}
          dense={props.dense}
          danger={props.hud.remaining.overdue}
        />
      </Match>
      <Match when={props.id === 'utilization'}>
        <fieldset class="flex flex-col gap-0.5" aria-label={t.utilization}>
          <Bar label={t.human} icon="human" ratio={props.hud.human} color="bg-primary-400" dense={props.dense} />
          <div class="flex items-center gap-1.5">
            <Bar label={t.ai} icon="ai" ratio={props.hud.ai} color="bg-success-400" dense={props.dense} />
            <ContextBadge store={props.store} projectId={props.projectId} onOpen={props.onContext} />
          </div>
        </fieldset>
      </Match>
      <Match when={props.id === 'speed'}>
        <SpeedControl store={props.store} dense={props.dense} />
      </Match>
      <Match when={props.id === 'problems'}>
        <button
          type="button"
          class="relative flex size-11 items-center justify-center rounded-md border-[3px] border-line bg-surface text-2xl"
          aria-label={t.problemsCount(props.problemCount)}
          onClick={() => props.onProblems()}
        >
          <Icon name="warning" />
          <Show when={props.problemCount > 0}>
            <span
              class="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border-2 border-line bg-danger-500 font-heading text-[11px] text-white"
              aria-hidden="true"
            >
              {props.problemCount}
            </span>
          </Show>
        </button>
      </Match>
    </Switch>
  );
}

/**
 * AI の稼働バーの横に出す Context の状態（企画書41章：数字ではなく意味を出す）。押すと Context のシートを開く。
 * 資料のない案件や、Context が未解放なら出さない
 */
const badgeBg = { good: 'bg-surface', cluttered: 'bg-warning-200', overflow: 'bg-danger-200' } as const;

function ContextBadge(props: { store: GameStore; projectId: string; onOpen?: () => void }) {
  const view = createMemo(() => contextView(props.store.state(), props.projectId));
  return (
    <Show when={view()}>
      {(v) => (
        <button
          type="button"
          data-context-badge={v().status}
          class={`flex min-h-6 items-center gap-1 rounded-full border-2 border-line px-1.5 text-[11px] font-bold whitespace-nowrap ${badgeBg[v().status]}`}
          aria-label={ja.context.open(ja.context.status[v().status])}
          onClick={() => props.onOpen?.()}
        >
          <Icon name={contextStatusIcon[v().status]} />
          {ja.context.status[v().status]}
        </button>
      )}
    </Show>
  );
}

function Figure(props: {
  icon: 'money' | 'clock' | 'warning';
  label: string;
  value: JSX.Element;
  sub?: string;
  dense: boolean;
  danger?: boolean;
}) {
  return (
    <div class="flex items-center gap-2">
      <Icon name={props.icon} class={props.dense ? 'text-xl' : 'text-2xl'} />
      <div class="flex flex-col leading-tight">
        <span class="text-[11px] font-bold whitespace-nowrap text-ink-muted">{props.label}</span>
        <span
          class={`font-heading whitespace-nowrap tabular-nums ${props.dense ? 'text-base' : 'text-xl'}`}
          classList={{ 'text-danger-ink': props.danger }}
        >
          {props.value}
        </span>
        <Show when={props.sub && !props.dense}>
          <span class="text-[11px] whitespace-nowrap text-ink-muted tabular-nums">{props.sub}</span>
        </Show>
      </div>
    </div>
  );
}

function Bar(props: { label: string; icon: 'human' | 'ai'; ratio: number; color: string; dense: boolean }) {
  return (
    <div class="flex items-center gap-1.5">
      <Icon name={props.icon} class="text-base" />
      <span class="w-7 text-[11px] font-bold">{props.label}</span>
      <Meter
        ratio={props.ratio}
        label={`${t.utilization} ${props.label} ${ja.score.percent(props.ratio)}`}
        color={props.color}
        class={props.dense ? 'w-12' : 'w-20'}
      />
    </div>
  );
}

function SpeedControl(props: { store: GameStore; dense: boolean }) {
  const paused = () => props.store.state().paused;
  const speed = () => props.store.state().speed;
  return (
    <div class="flex items-center gap-1">
      <button
        type="button"
        class="flex size-11 items-center justify-center rounded-md border-[3px] border-line bg-accent-400 text-on-accent"
        aria-label={paused() ? ja.controls.resume : ja.controls.pause}
        onClick={() => props.store.dispatch({ type: 'TogglePause' })}
      >
        <PlayPauseIcon paused={paused()} />
      </button>
      <Show
        when={!props.dense}
        fallback={
          <button
            type="button"
            class="h-11 min-w-11 rounded-md border-[3px] border-line bg-surface px-1.5 text-sm font-bold"
            aria-label={t.nextSpeed(speed())}
            onClick={() => {
              const speeds = balance.time.speeds;
              const i = speeds.indexOf(speed());
              props.store.dispatch({ type: 'SetSpeed', speed: speeds[(i + 1) % speeds.length] ?? speeds[0] });
            }}
          >
            {t.speed(speed())}
          </button>
        }
      >
        <fieldset class="flex gap-1" aria-label={ja.controls.speedGroup}>
          <For each={balance.time.speeds}>
            {(s) => (
              <button
                type="button"
                aria-pressed={speed() === s}
                aria-label={ja.controls.speed(s)}
                class="h-11 min-w-11 rounded-md border-[3px] border-line/30 bg-surface px-1.5 text-sm font-bold aria-pressed:border-line aria-pressed:bg-accent-200"
                onClick={() => props.store.dispatch({ type: 'SetSpeed', speed: s })}
              >
                {t.speed(s)}
              </button>
            )}
          </For>
        </fieldset>
      </Show>
    </div>
  );
}
