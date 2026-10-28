import { createMemo, createSignal, For, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import type { PromotionProgress } from '../../core/company';
import { ja } from '../../i18n/ja';
import { achievementsView, companyStatusView } from '../../view/fiscal';
import { Icon } from '../Icon';
import { Keyed } from '../Keyed';
import { ghostButton, Meter, panel, primaryButton, smallButton } from '../parts';

const t = ja.fiscal;
const yen = ja.funds.oku;

/**
 * 会社の帯。プレイ画面の上の帯の左にいつも出す。
 * 普段は折り返さない1行のピル（規模・次の目標の達成率・資金・上場していれば時価総額・決算までの日数）で、上の帯の高さに収める。
 * スマホ（dense）では資金だけにし、規模は開いた内訳に出す。幅が足りなければ後ろの項目から省く。押すと次の目標の内訳と実績が、ピルの下に重ねて開く。
 * 資金がマイナスのときは警告を出して開いたままにする。引き抜きの打診が来ていれば、引き留めるか見送るかをピルの下で選ぶ
 */
export function CompanyStrip(props: { store: GameStore; dense?: boolean }) {
  const view = createMemo(() => companyStatusView(props.store.state()));
  const [open, setOpen] = createSignal(false);
  const [achievements, setAchievements] = createSignal(false);
  return (
    <Show when={view()}>
      {(v) => (
        <div class="relative flex min-w-0 flex-col">
          <section
            class={`${panel} pointer-events-auto flex max-w-full min-w-0 flex-col gap-1 self-start py-1.5 text-xs ${props.dense ? 'px-2' : 'px-3'}`}
            data-company-strip
            aria-label={t.goal}
          >
            <button
              type="button"
              class="flex min-h-8 min-w-0 flex-nowrap items-center gap-x-3 overflow-hidden text-left whitespace-nowrap"
              aria-expanded={open() || v().shortDaysLeft !== null}
              data-strip-toggle
              onClick={() => setOpen((o) => !o)}
            >
              <Show when={!props.dense}>
                <span class="flex shrink-0 items-center gap-1 font-heading text-sm" data-strip-tier>
                  <Icon name="trophy" /> {v().tier}
                </span>
              </Show>
              <Show when={!props.dense}>
                <span class="flex min-w-0 shrink items-center gap-1 overflow-hidden tabular-nums" data-goal-percent>
                  <Icon name="success" /> {t.goal} {ja.score.percent(goalRatio(v().goal))}
                </span>
              </Show>
              <span
                class="flex shrink-0 items-center gap-1 font-bold tabular-nums"
                classList={{ 'text-danger-ink': v().cash < 0 }}
                data-cash
              >
                <Icon name={v().cash < 0 ? 'warning' : 'money'} /> {ja.funds.cash} {yen(v().cash)}
              </span>
              <Show when={!props.dense && v().valuation !== null}>
                <span
                  class="flex min-w-0 shrink items-center gap-1 overflow-hidden font-bold tabular-nums"
                  data-valuation
                >
                  <Icon name="trophy" /> {t.valuation(true)} {yen(v().valuation ?? 0)}
                </span>
              </Show>
              <Show when={!props.dense && v().fiscalDaysLeft !== null}>
                <span
                  class="flex min-w-0 shrink items-center gap-1 overflow-hidden tabular-nums text-ink-muted"
                  data-fiscal-days
                >
                  <Icon name="clock" /> {t.period2(v().fiscalNo)} · {t.daysLeft(v().fiscalDaysLeft ?? 0)}
                </span>
              </Show>
            </button>
          </section>
          {/* 内訳・警告・打診は上の帯の高さに入らないので、ピルの下に重ねて出す */}
          <div
            class="absolute top-full left-0 mt-2 flex w-[min(20rem,calc(100vw-1rem))] flex-col gap-2"
            data-strip-drop
          >
            <Show when={v().shortDaysLeft !== null || v().priceWar || open()}>
              <section class={`${panel} pointer-events-auto flex flex-col gap-1 px-3 py-1.5 text-xs`}>
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
                  <div class="flex flex-col gap-0.5 border-t-2 border-line pt-1 first:border-t-0 first:pt-0" data-goal>
                    <Show when={props.dense}>
                      <span class="flex items-center gap-1 font-heading text-sm" data-strip-tier>
                        <Icon name="trophy" /> {v().tier}
                      </span>
                    </Show>
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
            </Show>
            <Keyed each={v().offers} by={(o) => o.staffId}>
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
            </Keyed>
            <Show when={achievements() && (open() || v().shortDaysLeft !== null)}>
              <AchievementList store={props.store} />
            </Show>
          </div>
        </div>
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
        <Keyed each={rows()} by={(r) => r.id}>
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
        </Keyed>
      </ul>
    </section>
  );
}
