import { type Accessor, createEffect, on, onCleanup } from 'solid-js';

/** fn を ms 後に呼ぶ（held の間は数えない） */
export type HoldTimeout = (fn: () => void, ms: number) => void;

interface Entry {
  readonly fn: () => void;
  /** 残り時間（ms） */
  left: number;
  /** 今の区間を数え始めた時刻 */
  since: number;
  handle: ReturnType<typeof setTimeout> | undefined;
}

/**
 * 時間を止める画面（決算・あらすじ・区切りのカード・設定など）を見ている間は進まないタイマー。
 * held になったら残り時間を持ち越して止め、解除したら残りの時間で再開する（お知らせやカードが画面の裏で消えないように）
 */
export function createHoldTimers(held: Accessor<boolean> = () => false): HoldTimeout {
  const entries = new Set<Entry>();
  const run = (e: Entry) => {
    e.since = Date.now();
    e.handle = setTimeout(() => {
      entries.delete(e);
      e.fn();
    }, e.left);
  };
  createEffect(
    on(
      held,
      (h) => {
        for (const e of entries) {
          if (!h) {
            if (e.handle === undefined) run(e);
          } else if (e.handle !== undefined) {
            clearTimeout(e.handle);
            e.handle = undefined;
            e.left = Math.max(0, e.left - (Date.now() - e.since));
          }
        }
      },
      { defer: true },
    ),
  );
  onCleanup(() => {
    for (const e of entries) clearTimeout(e.handle);
  });
  return (fn, ms) => {
    const e: Entry = { fn, left: ms, since: 0, handle: undefined };
    entries.add(e);
    if (!held()) run(e);
  };
}
