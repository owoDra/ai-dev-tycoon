import { createSignal, Index, onCleanup, onMount, Show } from 'solid-js';
import { audio } from '../../audio/index';
import { type SheetLayout, sheetHeight } from '../../content/look/layout';
import type { Command } from '../../core/commands';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import type { BoardProjectView } from '../../view/board';
import { paceText } from '../../view/hud';
import type {
  CandidateView,
  Level,
  MemberView,
  SeatCountView,
  SeatPreview,
  TalentView,
  TeamView,
} from '../../view/team';
import type { TeamsView } from '../../view/teams';
import { Icon } from '../Icon';
import { Keyed } from '../Keyed';
import { ghostButton, Meter, panel, primaryButton, stateColor } from '../parts';
import { TeamsPanel } from './TeamsPanel';

const t = ja.team;

/** 差分の1行（AI 容量と費用）。増えるものは色だけでなく符号でも示す */
export function SeatPreviewLine(props: { preview: SeatPreview }) {
  return (
    <span class="flex flex-wrap gap-x-2 text-xs font-bold tabular-nums" data-seat-preview>
      <span class={props.preview.capacity > 0 ? 'text-success-700' : 'text-danger-700'}>
        {t.capacity(props.preview.capacity)}
      </span>
      <span class={props.preview.monthlyCost > 0 ? 'text-danger-700' : 'text-success-700'}>
        {t.cost(props.preview.monthlyCost)}
      </span>
    </span>
  );
}

/**
 * 社員と Seat の画面（企画書6章・47章）。社員のタブの上に、会社の Seat（Standard / Premium の枚数）と今日の AI の使用量を出す。
 * 枚数は −/＋ で1枚ずつ変え、＋ の横には1枚増やしたときの差分「AI 容量 +150 / 日・費用 +¥XX,XXX / 月」を常に出す
 * （確定のトースト「✓ Premiumを1枚に変更」は PlayScreen が SeatsChanged から出す）。
 * 使用量は時間とともに変わるので、行は Index で並べて要素を作り直さない（押したボタンのフォーカスを保つ）。
 * 採用が解放されたら、社員と採用候補のタブで切り替える。どちらのカードも売値・原価・速度・正確さ・得意分野を
 * 同じ並びで出し、平均との比較を色だけでなく矢印とラベルでも示す。
 * 案件ボードのある会社では、納品した案件の一覧を「実績」のタブに出す。
 */
