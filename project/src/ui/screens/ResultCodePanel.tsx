import { createMemo, createSignal, Show } from 'solid-js';
import { encodeResultCode, type ResultRecord } from '../../core/resultCode';
import { ja } from '../../i18n/ja';
import { encodeQr, qrPath } from '../../lib/qr';
import { Icon } from '../Icon';
import { ghostButton, smallButton } from '../parts';

const t = ja.screens.result.code;
/** QR コードの周りの余白（モジュール数）。読み取りやすいよう、テーマに関わらず白地に黒で描く */
const QUIET = 4;

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * 結果コード（core/resultCode.ts）の表示。コピーボタンと、スマホで読み取れる QR コードを出す。
 * インターネットには接続しない。クリップボードが使えなければ、コードの文字を選択して手でコピーできるようにする
 */
export function ResultCodePanel(props: { record: ResultRecord }) {
  const code = createMemo(() => encodeResultCode(props.record));
  const qr = createMemo(() => encodeQr(code()));
  const [copy, setCopy] = createSignal<CopyState>('idle');
  const [showQr, setShowQr] = createSignal(false);
  let text!: HTMLElement;

  const selectCode = () => {
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const onCopy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(code());
      setCopy('copied');
    } catch {
      selectCode();
      setCopy('failed');
    }
  };

  return (
    <section
      class="flex w-full flex-col items-center gap-2 rounded-md border-2 border-line bg-sunken p-3"
      data-result-code
    >
      <p class="font-heading">{t.title}</p>
      <p class="text-xs text-ink-muted">{t.lead}</p>
      <code
        ref={text}
        class="block w-full select-all break-all rounded-md border-2 border-line bg-surface px-2 py-1 font-mono text-sm tracking-wider"
        data-code
      >
        {code()}
      </code>
      <div class="flex flex-wrap justify-center gap-2">
        <button type="button" class={smallButton} data-copy onClick={() => void onCopy()}>
          <Icon name={copy() === 'copied' ? 'success' : 'release'} />
          {copy() === 'copied' ? t.copied : t.copy}
        </button>
        <button
          type="button"
          class={ghostButton}
          data-show-qr
          aria-expanded={showQr()}
          onClick={() => setShowQr((v) => !v)}
        >
          {showQr() ? t.hideQr : t.showQr}
        </button>
      </div>
      <p class="text-xs text-ink-muted" aria-live="polite" data-copy-state={copy()}>
        <Show when={copy() === 'failed'}>{t.copyFailed}</Show>
      </p>
      <Show when={showQr()}>
        <svg
          viewBox={`0 0 ${qr().size + QUIET * 2} ${qr().size + QUIET * 2}`}
          class="size-48 rounded-md bg-white"
          role="img"
          aria-label={t.qrLabel}
          shape-rendering="crispEdges"
          data-qr
        >
          <rect width="100%" height="100%" fill="white" />
          <path d={qrPath(qr(), QUIET)} fill="black" />
        </svg>
      </Show>
    </section>
  );
}
