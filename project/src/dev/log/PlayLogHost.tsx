import { createEffect, createSignal, on, onCleanup, Show } from 'solid-js';
import type { GameStore } from '../../app/store';
import { tutorialScript } from '../../content/tutorial';
import { currentTutorialStep } from '../../core/tutorial';
import { ja } from '../../i18n/ja';
import type { Selection } from '../../ui/selection';
import { islandId } from '../../view/world';
import { createPlayLog, type PlayLog } from './playLog';

const t = ja.playLog;
const nowSeconds = () => performance.now() / 1000;

/**
 * プレイログ（`?dev=log`、D5 の通しプレイ用ビルドでは常に有効）。チュートリアルを始めるたびに記録し直し、
 * 画面の左上に経過時間と「JSON をコピー」を出す。ゲームの state は読むだけで、記録はメモリ上だけに持つ。
 * 誤って押した操作として、選べない担当カード（aria-disabled）を押したことと、照らしていない島を選んだことを数える。
 */
export function PlayLogHost(props: { store: GameStore; selection: Selection }) {
  const [log, setLog] = createSignal<{ log: PlayLog; start: number } | null>(null);
  const [now, setNow] = createSignal(0);
  const [open, setOpen] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  /** 表示中の JSON。開いたときとコピーしたときに取り直す（選択中に書き換わらないように） */
  const [snapshot, setSnapshot] = createSignal('');
  const at = () => nowSeconds() - (log()?.start ?? nowSeconds());
  let textarea: HTMLTextAreaElement | undefined;

  createEffect(
    on(
      () => props.store,
      (store) => {
        // チュートリアルで始めたゲームだけ記録する（それ以外のゲームでは前の記録を残しておく）
        if (!store.state().tutorial) return;
        const first = tutorialScript.steps[0]?.id ?? '';
        setLog({ log: createPlayLog(first), start: nowSeconds() });
        setOpen(false);
        onCleanup(store.onEvents((events) => log()?.log.events(at(), events)));
      },
    ),
  );

  // 照らしていない島を選んだら誤操作として数える
  createEffect(
    on(props.selection.selected, (id) => {
      const h = currentTutorialStep(props.store.state())?.highlight;
      if (id && h && id.startsWith('island:') && id !== islandId(h.taskId)) log()?.log.misclick(at(), id);
    }),
  );

  const onInput = (e: Event) => {
    const l = log()?.log;
    if (!l || (e.target instanceof Element && e.target.closest('[data-play-log]'))) return;
    l.input(at());
    const disabled = e.type === 'click' && e.target instanceof Element && e.target.closest('[aria-disabled="true"]');
    if (disabled) l.misclick(at(), disabled.getAttribute('data-mode') ?? disabled.textContent?.trim() ?? '');
  };
  const kinds = ['pointerdown', 'keydown', 'wheel', 'click'] as const;
  for (const k of kinds) document.addEventListener(k, onInput, { capture: true, passive: true });
  const timer = setInterval(() => setNow(at()), 500);
  onCleanup(() => {
    for (const k of kinds) document.removeEventListener(k, onInput, { capture: true });
    clearInterval(timer);
  });

  const json = () => {
    const l = log();
    return l ? JSON.stringify(l.log.toJson(at()), null, 2) : '';
  };
  const ended = () => {
    now();
    return log()?.log.currentStep() === null;
  };

  const copy = async () => {
    setSnapshot(json());
    try {
      await navigator.clipboard.writeText(snapshot());
    } catch {
      textarea?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Show when={log()}>
      <aside
        data-play-log
        aria-label={t.title}
        class="fixed top-8 left-1 z-50 flex w-[min(20rem,calc(100vw-0.5rem))] flex-col gap-1.5 rounded-lg bg-slate-900/85 p-2 font-sans text-[11px] text-slate-100"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="font-bold">
            {ended() ? t.ended : t.recording} · {t.elapsed(Math.floor(now()))}
          </span>
          <button
            type="button"
            class="rounded px-2 py-0.5 ring-1 ring-slate-500 hover:bg-slate-700"
            onClick={() => {
              setSnapshot(json());
              setOpen(!open());
            }}
          >
            {open() ? t.close : t.open}
          </button>
        </div>
        <Show when={ended() && !open()}>
          <p>{t.endedHint}</p>
        </Show>
        <Show when={open()}>
          <textarea
            ref={textarea}
            readOnly
            aria-label={t.title}
            class="h-48 w-full resize-none rounded bg-slate-950 p-1.5 font-mono text-[10px]"
            value={snapshot()}
          />
          <button type="button" class="rounded bg-sky-600 px-2 py-1 font-bold hover:bg-sky-500" onClick={copy}>
            {copied() ? t.copied : t.copy}
          </button>
        </Show>
      </aside>
    </Show>
  );
}
