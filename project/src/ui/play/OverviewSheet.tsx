import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import type { IconName } from '../../assets/icons';
import { audio } from '../../audio/index';
import type { Rect } from '../../content/look/layout';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { type GanttRowView, type GanttState, ganttView, type StaffStatus, staffRoster } from '../../view/overview';
import { Icon } from '../Icon';
import { Keyed } from '../Keyed';
import { ghostButton, panel, rectStyle } from '../parts';

const t = ja.overview;
const stateIcon: Record<GanttState, IconName> = {
  running: 'clock',
  risk: 'warning',
  burning: 'failure',
  delivered: 'success',
  cancelled: 'failure',
};
const stateBar: Record<GanttState, string> = {
  running: 'bg-primary-300',
  risk: 'bg-warning-300',
  burning: 'bg-danger-300',
  delivered: 'bg-success-300',
  cancelled: 'bg-sunken',
};
const staffIcon: Record<StaffStatus, IconName> = {
  idle: 'success',
  working: 'human',
  multitask: 'warning',
  manager: 'project',
};

/**
 * 進み具合の一覧（Phase 36）。案件のガントチャート（横軸が日。受注から期限までの枠・終わった Task の割合・今日の線と期限の線）と、
 * 社員全員の勤務状態（担当している工程・掛け持ち）をタブで切り替える。状態は色だけでなくアイコンとラベルでも示す。
 * 案件の行を開くと Task ごとの行を出し、進行中の案件はここから「開く」「打ち切る」（確認してから CancelProject）ができる
 */
export function OverviewSheet(props: {
  store: GameStore;
  /** モーダルの位置と大きさ（content/look/layout.ts の sheetRect） */
  frame: Rect;
  onClose: () => void;
  /** 案件のフロアを開く */
  onOpen?: (projectId: string) => void;
}) {
  let el!: HTMLElement;
  const [tab, setTab] = createSignal<'projects' | 'staff'>('projects');
  const gantt = createMemo(() => ganttView(props.store.state()));
  const staff = createMemo(() => staffRoster(props.store.state()));
  onMount(() => {
    audio.play('panelOpen');
    onCleanup(() => audio.play('panelClose'));
    enter(el, 'below');
  });
  return (
    <section
      ref={el}
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
      data-overview-sheet
      class={`${panel} absolute flex flex-col gap-3 overflow-x-hidden overflow-y-auto px-4 pt-3 pb-4`}
      style={{
        ...rectStyle(props.frame),
      }}
    >
      <div class="flex items-center justify-between gap-2">
        <h2 class="flex items-center gap-2 font-heading text-lg">
          <Icon name="project" class="text-2xl" />
          {t.title}
        </h2>
        <button type="button" class={ghostButton} onClick={() => props.onClose()}>
          {t.close}
        </button>
      </div>
      <div role="tablist" aria-label={t.title} class="flex gap-1.5">
        <For each={['projects', 'staff'] as const}>
          {(id) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab() === id}
              data-overview-tab={id}
              class="flex min-h-11 items-center gap-1.5 rounded-md border-[3px] border-line bg-sunken px-3 text-sm font-bold aria-selected:bg-accent-200"
              onClick={() => setTab(id)}
            >
              <Icon name={id === 'projects' ? 'project' : 'human'} class="text-lg" />
              {id === 'projects' ? t.projectsTab(gantt().rows.length) : t.staffTab(staff().length)}
            </button>
          )}
        </For>
      </div>
      <Show when={tab() === 'projects'}>
        <Show when={gantt().rows.length > 0} fallback={<p class="text-sm text-ink-muted">{t.noProjects}</p>}>
          <p class="text-xs text-ink-muted">{t.ganttLead}</p>
          <ul class="flex flex-col gap-2">
            <Keyed each={gantt().rows} by={(r) => r.projectId}>
              {(row) => (
                <GanttRow
                  row={row}
                  from={gantt().from}
                  to={gantt().to}
                  today={gantt().today}
                  onOpen={props.onOpen}
                  onCancel={(projectId) => props.store.dispatch({ type: 'CancelProject', projectId })}
                />
              )}
            </Keyed>
          </ul>
        </Show>
      </Show>
      <Show when={tab() === 'staff'}>
        <ul class="flex flex-col gap-2">
          <Keyed each={staff()} by={(s) => s.id}>
            {(s) => (
              <li class="flex flex-col gap-1 rounded-lg border-[3px] border-line bg-sunken p-2" data-staff={s.status}>
                <div class="flex items-center gap-2">
                  <Icon name={staffIcon[s.status]} class="shrink-0 text-xl" />
                  <span class="font-bold">{s.name}</span>
                  <span class="text-xs font-bold text-ink-muted">{t.staffStatus[s.status]}</span>
                  <Show when={s.status === 'multitask'}>
                    <span class="ml-auto text-xs font-bold tabular-nums">{t.share(s.share)}</span>
                  </Show>
                </div>
                <Show when={s.tasks.length > 0}>
                  <ul class="flex flex-col pl-7 text-xs text-ink-muted">
                    <For each={s.tasks}>
                      {(task) => (
                        <li>
                          {task.project}・{task.task}
                          {task.stage ? `（${ja.stages[task.stage]}）` : ''}
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </li>
            )}
          </Keyed>
        </ul>
      </Show>
    </section>
  );
}

