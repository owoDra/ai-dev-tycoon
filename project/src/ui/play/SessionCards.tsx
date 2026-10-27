import { For, type JSX, onMount, Show } from 'solid-js';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import type { ActiveProjectView, DaySummary, NextStep, Recap, TeamProgressView } from '../../view/session';
import { Icon } from '../Icon';
import { ghostButton, panel, primaryButton } from '../parts';

const t = ja.session;

/** 次にやることの文言 */
function stepText(step: NextStep): string {
  return step.kind === 'watch' ? t.steps.watch : t.steps[step.kind](step.count);
}

const stepIcon = { incident: 'warning', assign: 'project', offer: 'release', watch: 'ai' } as const;

/** 区切りとあらすじで共通のカードの枠。一時停止した上に出し、ボタンで閉じて再開する */
function SessionCard(props: {
  title: string;
  lead: string;
  data: string;
  primary: string;
  onPrimary: () => void;
  onQuit?: () => void;
  children: JSX.Element;
}) {
  let el!: HTMLDivElement;
  let button!: HTMLButtonElement;
  onMount(() => {
    enter(el, 'below');
    button.focus();
  });
  return (
    <div class="absolute inset-0 z-40 flex items-center justify-center bg-line/30 p-4">
      <div
        ref={el}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${props.data}-title`}
        class={`${panel} flex w-full max-w-sm flex-col gap-3 p-5`}
        data-session-card={props.data}
      >
        <h2 id={`${props.data}-title`} class="font-heading text-xl">
          {props.title}
        </h2>
        <p class="text-sm text-ink-muted">{props.lead}</p>
        {props.children}
        <div class="flex flex-wrap justify-end gap-2">
          <Show when={props.onQuit}>
            {(quit) => (
              <button type="button" class={ghostButton} data-quit onClick={() => quit()()}>
                <Icon name="success" label={t.saved} />
                {t.quit}
              </button>
            )}
          </Show>
          <button ref={button} type="button" class={primaryButton} data-resume onClick={() => props.onPrimary()}>
            {props.primary}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActiveList(props: { active: readonly ActiveProjectView[] }) {
  return (
    <Show when={props.active.length > 0}>
      <div>
        <p class="text-xs font-bold text-ink-muted">{t.active}</p>
        <ul class="flex flex-col gap-1 text-sm">
          <For each={props.active}>
            {(p) => (
              <li class="flex flex-wrap items-center justify-between gap-x-2" data-active={p.projectId}>
                <span class="font-bold">
                  <Icon name="project" /> {p.name}
                </span>
                <span class="tabular-nums">{t.progress(p.done, p.total)}</span>
                <span
                  class="w-full text-xs tabular-nums"
                  classList={{ 'text-danger-ink': p.daysLeft < 0, 'text-ink-muted': p.daysLeft >= 0 }}
                >
                  <Show when={p.daysLeft < 0}>
                    <Icon name="warning" />{' '}
                  </Show>
                  {t.daysLeft(p.daysLeft)}
                </span>
              </li>
            )}
          </For>
        </ul>
      </div>
    </Show>
  );
}

function TeamList(props: { teams: readonly TeamProgressView[] }) {
  return (
    <Show when={props.teams.length > 0}>
      <div>
        <p class="text-xs font-bold text-ink-muted">{t.teams}</p>
        <ul class="flex flex-col gap-1 text-sm">
          <For each={props.teams}>
            {(team) => (
              <li class="flex items-center gap-2" data-team-progress={team.teamId}>
                <Icon name={team.manager === 'ai' ? 'ai' : 'human'} />
                <span>{t.teamLine(team.name, team.active, team.delivered)}</span>
              </li>
            )}
          </For>
        </ul>
      </div>
    </Show>
  );
}

function NextList(props: { next: readonly NextStep[] }) {
  return (
    <div>
      <p class="text-xs font-bold text-ink-muted">{t.next}</p>
      <ul class="flex flex-col gap-1 text-sm">
        <For each={props.next}>
          {(s) => (
            <li class="flex items-start gap-2" data-next-step={s.kind}>
              <Icon name={stepIcon[s.kind]} class="mt-0.5" />
              <span>{stepText(s)}</span>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

/** 営業日の終わりの区切り：その日の成果と、次にやること */
export function DayBreakCard(props: { summary: DaySummary; onNext: () => void; onQuit: () => void }) {
  return (
    <SessionCard
      title={t.dayEnded(props.summary.day)}
      lead={t.dayLead}
      data="day"
      primary={t.nextDay}
      onPrimary={props.onNext}
      onQuit={props.onQuit}
    >
      <dl class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-md border-2 border-line bg-sunken p-2">
          <dt class="text-xs font-bold text-ink-muted">{t.tasks}</dt>
          <dd class="font-heading tabular-nums">{props.summary.tasksDone}</dd>
        </div>
        <div class="rounded-md border-2 border-line bg-sunken p-2">
          <dt class="text-xs font-bold text-ink-muted">{t.profit}</dt>
          <dd class="font-heading tabular-nums" data-day-profit>
            {ja.score.yen(props.summary.profit)}
          </dd>
        </div>
        <div class="rounded-md border-2 border-line bg-sunken p-2">
          <dt class="text-xs font-bold text-ink-muted">{t.humanTime}</dt>
          <dd class="font-heading tabular-nums">{ja.screens.result.hours(props.summary.humanMinutes)}</dd>
        </div>
      </dl>
      <For each={props.summary.delivered}>
        {(name) => (
          <p class="flex items-center gap-1 text-sm font-bold">
            <Icon name="trophy" /> {t.delivered(name)}
          </p>
        )}
      </For>
      <ActiveList active={props.summary.active} />
      <TeamList teams={props.summary.teams} />
      <NextList next={props.summary.next} />
    </SessionCard>
  );
}

/** 再開したときのあらすじ：閉じていた間に進んだこと・進行中の案件・次にやること */
export function RecapCard(props: { recap: Recap; onResume: () => void }) {
  const r = () => props.recap;
  return (
    <SessionCard
      title={t.recapTitle}
      lead={r().awayMinutes > 0 ? t.away(ja.screens.result.hours(r().awayMinutes)) : t.noAway}
      data="recap"
      primary={t.resume}
      onPrimary={props.onResume}
    >
      <Show when={r().awayMinutes > 0}>
        <ul class="flex flex-wrap gap-2 text-sm font-bold" data-away>
          <li class="rounded-full border-2 border-line bg-sunken px-2">
            <Icon name="success" /> {t.tasksDone(r().tasksDone)}
          </li>
          <Show when={r().incidents > 0}>
            <li class="rounded-full border-2 border-line bg-sunken px-2">
              <Icon name="warning" /> {t.incidents(r().incidents)}
            </li>
          </Show>
          <For each={r().delivered}>
            {(name) => (
              <li class="rounded-full border-2 border-line bg-accent-200 px-2">
                <Icon name="trophy" /> {t.delivered(name)}
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={r().fiscalClosed}>
        {(no) => (
          <p class="flex items-center gap-1 text-sm font-bold" data-recap-fiscal>
            <Icon name="money" /> {t.fiscalClosed(no())}
          </p>
        )}
      </Show>
      <ActiveList active={r().active} />
      <TeamList teams={r().teams} />
      <NextList next={r().next} />
    </SessionCard>
  );
}
