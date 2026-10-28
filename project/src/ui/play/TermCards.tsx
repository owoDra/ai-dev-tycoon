import { type Accessor, createEffect, createSignal, For, onCleanup, onMount } from 'solid-js';
import type { GameStore } from '../../app/store';
import type { TermId } from '../../content/types';
import { enter } from '../../fx/motion';
import { ja } from '../../i18n/ja';
import { createHoldTimers } from '../holdTimers';
import { Icon } from '../Icon';
import { panel, smallButton } from '../parts';

/**
 * 用語のカード（企画書34章「体験 → 用語」）。core が TermRevealed を出したら
 * 「この仕組みの名前」として名前と平易な説明を短く出し、durationMs 後（または閉じるボタン）で消す。
 * 結果画面へ切り替わっても読み終えられるよう、出しているカードは App が createTermCards で持ち、
 * プレイ画面ではお知らせの列に、ほかの画面では同じ場所に TermCardList で並べる。held（時間を止める画面を見ている）の間は消えるまでの時間を数えない。
 */
export function createTermCards(store: Accessor<GameStore>, durationMs: number, held?: Accessor<boolean>) {
  const [cards, setCards] = createSignal<readonly TermId[]>([]);
  const later = createHoldTimers(held);
  const close = (id: TermId) => setCards((l) => l.filter((x) => x !== id));
  createEffect(() =>
    onCleanup(
      store().onEvents((events) => {
        for (const e of events) {
          if (e.type !== 'TermRevealed') continue;
          setCards((l) => [...l.filter((x) => x !== e.term), e.term]);
          later(() => close(e.term), durationMs);
        }
      }),
    ),
  );
  return { cards, close };
}

/** 用語のカードを縦に並べる（置き場所は呼び出し側の列） */
export function TermCardList(props: { cards: readonly TermId[]; onClose: (id: TermId) => void }) {
  return (
    <div class="pointer-events-none flex w-full shrink-0 flex-col items-end gap-2">
      <For each={props.cards}>{(id) => <TermCard id={id} onClose={() => props.onClose(id)} />}</For>
    </div>
  );
}

/** 用語のカードを、ストアのイベントから出して並べる（App を通さずに使うとき） */
export function TermCards(props: { store: GameStore; durationMs: number }) {
  const terms = createTermCards(() => props.store, props.durationMs);
  return <TermCardList cards={terms.cards()} onClose={terms.close} />;
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
      data-fit-item
      class={`${panel} pointer-events-auto flex w-full max-w-80 flex-col gap-1 px-4 py-3`}
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
