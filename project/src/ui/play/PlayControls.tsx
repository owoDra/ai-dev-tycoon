import { createMemo, For, type JSX, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import type { IconName } from '../../assets/icons';
import { balance } from '../../content/balance';
import { calendarDay, type DayPhase, dayPhase, minuteOfDay } from '../../core/clock';
import { awaitingAssignment, idleHours } from '../../core/step';
import { freshMenus, isUnlocked } from '../../core/unlocks';
import { ja } from '../../i18n/ja';
import { hhmm } from '../../view/hud';
import { Icon } from '../Icon';
import { NewBadge, PlayPauseIcon, panel, SettingsIcon } from '../parts';

const t = ja.hud;

const phaseIcon: Record<DayPhase, IconName> = { work: 'day', lunch: 'clock', night: 'night' };

/**
 * 上の帯の右の操作の列：日付と時刻（勤務中・昼休み・退勤後をアイコンとラベルで示す）・一時停止と速度・メニュー（案件ボード・社員と Seat・Harness・設定）。
 * compact ではメニューをアイコンだけにし、速度を1つのボタンで順に切り替える。part で一部だけを出せる
 * （スマホでは時計と一時停止・速度を右上に、メニューをドックの2段目に分けて出す。content/look/layout.ts の controls）。
 * 速度は解放（dock:speed）されるまで一時停止だけを出す。
 * 操作は Command（TogglePause / SetSpeed）と、渡されたシートを開く関数で行う（渡されなければそのボタンを出さない）。
 */
export function PlayControls(props: {
  store: GameStore;
  compact: boolean;
  onBoard?: () => void;
  onTeam?: () => void;
  /** AI Worker の運用者の Seat の使用量が上限を超えている（社員と Seat のボタンに警告を出す） */
  teamWarning?: boolean;
  onHarness?: () => void;
  onSettings?: () => void;
  /** all: すべて / clock: 時計と一時停止・速度だけ / menu: メニューだけ（枠なし） */
  part?: 'all' | 'clock' | 'menu';
}) {
  const speedOn = () => isUnlocked(props.store.state(), 'dock:speed');
  const part = () => props.part ?? 'all';
  /** 解放したがまだ開いていない機能のあるメニュー（「NEW」の印） */
  const fresh = createMemo(() => freshMenus(props.store.state()));
  return (
    <div class={`flex items-center gap-2 ${part() === 'menu' ? '' : `${panel} px-2 py-1`}`} data-play-controls={part()}>
      <Show when={part() !== 'menu'}>
        <ClockPill store={props.store} dense={props.compact} />
        <Show when={speedOn()} fallback={<PauseButton store={props.store} />}>
          <SpeedControl store={props.store} dense={props.compact} />
        </Show>
      </Show>
      <Show when={part() !== 'clock'}>
        <nav aria-label={t.menu} class="flex items-center gap-1">
          <Show when={props.onBoard}>
            {(open) => (
              <MenuButton
                icon="board"
                label={t.board}
                compact={props.compact}
                onClick={open()}
                data={{ 'data-menu-board': '' }}
              />
            )}
          </Show>
          <Show when={props.onTeam}>
            {(open) => (
              <MenuButton
                compact={props.compact}
                icon="seat"
                label={ja.team.open}
                ariaLabel={props.teamWarning ? `${ja.team.open}（${ja.team.overLimit}）` : ja.team.open}
                warning={props.teamWarning}
                fresh={fresh().has('team')}
                onClick={open()}
                data={{ 'data-team-open': '' }}
              />
            )}
          </Show>
          <Show when={props.onHarness}>
            {(open) => (
              <MenuButton
                compact={props.compact}
                icon="ai"
                label={ja.harness.openShort}
                ariaLabel={ja.harness.open}
                fresh={fresh().has('harness') || fresh().has('library')}
                onClick={open()}
                data={{ 'data-harness-open': '' }}
              />
            )}
          </Show>
          <Show when={props.onSettings}>
            {(open) => (
              <button
                type="button"
                class="flex size-11 items-center justify-center rounded-md border-[3px] border-line bg-surface"
                aria-label={ja.settings.open}
                title={ja.settings.open}
                onClick={() => open()()}
              >
                <SettingsIcon />
              </button>
            )}
          </Show>
        </nav>
      </Show>
    </div>
  );
}

/** 日付と時刻。勤務時間の区分をアイコンとラベルで示し、夜を早送りしている間は「早送り中」を添える */
function ClockPill(props: { store: GameStore; dense: boolean }) {
  const clock = () => props.store.state().clock;
  const phase = createMemo(() => dayPhase(clock()));
  const waiting = () => !props.store.state().paused && awaitingAssignment(props.store.state());
  const skipping = () => !props.store.state().paused && !waiting() && idleHours(props.store.state());
  return (
    <div class="flex min-w-0 items-center gap-1.5" title={t.phaseHint[phase()]} data-clock data-phase={phase()}>
      <Icon name={phaseIcon[phase()]} class={props.dense ? 'text-lg' : 'text-2xl'} />
      <div class="flex flex-col leading-tight">
        <span class={`font-heading whitespace-nowrap tabular-nums ${props.dense ? 'text-sm' : 'text-base'}`}>
          {t.today(calendarDay(clock()) + 1, hhmm(minuteOfDay(clock())))}
        </span>
        <span
          class={`truncate text-[11px] font-bold whitespace-nowrap text-ink-muted ${props.dense ? 'max-w-24' : ''}`}
          data-phase-label
        >
          {t.phase[phase()]}
          <Show when={skipping()}> · {t.skipping}</Show>
          <Show when={waiting()}> · {t.waiting}</Show>
        </span>
      </div>
    </div>
  );
}

function PauseButton(props: { store: GameStore }) {
  const paused = () => props.store.state().paused;
  return (
    <button
      type="button"
      class="flex size-11 items-center justify-center rounded-md border-[3px] border-line bg-accent-400 text-on-accent"
      aria-label={paused() ? ja.controls.resume : ja.controls.pause}
      onClick={() => props.store.dispatch({ type: 'TogglePause' })}
    >
      <PlayPauseIcon paused={paused()} />
    </button>
  );
}

/** 一時停止と速度。スマホでは速度を1つのボタンで順に切り替える */
export function SpeedControl(props: { store: GameStore; dense: boolean }) {
  const speed = () => props.store.state().speed;
  return (
    <div class="flex items-center gap-1">
      <PauseButton store={props.store} />
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

/** メニューのボタン。アイコンの下に短いラベルを出す（警告があれば警告のアイコンを重ねて、地の色も変える） */
function MenuButton(props: {
  icon: IconName;
  label: string;
  /** スマホではラベルを出さずアイコンだけにする（名前は aria-label と title で出す） */
  compact?: boolean;
  ariaLabel?: string;
  warning?: boolean;
  /** 解放したがまだ開いていない（「NEW」の印を右上に出す） */
  fresh?: boolean;
  onClick: () => void;
  data?: Record<string, string>;
}): JSX.Element {
  return (
    <button
      type="button"
      {...props.data}
      class={`relative flex h-11 flex-col items-center justify-center rounded-md border-[3px] border-line px-1 ${
        props.compact ? 'w-11' : 'min-w-12'
      } ${props.warning ? 'bg-danger-200' : 'bg-surface'}`}
      aria-label={`${props.ariaLabel ?? props.label}${props.fresh ? `（${ja.unlocks.badge}）` : ''}`}
      title={props.label}
      onClick={() => props.onClick()}
    >
      <Icon name={props.icon} class={props.compact ? 'text-2xl' : 'text-lg'} />
      <Show when={!props.compact}>
        <span class="text-[10px] leading-none font-bold whitespace-nowrap">{props.label}</span>
      </Show>
      <Show when={props.fresh && !props.warning}>
        <NewBadge class="absolute -top-2.5 -right-2" />
      </Show>
      <Show when={props.warning}>
        <span class="absolute -top-2 -right-2 flex" data-team-warning>
          <Icon name="warning" class="text-base" />
        </span>
      </Show>
    </button>
  );
}