/** 横軸の位置（%）。from〜to の日を 0〜100 に */
const at = (d: number, from: number, to: number) =>
  `${((Math.min(to, Math.max(from, d)) - from) / (to - from)) * 100}%`;

function GanttRow(props: {
  row: GanttRowView;
  from: number;
  to: number;
  today: number;
  onOpen?: (projectId: string) => void;
  onCancel: (projectId: string) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [confirming, setConfirming] = createSignal(false);
  const r = () => props.row;
  const active = () => r().state === 'running' || r().state === 'risk' || r().state === 'burning';
  const span = (a: number, b: number) => ({
    left: at(a, props.from, props.to),
    width: `calc(${at(b, props.from, props.to)} - ${at(a, props.from, props.to)})`,
  });
  return (
    <li class="flex flex-col gap-1 rounded-lg border-[3px] border-line bg-sunken p-2" data-gantt={r().state}>
      <button
        type="button"
        class="flex flex-wrap items-center gap-x-2 text-left text-sm"
        aria-expanded={open()}
        onClick={() => setOpen(!open())}
      >
        <Icon name={stateIcon[r().state]} class="shrink-0 text-lg" />
        <span class="min-w-0 flex-1 truncate font-bold">{r().name}</span>
        <span class="text-xs font-bold">{t.state[r().state]}</span>
        <span class="text-xs text-ink-muted">{ja.board.contract[r().contract]}</span>
        <Show when={active()}>
          <span class="text-xs tabular-nums">{t.daysLeft(r().daysLeft)}</span>
        </Show>
      </button>
      <div class="relative h-5 rounded bg-surface" aria-hidden="true">
        <div
          class={`absolute inset-y-0 rounded ${stateBar[r().state]}`}
          style={span(r().start, r().end ?? r().deadline)}
        />
        <div
          class="absolute inset-y-0 rounded bg-primary-600/40"
          style={span(r().start, r().start + (Math.max(r().deadline, r().end ?? 0) - r().start) * r().progress)}
        />
        <div
          class="absolute inset-y-[-2px] w-0.5 bg-danger-500"
          style={{ left: at(r().deadline, props.from, props.to) }}
        />
        <div class="absolute inset-y-[-2px] w-0.5 bg-line" style={{ left: at(props.today, props.from, props.to) }} />
      </div>
      <Show when={open()}>
        <ul class="flex flex-col gap-0.5 text-xs">
          <For each={r().tasks}>
            {(task) => (
              <li class="flex items-center gap-2" data-gantt-task={task.status}>
                <span class="w-28 shrink-0 truncate">{task.name}</span>
                <span class="relative h-3 flex-1 rounded bg-surface">
                  <Show when={task.start !== null && task.end !== null}>
                    <span
                      class={`absolute inset-y-0 rounded ${task.status === 'done' ? 'bg-success-300' : 'bg-primary-300'}`}
                      style={span(task.start ?? 0, Math.max(task.end ?? 0, (task.start ?? 0) + 0.05))}
                    />
                  </Show>
                </span>
                <span class="w-12 shrink-0 text-right text-ink-muted">{t.taskStatus[task.status]}</span>
              </li>
            )}
          </For>
        </ul>
        <Show when={active()}>
          <div class="flex flex-wrap items-center gap-2">
            <Show when={props.onOpen}>
              {(go) => (
                <button type="button" class={ghostButton} onClick={() => go()(r().projectId)}>
                  {ja.board.openProject}
                </button>
              )}
            </Show>
            <Show
              when={confirming()}
              fallback={
                <button type="button" class={ghostButton} data-cancel-project onClick={() => setConfirming(true)}>
                  {t.cancel}
                </button>
              }
            >
              <span class="flex items-center gap-1 text-xs font-bold">
                <Icon name="warning" class="text-sm" />
                {t.cancelConfirm}
              </span>
              <button
                type="button"
                class={`${ghostButton} bg-danger-200`}
                data-cancel-confirm
                onClick={() => props.onCancel(r().projectId)}
              >
                {t.cancelYes}
              </button>
              <button type="button" class={ghostButton} onClick={() => setConfirming(false)}>
                {t.cancelNo}
              </button>
            </Show>
          </div>
        </Show>
      </Show>
    </li>
  );
}
