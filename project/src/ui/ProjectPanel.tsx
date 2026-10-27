import { createMemo, For, type JSX, Show } from 'solid-js';
import type { GameStore } from '../app/store';
import { assignModes } from '../content/assignModes';
import { getProject } from '../content/index';
import type { AssignModeId } from '../content/types';
import { scoreProject } from '../core/scoring';
import { ja } from '../i18n/ja';
import { bottleneckLabel, defaultWorkerFor, type TaskStatusView, taskRows, workerOptions } from '../view/project';

/** 仮の案件パネル。Task の一覧・担当の変更・スコアを確認するためのもので、本番の UI は Phase 06 で作る */
export function ProjectPanel(props: { store: GameStore; projectId: string }) {
  const def = getProject(props.projectId);
  const started = createMemo(() => props.store.state().projects[props.projectId] !== undefined);
  const rows = createMemo(() => taskRows(props.store.state(), props.projectId));
  const score = createMemo(() => scoreProject(props.store.state(), props.projectId));
  const bottleneck = createMemo(() => bottleneckLabel(props.store.state()));

  const assign = (taskId: string, mode: AssignModeId, workerId: string) =>
    props.store.dispatch({ type: 'AssignTask', projectId: props.projectId, taskId, mode, workerId });

  return (
    <section class="w-full max-w-4xl rounded-xl bg-slate-800 p-4 text-sm">
      <header class="mb-3 flex items-center justify-between gap-4">
        <h2 class="text-lg font-bold">
          {def.name}
          <span class="ml-2 text-xs font-normal text-slate-400">{ja.project.deadline(def.deadlineDays)}</span>
        </h2>
        <Show
          when={started()}
          fallback={
            <button
              type="button"
              class="rounded-lg bg-amber-400 px-3 py-1 font-bold text-slate-900"
              onClick={() => props.store.dispatch({ type: 'StartProject', projectId: props.projectId })}
            >
              {ja.project.start}
            </button>
          }
        >
          <Show when={score()?.completed}>
            <span class="flex items-center gap-1 font-bold text-emerald-300">
              <StatusIcon status="done" />
              {ja.project.completed}
            </span>
          </Show>
        </Show>
      </header>

      <Show when={started()}>
        <table class="w-full text-left">
          <thead class="text-xs text-slate-400">
            <tr>
              <th class="py-1">{ja.project.tasks}</th>
              <th>{ja.project.state}</th>
              <th>{ja.project.mode}</th>
              <th>{ja.project.worker}</th>
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>
              {(row) => (
                <tr class="border-t border-slate-700">
                  <td class="py-1">{row.name}</td>
                  <td>
                    <span class="flex items-center gap-1">
                      <StatusIcon status={row.status} />
                      {ja.project.status[row.status]}
                      <Show when={row.stage}>
                        {(stage) => <span class="text-slate-400">· {ja.stages[stage()]}</span>}
                      </Show>
                    </span>
                  </td>
                  <td>
                    <select
                      class="rounded bg-slate-700 px-1 py-0.5 disabled:opacity-50"
                      aria-label={`${row.name} ${ja.project.mode}`}
                      disabled={!row.editable}
                      value={row.mode ?? ''}
                      onChange={(e) => {
                        const mode = e.currentTarget.value as AssignModeId;
                        assign(row.id, mode, defaultWorkerFor(mode));
                      }}
                    >
                      <option value="" disabled>
                        {ja.project.status.unassigned}
                      </option>
                      <For each={assignModes}>{(m) => <option value={m.id}>{m.name}</option>}</For>
                    </select>
                  </td>
                  <td>
                    <Show when={row.mode}>
                      {(mode) => (
                        <select
                          class="rounded bg-slate-700 px-1 py-0.5 disabled:opacity-50"
                          aria-label={`${row.name} ${ja.project.worker}`}
                          disabled={!row.editable}
                          value={row.workerId ?? ''}
                          onChange={(e) => assign(row.id, mode(), e.currentTarget.value)}
                        >
                          <For each={workerOptions(mode())}>{(w) => <option value={w.id}>{w.name}</option>}</For>
                        </select>
                      )}
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>

        <Show when={score()}>
          {(s) => (
            <dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
              <Stat label={ja.score.profitPerPersonDay} value={ja.score.yen(s().profitPerPersonDay)} strong />
              <Stat label={ja.score.profit} value={ja.score.yen(s().profit)} />
              <Stat label={ja.score.humanHours} value={ja.score.minutes(s().humanMinutes)} />
              <Stat label={ja.score.quality} value={ja.score.percent(s().quality)} />
              <Stat label={ja.score.humanIntervention} value={ja.score.minutes(s().humanIntervention)} />
              <Stat label={ja.score.autonomousTime} value={ja.score.minutes(s().autonomousTime)} />
              <Stat label={ja.score.reworkRate} value={ja.score.percent(s().reworkRate)} />
              <Stat label={ja.score.aiCostPerWork} value={ja.score.yen(s().aiCostPerWork)} />
              <Stat label={ja.score.bottleneck} value={bottleneck() ?? ja.score.none} />
            </dl>
          )}
        </Show>
      </Show>
    </section>
  );
}

function Stat(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div class="flex flex-col">
      <dt class="text-xs text-slate-400">{props.label}</dt>
      <dd class="font-mono tabular-nums" classList={{ 'text-lg font-bold text-amber-300': props.strong }}>
        {props.value}
      </dd>
    </div>
  );
}

/** 状態を色だけでなく形でも区別するための小さなアイコン */
function StatusIcon(props: { status: TaskStatusView }) {
  const shapes: Record<TaskStatusView, () => JSX.Element> = {
    unassigned: () => <circle cx="8" cy="8" r="5" class="fill-none stroke-slate-400" stroke-width="2" />,
    waiting: () => <circle cx="8" cy="8" r="5" class="fill-slate-400" />,
    queued: () => <path d="M3 4h10M3 8h10M3 12h10" class="stroke-amber-300" stroke-width="2" />,
    running: () => <path d="M4 2.5v11l9-5.5z" class="fill-sky-300" />,
    done: () => <path d="M3 8.5l3 3 7-7" class="fill-none stroke-emerald-300" stroke-width="2" />,
    defect: () => <path d="M8 2l6.5 12h-13zM8 6.5v3.5M8 11.5v1" class="fill-none stroke-rose-300" stroke-width="1.5" />,
  };
  return (
    <svg viewBox="0 0 16 16" class="size-4 shrink-0" aria-hidden="true">
      {shapes[props.status]()}
    </svg>
  );
}