export function TeamSheet(props: {
  view: TeamView;
  /** チームと会社の規模（案件ボードのある会社だけ） */
  teams?: TeamsView | null;
  /** 納品した案件（案件ボードのある会社だけ。「実績」のタブ） */
  delivered?: readonly BoardProjectView[] | null;
  layout: SheetLayout;
  bottom: number;
  viewHeight: number;
  /** 高さの上限（上の帯とドックの間。content/look/layout.ts の screenRegions） */
  maxHeight?: number;
  dispatch: (command: Command) => void;
  onClose: () => void;
  /** 納品した案件の振り返りを開く（実績の行のボタン） */
  onReview?: (projectId: string) => void;
}) {
  let el!: HTMLElement;
  const [tab, setTab] = createSignal<'members' | 'candidates' | 'teams' | 'record'>('members');
  const showCandidates = () => props.view.hiring && tab() === 'candidates';
  const showTeams = () => (props.teams ? tab() === 'teams' : false);
  const showRecord = () => (props.delivered ? tab() === 'record' : false);
  onMount(() => {
    audio.play('panelOpen');
    onCleanup(() => audio.play('panelClose'));
    enter(el, 'below');
  });
  return (
    <section
      ref={el}
      role="dialog"
      aria-modal="false"
      aria-label={t.title}
      data-team-sheet
      class={`${panel} absolute inset-x-0 mx-auto flex w-full flex-col gap-3 overflow-x-hidden overflow-y-auto rounded-b-none px-4 pt-3 pb-4`}
      style={{
        'max-width': `${props.layout.maxWidth}px`,
        bottom: `${props.bottom}px`,
        height: `${sheetHeight(props.layout, props.viewHeight, props.maxHeight)}px`,
      }}
    >
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-md border-[3px] border-line bg-accent-200 text-2xl">
            <Icon name="seat" />
          </span>
          <div class="flex min-w-0 flex-col leading-tight">
            <h2 class="truncate font-heading text-lg">{t.title}</h2>
            <span class="text-xs font-bold text-ink-muted">{t.lead}</span>
          </div>
        </div>
        <button type="button" class={ghostButton} onClick={() => props.onClose()}>
          {t.close}
        </button>
      </div>
      <Show when={props.view.hiring || props.teams || props.delivered}>
        <div role="tablist" aria-label={t.tabs} class="flex flex-wrap gap-1.5">
          <TabButton
            selected={tab() === 'members'}
            id="members"
            icon="human"
            label={t.membersTab(props.view.headcount.count, props.view.headcount.max)}
            onSelect={() => setTab('members')}
          />
          <Show when={props.view.hiring}>
            <TabButton
              selected={tab() === 'candidates'}
              id="candidates"
              icon="success"
              label={t.candidatesTab(props.view.candidates.length)}
              onSelect={() => setTab('candidates')}
            />
          </Show>
          <Show when={props.teams}>
            <TabButton
              selected={tab() === 'teams'}
              id="teams"
              icon="human"
              label={ja.teams.tab}
              onSelect={() => setTab('teams')}
            />
          </Show>
          <Show when={props.delivered}>
            {(list) => (
              <TabButton
                selected={tab() === 'record'}
                id="record"
                icon="success"
                label={t.recordTab(list().length)}
                onSelect={() => setTab('record')}
              />
            )}
          </Show>
        </div>
      </Show>
      <Show when={showTeams() && props.teams}>{(v) => <TeamsPanel view={v()} dispatch={props.dispatch} />}</Show>
      <Show when={showRecord() && props.delivered}>
        {(list) => <DeliveredList items={list()} onReview={props.onReview} />}
      </Show>
      <Show when={!showTeams() && !showRecord()}>
        <Show
          when={showCandidates()}
          fallback={
            <>
              <SeatsPanel view={props.view} dispatch={props.dispatch} />
              <ul class="flex flex-col gap-2">
                <Index each={props.view.members}>{(m) => <MemberCard member={m()} dispatch={props.dispatch} />}</Index>
              </ul>
            </>
          }
        >
          <p class="text-xs font-bold text-ink-muted">{t.candidatesLead}</p>
          <Show
            when={props.view.candidates.length > 0}
            fallback={<p class="text-sm text-ink-muted">{t.noCandidates}</p>}
          >
            <ul class="flex flex-col gap-2">
              <Index each={props.view.candidates}>
                {(c) => <CandidateCard candidate={c()} dispatch={props.dispatch} />}
              </Index>
            </ul>
          </Show>
        </Show>
      </Show>
      <dl class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <div class="flex items-center gap-2" data-payroll>
          <dt class="flex items-center gap-1 text-ink-muted">
            <Icon name="money" />
          </dt>
          <dd class="font-bold tabular-nums">{t.payroll(props.view.payroll)}</dd>
        </div>
        <div class="flex items-center gap-2">
          <dt class="text-ink-muted">{t.total}</dt>
          <dd class="font-bold tabular-nums" data-team-total>
            {t.monthly(props.view.monthlyTotal)}
          </dd>
        </div>
        <Show when={props.view.model}>
          {(model) => (
            <div class="flex items-center gap-2">
              <dt class="flex items-center gap-1 text-ink-muted">
                <Icon name="model" />
                {t.model}
              </dt>
              <dd class="font-bold">
                {model().name}（{t.modelUsage(model().usagePerMinute)}）
              </dd>
            </div>
          )}
        </Show>
      </dl>
    </section>
  );
}

/** 会社の Seat。今日の使用量のメーター（使い切ったら警告）と、種類ごとの枚数の −/＋ */
function SeatsPanel(props: { view: TeamView; dispatch: (command: Command) => void }) {
  const u = () => props.view.usage;
  return (
    <section class="flex flex-col gap-2 rounded-lg border-[3px] border-line bg-sunken p-3" data-seats>
      <h3 class="flex items-center gap-1 font-heading text-base">
        <Icon name="seat" />
        {t.seats}
      </h3>
      <div class="flex flex-wrap items-center gap-2 text-xs font-bold" data-usage>
        <span class="text-ink-muted">{t.usage}</span>
        <Meter
          ratio={u().limit > 0 ? Math.min(1, u().used / u().limit) : 1}
          label={t.usageValue(u().used, u().limit)}
          color={u().over ? stateColor.danger : stateColor.ai}
          class="w-24"
        />
        <span class="tabular-nums">{t.usageValue(u().used, u().limit)}</span>
        <Show when={u().over}>
          <span class="flex items-center gap-1 text-danger-700" data-over-limit>
            <Icon name="warning" />
            {u().limit > 0 ? t.overLimit : t.noSeats}
          </span>
        </Show>
      </div>
      <ul class="flex flex-col gap-2">
        <Index each={props.view.seats}>{(s) => <SeatRow seat={s()} dispatch={props.dispatch} />}</Index>
      </ul>
    </section>
  );
}

