import { For, Index, Show } from 'solid-js';
import type { Command } from '../../core/commands';
import { ja } from '../../i18n/ja';
import type { TeamCardView, TeamsView } from '../../view/teams';
import { Icon } from '../Icon';
import { ghostButton, Meter, primaryButton } from '../parts';

const t = ja.teams;
const c = ja.company;

/**
 * チームの一覧と編成（社員と Seat の画面の「チーム」タブ）。上に会社の規模と次の規模への昇格の条件を出し、
 * チームごとのカードで進捗・利益 / 人日・問題を見る。管理者を置ける規模になったら、チームを作り、メンバーと案件を移し、
 * 人間 PM か AI PM に任せる。任せたチームには介入して、一時的に直轄として担当を決められる。
 * 状態は色だけでなく、アイコンとラベルでも示す。
 */
export function TeamsPanel(props: { view: TeamsView; dispatch: (command: Command) => void }) {
  return (
    <div class="flex flex-col gap-3" data-teams-panel>
      <section class="flex flex-col gap-1.5 rounded-md border-[3px] border-line bg-sunken p-3" data-company>
        <div class="flex items-center gap-2">
          <Icon name="trophy" class="text-xl" />
          <span class="text-xs font-bold text-ink-muted">{c.label}</span>
          <strong class="font-heading text-lg" data-company-tier>
            {props.view.company.tier}
          </strong>
        </div>
        <Show when={props.view.company.next} fallback={<p class="text-sm text-ink-muted">{c.top}</p>}>
          {(next) => (
            <div class="flex flex-col gap-1">
              <span class="text-sm font-bold">{c.next(next().name)}</span>
              <For each={next().items}>
                {(item) => (
                  <div class="flex items-center gap-2 text-xs" data-requirement={item.id}>
                    <Icon name={item.done ? 'success' : 'clock'} label={item.done ? t.met : t.unmet} />
                    <span class="w-20 shrink-0 font-bold">{item.label}</span>
                    <Meter
                      ratio={Math.max(0, Math.min(1, item.now / Math.max(1, item.need)))}
                      label={item.label}
                      color={item.done ? 'bg-success-400' : 'bg-accent-400'}
                      class="w-full min-w-12 flex-1"
                    />
                    <span class="shrink-0 tabular-nums">
                      {item.id === 'profit'
                        ? `${t.yen(item.now)} / ${t.yen(item.need)}`
                        : item.id === 'delivered'
                          ? `${c.deliveredCount(item.now)} / ${c.deliveredCount(item.need)}`
                          : `${Math.round(item.now)} / ${item.need}`}
                    </span>
                  </div>
                )}
              </For>
            </div>
          )}
        </Show>
      </section>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class={primaryButton}
          data-create-team
          disabled={props.view.createTeam === null}
          onClick={() => props.view.createTeam && props.dispatch(props.view.createTeam)}
        >
          {t.create}
        </button>
        <Show when={props.view.createBlocked}>
          {(why) => <span class="text-xs font-bold text-ink-muted">{why()}</span>}
        </Show>
        <button
          type="button"
          class={ghostButton}
          data-add-agent
          disabled={props.view.addAgent === null}
          onClick={() => props.view.addAgent && props.dispatch(props.view.addAgent)}
        >
          <Icon name="ai" /> {t.addAgent}（{props.view.agents.count}/{props.view.agents.max}）
        </button>
        <Show when={props.view.agentBlocked}>
          {(why) => <span class="text-xs font-bold text-ink-muted">{why()}</span>}
        </Show>
      </div>
      <ul class="flex flex-col gap-2">
        <Index each={props.view.teams}>{(team) => <TeamCard team={team()} dispatch={props.dispatch} />}</Index>
      </ul>
    </div>
  );
}

