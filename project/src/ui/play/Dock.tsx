import { createMemo, For, Match, Show, Switch } from 'solid-js';
import type { GameStore } from '../../app/store';
import { balance } from '../../content/balance';
import { getProject } from '../../content/index';
import type { DockLayout, HudItemId } from '../../content/look/layout';
import { ja } from '../../i18n/ja';
import { type HudView, hudView } from '../../view/hud';
import { Icon } from '../Icon';
import { Meter, PlayPauseIcon, panel } from '../parts';

const t = ja.hud;

/**
 * 下部のドック（D3「ゲームのドック」）。先頭に案件名（見出しで、常時表示の項目には数えない）、
 * 続けて dock.items の項目を並べる。スマホ（compact）では画面幅いっぱいの2段にする。
 * 値は view/hud.ts から読み、操作は Command（TogglePause / SetSpeed）で行う。
 */
export function Dock(props: {
  store: GameStore;
  projectId: string;
  layout: DockLayout;
  compact: boolean;
  problemCount: number;
  onProblems: () => void;
  ref?: (el: HTMLElement) => void;
}) {
  const hud = createMemo(() => hudView(props.store.state(), props.projectId));
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
          <For each={props.layout.items}>
            {(id) => (
              <div data-hud-item={id} class="flex min-w-0 items-center">
                <HudItem
                  id={id}
                  hud={h()}
                  store={props.store}
                  dense={props.compact}
                  problemCount={props.problemCount}
                  onProblems={props.onProblems}
                />
              </div>
            )}
          </For>
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
}) {
  return (
    <Switch>
      <Match when={props.id === 'profitPerHumanHour'}>
        <Figure
          icon="money"
          label={props.hud.projected ? `${t.profit}（${t.projected}）` : t.profit}
          value={t.yenPerHour(props.hud.profitPerHumanHour)}
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
          <Bar label={t.ai} icon="ai" ratio={props.hud.ai} color="bg-success-400" dense={props.dense} />
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

function Figure(props: {
  icon: 'money' | 'clock' | 'warning';
  label: string;
  value: string;
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