function SeatRow(props: { seat: SeatCountView; dispatch: (command: Command) => void }) {
  const s = () => props.seat;
  const stepper =
    'inline-flex size-11 items-center justify-center rounded-md border-[3px] border-line bg-surface text-lg font-bold disabled:opacity-60';
  return (
    <li class="flex flex-wrap items-center justify-between gap-2" data-seat={s().id}>
      <div class="flex min-w-0 flex-col leading-tight">
        <span class="font-bold">{s().label}</span>
        <span class="text-[11px] text-ink-muted tabular-nums">{t.seatSpec(s().dailyUsage, s().monthlyCost)}</span>
      </div>
      <div class="flex items-center gap-2">
        <Show when={s().add}>
          <SeatPreviewLine preview={s().addPreview} />
        </Show>
        <button
          type="button"
          class={stepper}
          aria-label={t.removeSeat(s().label)}
          data-seat-remove={s().id}
          disabled={!s().remove}
          onClick={() => {
            const command = s().remove;
            if (command) props.dispatch(command);
          }}
        >
          −
        </button>
        <span class="min-w-10 text-center font-bold tabular-nums" data-seat-count>
          {t.seatCount(s().count)}
        </span>
        <button
          type="button"
          class={stepper}
          aria-label={t.addSeat(s().label)}
          data-seat-add={s().id}
          disabled={!s().add}
          onClick={() => {
            const command = s().add;
            if (command) props.dispatch(command);
          }}
        >
          ＋
        </button>
      </div>
    </li>
  );
}

function MemberCard(props: { member: MemberView; dispatch: (command: Command) => void }) {
  const m = () => props.member;
  return (
    <li class="flex flex-col gap-2 rounded-lg border-[3px] border-line bg-sunken p-3" data-member={m().id}>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <Icon name="human" class="shrink-0 text-2xl" />
          <div class="flex min-w-0 flex-col leading-tight">
            <span class="truncate font-bold">{t.member(m().name, m().role)}</span>
          </div>
        </div>
        <Show when={m().release || m().releaseBlocked}>
          <button
            type="button"
            data-release={m().id}
            disabled={!m().release}
            title={m().releaseBlocked ?? undefined}
            class="inline-flex min-h-8 items-center gap-1 rounded-md border-2 border-line bg-surface px-2 text-xs font-bold disabled:opacity-60"
            onClick={() => {
              const command = m().release;
              if (command) props.dispatch(command);
            }}
          >
            {t.release}
            <Show when={m().releaseBlocked}>{(why) => <span class="text-ink-muted">（{why()}）</span>}</Show>
          </button>
        </Show>
      </div>
      <TalentStats talent={m()} />
    </li>
  );
}

/** 納品した案件の一覧（納品した順）。案件ごとの人間1人あたりの月の利益ペースを並べ、振り返りを開ける */
function DeliveredList(props: { items: readonly BoardProjectView[]; onReview?: (projectId: string) => void }) {
  return (
    <Show when={props.items.length > 0} fallback={<p class="text-sm text-ink-muted">{t.noRecord}</p>}>
      <ul class="flex flex-col gap-2">
        <Keyed each={props.items} by={(p) => p.projectId}>
          {(p) => (
            <li
              class="flex items-center gap-3 rounded-lg border-[3px] border-line bg-sunken p-3"
              data-delivered={p.projectId}
            >
              <Icon name="success" class="shrink-0 text-3xl" />
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <h3 class="truncate font-heading text-base">{p.name}</h3>
                <p class="flex flex-wrap gap-x-3 text-xs font-bold text-ink-muted tabular-nums">
                  <span>{ja.screens.select.revenue(p.revenue)}</span>
                  <span>{ja.screens.select.tasks(p.tasks)}</span>
                  <Show when={p.profitPerPersonDay}>{(v) => <span>{paceText(v())}</span>}</Show>
                </p>
              </div>
              <Show when={props.onReview}>
                {(review) => (
                  <button
                    type="button"
                    data-delivered-review={p.projectId}
                    class={`${ghostButton} shrink-0`}
                    onClick={() => review()(p.projectId)}
                  >
                    <Icon name="eval" />
                    {ja.board.reviewProject}
                  </button>
                )}
              </Show>
            </li>
          )}
        </Keyed>
      </ul>
    </Show>
  );
}

