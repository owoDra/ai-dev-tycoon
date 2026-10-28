import { For, onCleanup, onMount, Show } from 'solid-js';
import { type MotionPreference, motionPreferences, settings, updateSettings } from '../app/settings';
import type { AudioVolumes } from '../audio/engine';
import { audio } from '../audio/index';
import { balance } from '../content/balance';
import { type FeelIntensityId, feelIntensities } from '../content/look/feel';
import { enter } from '../fx/motion';
import { ja } from '../i18n/ja';
import { ghostButton, panel } from './parts';

const t = ja.settings;
const FEEL_INTENSITIES = Object.keys(feelIntensities) as FeelIntensityId[];
const VOLUME_KEYS = ['master', 'sfx', 'music'] as const satisfies readonly (keyof AudioVolumes)[];
const PLAY_FLAGS = ['dayBreak', 'awayProgress'] as const;
/** 1営業日の実時間（分、1倍速） */
const DAY_REAL_MINUTES = balance.time.minutesPerDay / balance.time.minutesPerRealSecond / 60;

function setVolume(key: (typeof VOLUME_KEYS)[number], value: number) {
  updateSettings({ audio: { ...settings().audio, [key]: value } });
}

/**
 * 設定シート。「動きを減らす」（OS に合わせる / 減らす / 減らさない）、「演出の強さ」（控えめ / 標準 / 派手）、
 * 音量（全体・効果音・BGM）とミュート、遊び方（1日の終わりの区切り・閉じている間の進行）。
 * 設定はゲームの state ではないので Command を通さず、app/settings.ts が localStorage に保存する。
 * 開いている間もゲームは止めない。Esc か「閉じる」で閉じ、開いたボタンにフォーカスを戻す。
 * 会社を遊んでいる間は「タイトルへ」を出す（タイトルへ戻る入口はここだけ。会社は自動セーブして「続きから」で再開できる）。
 */
export function SettingsSheet(props: { onClose: () => void; onTitle?: () => void }) {
  let el!: HTMLDivElement;
  const opener = document.activeElement as HTMLElement | null;
  const close = () => {
    props.onClose();
    opener?.focus?.();
  };
  onMount(() => {
    audio.play('panelOpen');
    onCleanup(() => audio.play('panelClose'));
    enter(el, 'below');
    el.querySelector<HTMLInputElement>('input:checked')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    onCleanup(() => window.removeEventListener('keydown', onKey, { capture: true }));
  });
  return (
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-line/30 p-3 sm:items-center">
      <div
        ref={el}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        class={`${panel} flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto p-5`}
      >
        <h2 id="settings-title" class="font-heading text-2xl">
          {t.title}
        </h2>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 font-bold">{t.motion}</legend>
          <For each={motionPreferences}>
            {(pref: MotionPreference) => (
              <label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border-[3px] border-line/30 px-3 has-checked:border-line has-checked:bg-accent-200">
                <input
                  type="radio"
                  name="motion"
                  value={pref}
                  checked={settings().motion === pref}
                  onChange={() => updateSettings({ motion: pref })}
                  class="size-4 accent-primary-500"
                />
                <span class="font-bold">{t.motionOptions[pref]}</span>
              </label>
            )}
          </For>
          <p class="text-xs text-ink-muted">{t.motionHint}</p>
        </fieldset>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 font-bold">{t.feel}</legend>
          <div class="flex gap-2">
            <For each={FEEL_INTENSITIES}>
              {(id) => (
                <label class="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border-[3px] border-line/30 px-2 has-checked:border-line has-checked:bg-accent-200">
                  <input
                    type="radio"
                    name="feelIntensity"
                    value={id}
                    checked={settings().feelIntensity === id}
                    onChange={() => updateSettings({ feelIntensity: id })}
                    class="size-4 accent-primary-500"
                  />
                  <span class="font-bold">{ja.fx.intensities[id]}</span>
                </label>
              )}
            </For>
          </div>
          <p class="text-xs text-ink-muted">{t.feelHint}</p>
        </fieldset>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 font-bold">{t.sound}</legend>
          <For each={VOLUME_KEYS}>
            {(key) => (
              <label class="flex min-h-11 items-center gap-3">
                <span class="w-24 shrink-0 text-sm font-bold">{t.volumes[key]}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(settings().audio[key] * 100)}
                  disabled={settings().audio.muted}
                  onInput={(e) => setVolume(key, e.currentTarget.valueAsNumber / 100)}
                  class="min-w-0 flex-1 accent-primary-500"
                />
                <span class="w-12 text-right font-mono text-sm tabular-nums">{t.percent(settings().audio[key])}</span>
              </label>
            )}
          </For>
          <label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border-[3px] border-line/30 px-3 has-checked:border-line has-checked:bg-accent-200">
            <input
              type="checkbox"
              checked={settings().audio.muted}
              onChange={(e) => updateSettings({ audio: { ...settings().audio, muted: e.currentTarget.checked } })}
              class="size-4 accent-primary-500"
            />
            <span class="font-bold">{t.mute}</span>
          </label>
          <p class="text-xs text-ink-muted">{t.soundHint}</p>
        </fieldset>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 font-bold">{t.play}</legend>
          <For each={PLAY_FLAGS}>
            {(key) => (
              <label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border-[3px] border-line/30 px-3 has-checked:border-line has-checked:bg-accent-200">
                <input
                  type="checkbox"
                  data-setting={key}
                  checked={settings()[key]}
                  onChange={(e) => updateSettings({ [key]: e.currentTarget.checked })}
                  class="size-4 accent-primary-500"
                />
                <span class="font-bold">{t[key]}</span>
              </label>
            )}
          </For>
          <p class="text-xs text-ink-muted">{t.playHint(DAY_REAL_MINUTES)}</p>
        </fieldset>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <Show when={props.onTitle} fallback={<span />}>
            {(toTitle) => (
              <button
                type="button"
                data-settings-title
                class={ghostButton}
                onClick={() => {
                  props.onClose();
                  toTitle()();
                }}
              >
                {t.toTitle}
              </button>
            )}
          </Show>
          <button type="button" class={ghostButton} onClick={close}>
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
