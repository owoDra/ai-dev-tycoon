import { createMemo, type JSX, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import type { IconName } from '../../assets/icons';
import { balance } from '../../content/balance';
import { calendarDay, type DayPhase, dayPhase, minuteOfDay } from '../../core/clock';
import { unassignedProjects } from '../../core/turn';
import { freshMenus, isUnlocked } from '../../core/unlocks';
import { ja } from '../../i18n/ja';
import { hhmm } from '../../view/hud';
import { Icon } from '../Icon';
import { DayIcon, NewBadge, panel, SettingsIcon } from '../parts';

const t = ja.hud;

const phaseIcon: Record<DayPhase, IconName> = { work: 'day', lunch: 'clock', night: 'night' };

/**
 * 上の帯の右の操作の列：日付と時刻（勤務中・昼休み・退勤後をアイコンとラベルで示す）・日を進めるボタン・メニュー（案件ボード・社員と Seat・Context・Harness・設定）。
 * compact ではメニューをアイコンだけにする。part で一部だけを出せる
 * （スマホでは時計と日を進めるボタンを右上に、メニューをドックの2段目に分けて出す。content/look/layout.ts の controls）。
 * 「まとめて進める」は解放（dock:skip）されるまで出さない。
 * 時間はこのボタン（store.play）でだけ進む。メニューは渡されたシートを開く関数で開く（渡されなければそのボタンを出さない）。
 */
export function PlayControls(props: {
  store: GameStore;
  compact: boolean;
  onBoard?: () => void;
  /** 進み具合の一覧（案件のガントチャートと社員の勤務状態）を開く */
  onOverview?: () => void;
  onTeam?: () => void;
  /** 会社の Seat の使用量を使い切って AI が止まっている（社員と Seat のボタンに警告を出す） */
  teamWarning?: boolean;
  onHarness?: () => void;
  /** Context のシートを開く（ドックの Context の札は、狭い形では「詳細」に入って見えなくなるので、メニューにも置く） */
  onContext?: () => void;
  onSettings?: () => void;
  /** all: すべて / clock: 時計と一時停止・速度だけ / menu: メニューだけ（枠なし） */
  part?: 'all' | 'clock' | 'menu';
}) {
  const skipOn = () => isUnlocked(props.store.state(), 'dock:skip');
  const part = () => props.part ?? 'all';
  /** 解放したがまだ開いていない機能のあるメニュー（「NEW」の印） */
  const fresh = createMemo(() => freshMenus(props.store.state()));
  return (
    <div class={`flex items-center gap-2 ${part() === 'menu' ? '' : `${panel} px-2 py-1`}`} data-play-controls={part()}>
      <Show when={part() !== 'menu'}>
        <ClockPill store={props.store} dense={props.compact} />
        <DayControl store={props.store} dense={props.compact} skip={skipOn()} />
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
          <Show when={props.onOverview}>
            {(open) => (
              <MenuButton
                icon="project"
                label={ja.overview.open}
                compact={props.compact}
                onClick={open()}
                data={{ 'data-menu-overview': '' }}
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
          <Show when={props.onContext}>
            {(open) => (
              <MenuButton
                compact={props.compact}
                icon="context"
                label={ja.context.title}
                fresh={fresh().has('context')}
                onClick={open()}
                data={{ 'data-menu-context': '' }}
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

/** 日付と時刻。勤務時間の区分をアイコンとラベルで示し、進めている最中か・担当待ちがあるかを添える */
function ClockPill(props: { store: GameStore; dense: boolean }) {
  const clock = () => props.store.state().clock;
  const phase = createMemo(() => dayPhase(clock()));
  const running = () => props.store.run() !== null;
  const waiting = () => !running() && unassignedProjects(props.store.state()).length > 0;
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
          {t.phase[phase()]} · {running() ? t.running : waiting() ? t.waiting : t.stopped}
        </span>
      </div>
    </div>
  );
}

/**
 * 日を進めるボタン。「次の日へ」で1日、「まとめて進める」で判断が要るまで進める。進めている間は押したボタンが「止める」になる
 */
export function DayControl(props: { store: GameStore; dense: boolean; skip: boolean }) {
  const run = () => props.store.run();
  const button =
    'flex h-11 items-center justify-center gap-1 rounded-md border-[3px] border-line px-2 text-sm font-bold whitespace-nowrap';
  return (
    <div class="flex items-center gap-1">
      <button
        type="button"
        data-next-day
        class={`${button} bg-accent-400 text-on-accent`}
        aria-label={run() && !run()?.untilDecision ? t.stop : t.nextDay}
        title={t.nextDayHint}
        disabled={run()?.untilDecision === true}
        onClick={() => props.store.play(false)}
      >
        <DayIcon kind={run() && !run()?.untilDecision ? 'stop' : 'play'} />
        <Show when={!props.dense}>
          <span>{run() && !run()?.untilDecision ? t.stop : t.nextDay}</span>
        </Show>
      </button>
      <Show when={props.skip}>
        <button
          type="button"
          data-until-decision
          class={`${button} bg-surface disabled:opacity-50`}
          aria-label={run()?.untilDecision ? t.stop : t.untilDecision}
          title={t.untilDecisionHint(balance.time.maxSkipDays)}
          disabled={run() !== null && !run()?.untilDecision}
          onClick={() => props.store.play(true)}
        >
          <DayIcon kind={run()?.untilDecision ? 'stop' : 'skip'} />
          <Show when={!props.dense}>
            <span>{run()?.untilDecision ? t.stop : t.untilDecision}</span>
          </Show>
        </button>
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