function TabButton(props: {
  selected: boolean;
  id: string;
  icon: 'human' | 'success';
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.selected}
      data-team-tab={props.id}
      class={`flex min-h-11 items-center gap-1.5 rounded-md border-[3px] border-line px-3 text-sm font-bold ${
        props.selected ? 'bg-accent-200' : 'bg-sunken'
      }`}
      onClick={() => props.onSelect()}
    >
      <Icon name={props.icon} class="text-lg" />
      {props.label}
    </button>
  );
}

/** 平均との比較。色だけでなく矢印とラベルでも示す */
const levelMark: Record<Level, string> = { high: '▲', mid: '−', low: '▼' };
const levelColor: Record<Level, string> = { high: 'text-success-700', mid: 'text-ink-muted', low: 'text-danger-700' };

function LevelTag(props: { level: Level }) {
  return (
    <span class={`text-[11px] font-bold ${levelColor[props.level]}`} data-level={props.level}>
      {levelMark[props.level]}
      {t.level[props.level]}
    </span>
  );
}

/** 売値・原価・速度・正確さ・得意分野。社員と採用候補で同じ並びにして比べやすくする */
function TalentStats(props: { talent: TalentView }) {
  const v = () => props.talent;
  return (
    <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4" data-talent-stats>
      <div class="flex flex-col" data-stat="rate">
        <dt class="flex items-center gap-1 text-ink-muted">
          <Icon name="money" />
          {t.rate(v().dailyRate)}
        </dt>
        <dd class="text-ink-muted">{t.dailyCost(v().dailyCost)}</dd>
      </div>
      <div class="flex flex-col" data-stat="skill">
        <dt class="flex items-center gap-1 text-ink-muted">
          <Icon name="clock" />
          {t.skill}
        </dt>
        <dd class="flex items-center gap-1 font-bold tabular-nums">
          {t.skillValue(v().skill)}
          <LevelTag level={v().skillLevel} />
        </dd>
      </div>
      <div class="flex flex-col" data-stat="accuracy">
        <dt class="flex items-center gap-1 text-ink-muted">
          <Icon name="review" />
          {t.accuracy}
        </dt>
        <dd class="flex items-center gap-1 font-bold tabular-nums">
          {t.accuracyValue(v().accuracy)}
          <LevelTag level={v().accuracyLevel} />
        </dd>
      </div>
      <div class="flex flex-col" data-stat="strengths">
        <dt class="flex items-center gap-1 text-ink-muted">
          <Icon name="skill" />
          {v().strengths.length > 0 ? t.strengths(v().strengths.join('・')) : t.noStrengths}
        </dt>
      </div>
    </dl>
  );
}

function CandidateCard(props: { candidate: CandidateView; dispatch: (command: Command) => void }) {
  const c = () => props.candidate;
  return (
    <li class="flex flex-col gap-2 rounded-lg border-[3px] border-line bg-sunken p-3" data-candidate={c().id}>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <Icon name="human" class="shrink-0 text-2xl" />
          <span class="truncate font-bold">{t.member(c().name, c().role)}</span>
        </div>
        <span class="text-xs font-bold tabular-nums" data-fee>
          {t.fee(c().fee)}
        </span>
      </div>
      <TalentStats talent={c()} />
      <button
        type="button"
        data-hire={c().id}
        disabled={!c().hire}
        class={`${primaryButton} disabled:opacity-60`}
        onClick={() => {
          const command = c().hire;
          if (command) props.dispatch(command);
        }}
      >
        <Icon name="success" tone="mono" />
        {c().hire ? t.hire : t.hireFull}
      </button>
    </li>
  );
}
