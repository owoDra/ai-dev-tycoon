import { For, onCleanup, onMount, Show } from 'solid-js';
import type { IconName } from '../../assets/icons';
import { audio } from '../../audio/index';
import type { SheetLayout } from '../../content/look/layout';
import type { ContextFeed, HandoffItemId } from '../../content/types';
import type { Command } from '../../core/commands';
import type { ContextStatus } from '../../core/context';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import type { ContextView } from '../../view/context';
import { Icon } from '../Icon';
import { Keyed } from '../Keyed';
import { ghostButton, Meter, panel, primaryButton } from '../parts';

const t = ja.context;

/** Context の状態を、色だけでなくアイコンとラベルでも示す（企画書41章） */
export const contextStatusIcon: Record<ContextStatus, IconName> = {
  good: 'success',
  cluttered: 'warning',
  overflow: 'failure',
};

/**
 * Context のシート（企画書9〜12章）。ドックの Context の状態を押すと、詳細のシートと同じ場所に下から出る。
 * 内訳（Relevant と Noise）・AI に渡す資料・Session（New Session と Handoff）を、解放済みの範囲で見せる。
 * 状態は読むだけで、変更は Command（SetContextFeed / SetHandoff / SetArtifactDriven / NewSession）で行う。
 */
export function ContextSheet(props: {
  view: ContextView;
  layout: SheetLayout;
  bottom: number;
  viewHeight: number;
  /** 高さの上限（上の帯とドックの間。content/look/layout.ts の screenRegions） */
  maxHeight?: number;
  dispatch: (command: Command) => void;
  /** 資料を1つ渡す・外したときの渡し方 */
  toggleDoc: (docId: string) => ContextFeed;
  onClose: () => void;
}) {
  let el!: HTMLElement;
  onMount(() => {
    audio.play('panelOpen');
    onCleanup(() => audio.play('panelClose'));
    enter(el, 'below');
  });
  const v = () => props.view;
  const workerId = () => v().workerId;
  const setFeed = (feed: ContextFeed) => props.dispatch({ type: 'SetContextFeed', workerId: workerId(), feed });
  const toggleHandoff = (item: HandoffItemId, handoff: readonly HandoffItemId[]) =>
    props.dispatch({
      type: 'SetHandoff',
      workerId: workerId(),
      items: handoff.includes(item) ? handoff.filter((i) => i !== item) : [...handoff, item],
    });
  const names = (items: readonly HandoffItemId[]) => items.map((i) => ja.handoff[i]).join('・');

  return (
    <section
      ref={el}
      role="dialog"
      aria-modal="false"
      aria-label={t.title}
      data-context-sheet
      class={`${panel} absolute inset-x-0 mx-auto flex w-full flex-col gap-3 overflow-x-hidden overflow-y-auto rounded-b-none px-4 pt-3 pb-4`}
      style={{
        'max-width': `${props.layout.maxWidth}px`,
        bottom: `${props.bottom}px`,
        height: `${Math.min(props.viewHeight * props.layout.heightRatio, props.maxHeight ?? Number.POSITIVE_INFINITY)}px`,
      }}
    >
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-md border-[3px] border-line bg-accent-200 text-2xl">
            <Icon name="context" />
          </span>
          <div class="flex min-w-0 flex-col leading-tight">
            <h2 class="font-heading text-lg">{t.title}</h2>
            <p class="flex items-center gap-1 text-sm font-bold" data-context-status={v().status}>
              <Icon name={contextStatusIcon[v().status]} />
              {t.status[v().status]}
              <span class="font-normal text-ink-muted">· {t.hint[v().status]}</span>
            </p>
          </div>
        </div>
        <button type="button" class={ghostButton} onClick={() => props.onClose()}>
          {t.close}
        </button>
      </div>

      <dl class="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <Reading label={t.relevant} ratio={v().reading.relevant} color="bg-success-400" />
        <Reading label={t.noise} ratio={v().reading.noise} color="bg-danger-400" />
        <Reading label={t.fill} ratio={v().reading.fill} color="bg-primary-400" />
      </dl>

      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm font-bold">{t.feedTitle}</legend>
        <div class="grid gap-2" style={{ 'grid-template-columns': `repeat(${v().feeds.length}, minmax(0, 1fr))` }}>
          <For each={v().feeds}>
            {(mode) => (
              <button
                type="button"
                data-feed={mode}
                aria-pressed={v().feed === mode}
                class="flex min-h-11 flex-col items-center gap-0.5 rounded-lg border-[3px] border-line bg-surface p-2 text-center shadow-pop aria-pressed:bg-accent-300"
                onClick={() =>
                  setFeed(
                    mode === 'pick'
                      ? {
                          mode,
                          docs: v()
                            .docs.filter((d) => d.fed)
                            .map((d) => d.id),
                        }
                      : { mode },
                  )
                }
              >
                <span class="font-heading text-sm leading-tight">{t.feed[mode]}</span>
                <span class="text-[11px] leading-snug text-ink-muted">{t.feedHint[mode]}</span>
              </button>
            )}
          </For>
        </div>
        <Show when={v().feeds.includes('pick')}>
          <ul class="flex flex-col gap-1" data-doc-list>
            <Keyed each={v().docs} by={(d) => d.id}>
              {(doc) => (
                <li>
                  <label class="flex min-h-8 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      class="size-4 accent-current"
                      checked={doc.fed}
                      onChange={() => setFeed(props.toggleDoc(doc.id))}
                    />
                    <span class="min-w-0 flex-1 truncate">{doc.name}</span>
                    <Show when={doc.stale}>
                      <Badge icon="warning" text={t.stale} />
                    </Show>
                    <Show when={doc.conflict}>
                      <Badge icon="failure" text={t.conflict} />
                    </Show>
                  </label>
                </li>
              )}
            </Keyed>
          </ul>
        </Show>
      </fieldset>

      <Show when={v().session}>
        {(s) => (
          <section class="flex flex-col gap-2 border-t-2 border-line/20 pt-3" data-session>
            <h3 class="flex items-center gap-1.5 text-sm font-bold">
              <Icon name="session" />
              {t.sessionTitle}
              <span class="font-normal text-ink-muted">· {t.sessionAge(s().age)}</span>
            </h3>
            <Show when={s().lost.length > 0}>
              <p class="flex items-start gap-1.5 text-xs font-bold text-danger-ink">
                <Icon name="warning" class="mt-px" />
                {t.lost(names(s().lost))}（{t.recovering(s().recover)}）
              </p>
            </Show>
            <fieldset class="flex flex-col gap-1">
              <legend class="mb-1 flex items-center gap-1.5 text-xs font-bold">
                <Icon name="handoff" />
                {t.handoffTitle}
              </legend>
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                <For each={s().items}>
                  {(item) => (
                    <label class="flex min-h-8 items-center gap-1.5 text-sm" data-handoff={item}>
                      <input
                        type="checkbox"
                        class="size-4"
                        checked={s().handoff.includes(item) || s().covered.includes(item)}
                        disabled={s().covered.includes(item)}
                        onChange={() => toggleHandoff(item, s().handoff)}
                      />
                      {ja.handoff[item]}
                    </label>
                  )}
                </For>
              </div>
            </fieldset>
            <Show when={s().artifacts !== null}>
              <label class="flex items-start gap-2 text-sm" data-artifacts>
                <input
                  type="checkbox"
                  class="mt-1 size-4"
                  checked={s().artifacts === true}
                  onChange={() =>
                    props.dispatch({ type: 'SetArtifactDriven', workerId: workerId(), on: !s().artifacts })
                  }
                />
                <span class="flex flex-col">
                  <span class="font-bold">{t.artifacts}</span>
                  <span class="text-xs text-ink-muted">{t.artifactsHint}</span>
                </span>
              </label>
            </Show>
            <div class="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-new-session
                class={`${primaryButton} text-sm`}
                onClick={() => props.dispatch({ type: 'NewSession', workerId: workerId() })}
              >
                <Icon name="session" tone="mono" />
                {t.newSession}
              </button>
              <Show
                when={s().willLose.length > 0}
                fallback={<span class="text-xs text-ink-muted">{s().age > 0 ? t.nothingLost : t.newSessionHint}</span>}
              >
                <span class="flex items-start gap-1 text-xs font-bold text-danger-ink" data-will-lose>
                  <Icon name="warning" class="mt-px" />
                  {t.willLose(names(s().willLose))}
                </span>
              </Show>
            </div>
          </section>
        )}
      </Show>
    </section>
  );
}

function Reading(props: { label: string; ratio: number; color: string }) {
  return (
    <div class="flex items-center gap-1.5">
      <dt class="text-xs font-bold text-ink-muted">{props.label}</dt>
      <dd class="flex items-center gap-1.5 font-bold tabular-nums">
        <Meter
          ratio={Math.min(1, props.ratio)}
          label={`${props.label} ${t.percent(props.ratio)}`}
          color={props.color}
          class="w-16"
        />
        {t.percent(props.ratio)}
      </dd>
    </div>
  );
}

function Badge(props: { icon: IconName; text: string }) {
  return (
    <span class="flex shrink-0 items-center gap-0.5 rounded bg-sunken px-1 text-[10px] font-bold">
      <Icon name={props.icon} />
      {props.text}
    </span>
  );
}
