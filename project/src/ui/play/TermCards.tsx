import { createSignal, For, onCleanup, onMount } from 'solid-js';
import type { GameStore } from '../../app/store';
import type { TermId } from '../../content/types';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { Icon } from '../Icon';
import { panel, smallButton } from '../parts';

/**
 * 用語のカード（企画書34章「体験 → 用語」）。core が TermRevealed を出したら
 * 「この仕組みの名前」として名前と平易な説明を短く出し、durationMs 後（または閉じるボタン）で消す。
 * 結果画面へ切り替わっても読み終えられるよう、App で画面の外側に置く。
 */
export function TermCards(props: { store: GameStore; durationMs: number }) {
  const [cards, setCards] = createSignal<readonly TermId[]>([]);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const close = (id: TermId) => setCards((l) => l.filter((x) => x !== id));
  onCleanup(() => {
    for (const t of timers) clearTimeout(t);
  });
  onCleanup(
    props.store.onEvents((events) => {
      for (const e of events) {
        if (e.type !== 'TermRevealed') continue;
        setCards((l) => [...l.filter((x) => x !== e.term), e.term]);
        const timer = setTimeout(() => {
          timers.delete(timer);
          close(e.term);
        }, props.durationMs);
        timers.add(timer);
      }
    }),
  );
  return (
    <div class="pointer-events-none absolute top-3 left-3 z-30 flex w-80 max-w-[calc(100%-1.5rem)] flex-col gap-2">
      <For each={cards()}>{(id) => <TermCard id={id} onClose={() => close(id)} />}</For>
    </div>
  );
}

function TermCard(props: { id: TermId; onClose: () => void }) {
  let el!: HTMLElement;
  onMount(() => enter(el, 'above'));
  const g = () => ja.glossary[props.id];
  return (
    <section
      ref={el}
      role="status"
      data-term-card={props.id}
      class={`${panel} pointer-events-auto flex flex-col gap-1 px-4 py-3`}
    >
      <div class="flex items-center justify-between gap-2">
        <span class="flex items-center gap-1 text-[11px] font-bold text-ink-muted">
          <Icon name="skill" />
          {ja.glossary.title}
        </span>
        <button type="button" class={smallButton} onClick={() => props.onClose()}>
          {ja.glossary.close}
        </button>
      </div>
      <p class="font-heading text-lg leading-tight">{g().term}</p>
      <p class="text-sm leading-snug">{g().plain}</p>
    </section>
  );
}
