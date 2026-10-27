import { createMemo, createSignal, For, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import type { PromotionProgress } from '../../core/company';
import { ja } from '../../i18n/ja';
import { achievementsView, companyStatusView } from '../../view/fiscal';
import { Icon } from '../Icon';
import { ghostButton, Meter, panel, primaryButton, smallButton } from '../parts';

const t = ja.fiscal;
const yen = ja.funds.oku;

/**
 * 会社の帯。案件ボードとプレイ画面の左上にいつも出す（置き場所は呼び出し側の列。下に納品のカードを積む）。
 * 普段は1行のピル（規模・次の目標の達成率・資金・決算までの日数）で、押すと次の目標の内訳と実績が開く。
 * 資金がマイナスのときは警告を出して開いたままにする。引き抜きの打診が来ていれば、引き留めるか見送るかをピルの下で選ぶ
 */
export function CompanyStrip(props: { store: GameStore }) {
  const view = createMemo(() => companyStatusView(props.store.state()));
  const [open, setOpen] = createSignal(false);
  const [achievements, setAchievements] = createSignal(false);
  return (
    <Show when={view()}>
      {(v) => (
        <>
          <section
            class={`${panel} pointer-events-auto flex flex-col gap-1 px-3 py-1.5 text-xs`}
            data-company-strip
            aria-label={t.goal}
          >
            <button
              type="button"
              class="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-0.5 text-left"
              aria-expanded={open() || v().shortDaysLeft !== null}
              data-strip-toggle
              onClick={() => setOpen((o) => !o)}
            >
              <span class="flex items-center gap-1 font-heading text-sm" data-strip-tier>
                <Icon name="trophy" /> {v().tier}
              </span>
              <span class="flex items-center gap-1 tabular-nums" data-goal-percent>
                <Icon name="success" /> {t.goal} {ja.score.percent(goalRatio(v().goal))}
              </span>
              <span
                class="flex items-center gap-1 font-bold tabular-nums"
                classList={{ 'text-danger-ink': v().cash < 0 }}
                data-cash
              >
                <Icon name={v().cash < 0 ? 'warning' : 'money'} /> {ja.funds.cash} {yen(v().cash)}
              </span>
              <Show when={v().fiscalDaysLeft !== null}>
                <span class="flex items-center gap-1 tabular-nums text-ink-muted" data-fiscal-days>
                  <Icon name="clock" /> {t.period2(v().fiscalNo)} · {t.daysLeft(v().fiscalDaysLeft ?? 0)}
                </span>
              </Show>
            </button>
            <Show when={v().shortDaysLeft !== null}>
              <p class="flex items-center gap-1 font-bold text-danger-ink" role="alert" data-cash-short>
                <Icon name="warning" /> {ja.funds.short(v().shortDaysLeft ?? 0)}
              </p>
            </Show>
            <Show when={v().priceWar}>
              <p class="flex items-center gap-1 font-bold text-warning-ink" data-price-war>
                <Icon name="failure" /> {ja.companyEvents.priceWar}
              </p>
            </Show>
            <Show when={open() || v().shortDaysLeft !== null}>
              <div class="flex flex-col gap-0.5 border-t-2 border-line pt-1" data-goal>
                <span class="font-bold">{ja.company.next(v().goal.tier.name)}</span>
                <For each={['profit', 'reputation', 'delivered'] as const}>
                  {(id) => {
                    const item = () => v().goal[id];
                    const done = () => item().now >= item().need;
                    return (
                      <span class="flex items-center gap-1" data-goal-item={id}>
                        <Icon name={done() ? 'success' : 'clock'} label={done() ? ja.teams.met : ja.teams.unmet} />
                        <span class="w-14 shrink-0">{ja.company.requires[id]}</span>
                        <Meter
                          ratio={ratioOf(item())}
                          label={ja.company.requires[id]}
                          color={done() ? 'bg-success-400' : 'bg-accent-400'}
                          class="w-full min-w-10 flex-1"
                        />
                      </span>
                    );
                  }}
                </For>
                <button
                  type="button"
                  class={`${smallButton} self-start`}
                  data-open-achievements
                  onClick={() => setAchievements((o) => !o)}
                >
                  <Icon name="trophy" /> {ja.achievements.title}{' '}
                  {ja.achievements.count(v().achievements.done, v().achievements.total)}
                </button>
              </div>
            </Show>
          </section>
          <For each={v().offers}>
            {(o) => (
              <section
                class={`${panel} pointer-events-auto flex flex-col gap-2 p-3 text-sm`}
                role="alertdialog"
                data-poach={o.staffId}
              >
                <p class="flex items-center gap-1 font-heading">
                  <Icon name="human" /> {ja.companyEvents.poachTitle}
                </p>
                <p class="text-xs">{ja.companyEvents.poachLead(o.name, o.daysLeft)}</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class={primaryButton}
                    data-retain
                    onClick={() => props.store.dispatch({ type: 'AnswerPoach', staffId: o.staffId, retain: true })}
                  >
                    {ja.companyEvents.retain(ja.score.yen(o.bonus))}
                  </button>
                  <button
                    type="button"
                    class={ghostButton}
                    data-let-go
                    onClick={() => props.store.dispatch({ type: 'AnswerPoach', staffId: o.staffId, retain: false })}
                  >
                    {ja.companyEvents.letGo}
                  </button>
                </div>
              </section>
            )}
          </For>
          <Show when={achievements() && (open() || v().shortDaysLeft !== null)}>
            <AchievementList store={props.store} />
          </Show>
        </>
      )}
    </Show>
  );
}

const ratioOf = (item: { readonly now: number; readonly need: number }) =>
  Math.max(0, Math.min(1, item.now / Math.max(1, item.need)));

/** 次の目標の達成率（3つの条件の達成率の平均） */
const goalRatio = (goal: PromotionProgress) =>
  (ratioOf(goal.profit) + ratioOf(goal.reputation) + ratioOf(goal.delivered)) / 3;

/** 実績の一覧。達成したものはアイコンを色で、未達成は「未達成」のラベルで示す */
function AchievementList(props: { store: GameStore }) {
  const rows = createMemo(() => achievementsView(props.store.state()));
  return (
    <section class={`${panel} pointer-events-auto max-h-72 overflow-y-auto p-3`} data-achievements>
      <h2 class="mb-1 font-heading text-sm">{ja.achievements.title}</h2>
      <ul class="flex flex-col gap-1.5 text-xs">
        <For each={rows()}>
          {(r) => (
            <li class="flex items-start gap-2" data-achievement={r.id} data-done={r.at !== null}>
              <Icon name={r.at !== null ? r.icon : 'clock'} tone={r.at !== null ? undefined : 'mono'} class="mt-0.5" />
              <span class="flex flex-col">
                <span class="font-bold" classList={{ 'text-ink-muted': r.at === null }}>
                  {r.name}
                  <Show when={r.at === null}>
                    <span class="ml-1 font-normal">（{ja.achievements.locked}）</span>
                  </Show>
                </span>
                <span class="text-ink-muted">{r.desc}</span>
              </span>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
