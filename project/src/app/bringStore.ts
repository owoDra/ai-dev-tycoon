import { type BringCard, broughtPart } from '../core/bring';

/*
 * 持ち込みカードの保存（localStorage）。会社のセーブとは別に、このブラウザに残す。
 * カードの元の中身（origin）も残し、プラグインの書き出し（Phase 43）でそのまま戻す。秘密に見える文字列のあるファイルは
 * core/bring.ts の readBring がカードにしないので、ここには届かない。読めない・保存できない環境でも、開いている間は使える。
 */

const BRING_KEY = 'ai-dev-tycoon.bring.v1';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function safeStorage(): Store | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const isCard = (v: unknown): v is BringCard =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as BringCard).id === 'string' &&
  broughtPart((v as BringCard).id) !== undefined &&
  typeof (v as BringCard).origin === 'object';

/** 保存したカード。ない・壊れている・読めなければ空。部品に戻せないカードは除く */
export function loadBringCards(storage: Pick<Store, 'getItem'> | undefined = safeStorage()): BringCard[] {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(BRING_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(isCard) : [];
  } catch {
    return [];
  }
}

export function saveBringCards(
  cards: readonly BringCard[],
  storage: Pick<Store, 'setItem'> | undefined = safeStorage(),
) {
  try {
    storage?.setItem(BRING_KEY, JSON.stringify(cards));
  } catch {
    // 保存できなくても、この画面を開いている間は使える
  }
}

/** 今のカードに新しいカードを足す。同じ id（同じ元・同じ中身）のカードは新しい方で置き換える */
export function mergeBringCards(current: readonly BringCard[], added: readonly BringCard[]): BringCard[] {
  const ids = new Set(added.map((c) => c.id));
  return [...current.filter((c) => !ids.has(c.id)), ...added];
}