function TeamCard(props: { team: TeamCardView; dispatch: (command: Command) => void }) {
  const status = () => {
    const team = props.team;
    if (team.direct || team.manager === null) return { icon: 'human' as const, text: t.direction };
    if (team.intervened) return { icon: 'warning' as const, text: t.intervened };
    return { icon: 'automation' as const, text: t.delegated(team.managerName ?? '') };
  };
  return (
    <li class="flex flex-col gap-2 rounded-md border-[3px] border-line bg-surface p-3" data-team={props.team.id}>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <strong class="font-heading">{props.team.name}</strong>
        <span class="flex items-center gap-1 text-xs font-bold" data-team-status>
          <Icon name={status().icon} />
          {status().text}
        </span>
      </div>
      <dl class="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt class="text-ink-muted">{t.progress}</dt>
          <dd class="font-bold tabular-nums">{ja.score.percent(props.team.progress)}</dd>
        </div>
        <div>
          <dt class="text-ink-muted">{t.perPersonDay}</dt>
          <dd class="font-bold tabular-nums" data-team-ppd>
            {props.team.profitPerPersonDay === null ? '—' : t.yen(props.team.profitPerPersonDay)}
          </dd>
        </div>
        <div>
          <dt class="text-ink-muted">{t.problemsLabel}</dt>
          <dd class="flex items-center gap-1 font-bold" data-team-problems={props.team.problems}>
            <Icon name={props.team.problems > 0 ? 'warning' : 'success'} />
            {props.team.problems > 0 ? t.problems(props.team.problems) : t.noProblems}
          </dd>
        </div>
      </dl>
      <Show when={!props.team.direct}>
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-xs font-bold text-ink-muted">{t.manager}</span>
          <span class="text-sm font-bold" data-team-manager>
            {props.team.managerName ?? t.noManager}
          </span>
          <Show when={props.team.setAiPm}>
            {(cmd) => (
              <button type="button" class={ghostButton} data-set-ai-pm onClick={() => props.dispatch(cmd())}>
                <Icon name="ai" /> {t.setAiPm}
              </button>
            )}
          </Show>
          <Show when={props.team.intervene}>
            {(cmd) => (
              <button type="button" class={ghostButton} data-intervene onClick={() => props.dispatch(cmd())}>
                {props.team.intervened ? t.resume : t.intervene}
              </button>
            )}
          </Show>
          <Show when={props.team.removeManager}>
            {(cmd) => (
              <button type="button" class={ghostButton} data-remove-manager onClick={() => props.dispatch(cmd())}>
                {t.removeManager}
              </button>
            )}
          </Show>
        </div>
        <p class="text-[11px] text-ink-muted">
          {t.humanPm}：{t.pmNote.human} ／ {t.aiPm}：{t.pmNote.ai}
        </p>
      </Show>
      <div class="flex flex-col gap-1">
        <span class="text-xs font-bold text-ink-muted">{t.members}</span>
        <Show when={props.team.members.length > 0} fallback={<span class="text-xs text-ink-muted">{t.noMembers}</span>}>
          <ul class="flex flex-col gap-1">
            <Index each={props.team.members}>
              {(m) => (
                <li class="flex flex-wrap items-center gap-1.5 text-sm" data-team-member={m().id}>
                  <Icon name={m().kind === 'ai' ? 'ai' : 'human'} />
                  <span class="font-bold">{m().name}</span>
                  <Show when={m().pm}>
                    <span class="rounded border-2 border-line bg-accent-200 px-1 text-[11px] font-bold">
                      {t.humanPm}
                    </span>
                  </Show>
                  <Show when={m().blocked}>{(why) => <span class="text-[11px] text-ink-muted">{why()}</span>}</Show>
                  <For each={m().moves}>
                    {(mv) => (
                      <button
                        type="button"
                        class="min-h-9 rounded border-2 border-line bg-sunken px-2 text-xs font-bold"
                        data-move-member={mv.teamId}
                        onClick={() => props.dispatch(mv.command)}
                      >
                        → {mv.label}
                      </button>
                    )}
                  </For>
                  <Show when={m().appoint}>
                    {(cmd) => (
                      <button
                        type="button"
                        class="min-h-9 rounded border-2 border-line bg-primary-200 px-2 text-xs font-bold"
                        data-appoint={m().id}
                        onClick={() => props.dispatch(cmd())}
                      >
                        {t.appoint(m().name)}
                      </button>
                    )}
                  </Show>
                </li>
              )}
            </Index>
          </ul>
        </Show>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs font-bold text-ink-muted">{t.projects}</span>
        <Show
          when={props.team.projects.length > 0}
          fallback={<span class="text-xs text-ink-muted">{t.noProjects}</span>}
        >
          <ul class="flex flex-col gap-1">
            <Index each={props.team.projects}>
              {(p) => (
                <li class="flex flex-wrap items-center gap-1.5 text-sm" data-team-project={p().projectId}>
                  <Icon name="project" />
                  <span class="font-bold">{p().name}</span>
                  <span class="text-xs tabular-nums text-ink-muted">{ja.score.percent(p().progress)}</span>
                  <For each={p().moves}>
                    {(mv) => (
                      <button
                        type="button"
                        class="min-h-9 rounded border-2 border-line bg-sunken px-2 text-xs font-bold"
                        data-move-project={mv.teamId}
                        onClick={() => props.dispatch(mv.command)}
                      >
                        → {mv.label}
                      </button>
                    )}
                  </For>
                </li>
              )}
            </Index>
          </ul>
        </Show>
      </div>
    </li>
  );
}
