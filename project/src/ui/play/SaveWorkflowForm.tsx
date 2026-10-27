import { createSignal, For, Show } from 'solid-js';
import { balance } from '../../content/balance';
import type { AssignModeId } from '../../content/types';
import { ja } from '../../i18n/ja';
import { Icon } from '../Icon';
import { ghostButton, primaryButton } from '../parts';

const t = ja.library;

/**
 * Harness Builder のカードの下に出す「Workflow として保存」（企画書25章）。
 * 押すと名前と、適用したときの担当モードを選ぶ欄を開く。保存すると Workflow Library の棚に1冊増える
 */
export function SaveWorkflowForm(props: {
  modes: readonly { id: AssignModeId; name: string }[];
  defaultMode: AssignModeId;
  defaultName: string;
  onSave: (name: string, mode: AssignModeId) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [name, setName] = createSignal('');
  const [mode, setMode] = createSignal<AssignModeId>(props.defaultMode);
  const begin = () => {
    setName(props.defaultName);
    setMode(props.defaultMode);
    setOpen(true);
  };
  return (
    <Show
      when={open()}
      fallback={
        <button type="button" class={`${ghostButton} self-start`} data-save-workflow onClick={begin}>
          <Icon name="workflow" />
          {t.save}
        </button>
      }
    >
      <form
        class="flex flex-col gap-2 rounded-lg border-[3px] border-line bg-sunken p-3"
        aria-label={t.saveTitle}
        data-save-workflow-form
        onSubmit={(e) => {
          e.preventDefault();
          props.onSave(name().trim() || props.defaultName, mode());
          setOpen(false);
        }}
      >
        <p class="font-heading text-sm">{t.saveTitle}</p>
        <label class="flex flex-col gap-1 text-xs font-bold">
          {t.name}
          <input
            class="rounded-md border-2 border-line bg-surface px-2 py-1 text-sm font-normal"
            value={name()}
            maxLength={balance.library.maxNameLength}
            onInput={(e) => setName(e.currentTarget.value)}
            data-workflow-name
          />
        </label>
        <label class="flex flex-col gap-1 text-xs font-bold">
          {t.saveMode}
          <select
            class="rounded-md border-2 border-line bg-surface px-2 py-1 text-sm font-normal"
            value={mode()}
            onChange={(e) => setMode(e.currentTarget.value as AssignModeId)}
            data-workflow-mode
          >
            <For each={props.modes}>{(m) => <option value={m.id}>{m.name}</option>}</For>
          </select>
        </label>
        <div class="flex gap-2">
          <button type="submit" class={primaryButton} data-confirm-save>
            {t.confirmSave}
          </button>
          <button type="button" class={ghostButton} onClick={() => setOpen(false)}>
            {t.cancel}
          </button>
        </div>
      </form>
    </Show>
  );
}
