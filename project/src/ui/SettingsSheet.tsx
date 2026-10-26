import { For, onCleanup, onMount } from 'solid-js';
import { type MotionPreference, motionPreferences, settings, updateSettings } from '../app/settings';
import { enter } from '../fx/motion';
import { ja } from '../i18n/ja';
import { ghostButton, panel } from './parts';

const t = ja.settings;

/**
 * 設定シート。いまは「動きを減らす」（OS に合わせる / 減らす / 減らさない）だけで、Phase 08 で音量を足す。
 * 設定はゲームの state ではないので Command を通さず、app/settings.ts が localStorage に保存する。
 * 開いている間もゲームは止めない。Esc か「閉じる」で閉じ、開いたボタンにフォーカスを戻す。
 */
export function SettingsSheet(props: { onClose: () => void }) {
  let el!: HTMLDivElement;
  const opener = document.activeElement as HTMLElement | null;
  const close = () => {
    props.onClose();
    opener?.focus?.();
  };
  onMount(() => {
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
        class={`${panel} flex w-full max-w-md flex-col gap-4 p-5`}
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
        <button type="button" class={`${ghostButton} self-end`} onClick={close}>
          {t.close}
        </button>
      </div>
    </div>
  );
}
