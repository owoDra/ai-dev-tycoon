import { type Accessor, createSignal, onCleanup } from 'solid-js';
import type { IconName, IconTone } from '../assets/icons';
import type { NoticeLayout } from '../content/look/layout';

/** 短いお知らせ1件 */
export interface Notice {
  readonly id: number;
  readonly text: string;
  readonly icon: IconName;
  readonly tone?: IconTone;
}

export interface Notices {
  readonly list: Accessor<readonly Notice[]>;
  push(notice: Omit<Notice, 'id'>): void;
}

/**
 * トースト / ポップアップの基盤。新しいものを先頭に積み、max を超えた古いものと、durationMs を過ぎたものを消す。
 * 表示は押せない（pointer-events: none）ので操作を妨げない。layout は幅で変わるので関数で受け取る
 */
export function createNotices(layout: () => NoticeLayout): Notices {
  const [list, setList] = createSignal<readonly Notice[]>([]);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let next = 1;
  onCleanup(() => {
    for (const timer of timers) clearTimeout(timer);
  });
  return {
    list,
    push(notice) {
      const id = next++;
      const { max, durationMs } = layout();
      setList((l) => [{ ...notice, id }, ...l].slice(0, max));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setList((l) => l.filter((n) => n.id !== id));
      }, durationMs);
      timers.add(timer);
    },
  };
}
