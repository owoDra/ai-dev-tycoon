import { createSignal, Show } from 'solid-js';
import { Icon } from './Icon';
import { smallButton } from './parts';

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * 文字列をクリップボードにコピーするボタン。インターネットには接続しない。
 * クリップボードが使えなければ onFail（コピー元の文字を選択するなど）を呼び、失敗の文言を出す
 */
export function CopyButton(props: {
  text: () => string;
  label: string;
  copied: string;
  failed: string;
  onFail?: () => void;
  data?: string;
}) {
  const [state, setState] = createSignal<CopyState>('idle');
  const onCopy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(props.text());
      setState('copied');
    } catch {
      props.onFail?.();
      setState('failed');
    }
  };
  return (
    <span class="inline-flex flex-col items-start" data-copy-button={props.data ?? ''}>
      <button type="button" class={smallButton} onClick={() => void onCopy()}>
        <Icon name={state() === 'copied' ? 'success' : 'release'} />
        {state() === 'copied' ? props.copied : props.label}
      </button>
      <span class="text-[11px] text-ink-muted" aria-live="polite" data-copy-state={state()}>
        <Show when={state() === 'failed'}>{props.failed}</Show>
      </span>
    </span>
  );
}

/** 要素の中の文字を選択する（コピーできないときに、手でコピーできるようにする） */
export function selectText(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
