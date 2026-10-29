import { type Accessor, createSignal } from 'solid-js';
import type { IconName, IconTone } from '../assets/icons';
import type { NoticeLayout } from '../content/look/layout';
import { createHoldTimers } from './holdTimers';

/** 短いお知らせ1件 */
export interface Notice {
  readonly id: number;
  readonly text: string;
  readonly icon: IconName;
  readonly tone?: IconTone;
  /** 押せるボタンを1つ添える（受注した案件を開くなど）。添えたお知らせだけが押せる */
  readonly action?: { readonly label: string; readonly run: () => void };
  /**
   * お知らせの段階（Phase 41）。省くと「お知らせ」で、トーストに出して数秒で消す。
   * record は「記録」で、トーストに出さず記録の一覧（お知らせの列の「記録」）に入れるだけにする（作業の完了・実績など、頻繁で急がないもの）。
   * 要対応のもの（問題・資金・打診）は、お知らせではなく問題のトーストと会社の帯で、対応するまで出し続ける
   */
  readonly level?: 'record';
}

export interface Notices {
  readonly list: Accessor<readonly Notice[]>;
  /** 記録（新しい順、RECORD_MAX 件まで） */
  readonly records: Accessor<readonly Notice[]>;
  /** まだ見ていない記録の数 */
  readonly unread: Accessor<number>;
  /** 記録をすべて見たことにする */
  readAll(): void;
  push(notice: Omit<Notice, 'id'>): void;
}

/** 記録に残す件数 */
const RECORD_MAX = 20;

/**
 * トースト / ポップアップの基盤。新しいものを先頭に積み、max を超えた古いものと、durationMs を過ぎたものを消す。
 * 表示は押せない（pointer-events: none）ので操作を妨げない（action を添えたお知らせのボタンだけ押せる）。layout は幅で変わるので関数で受け取る。
 * held（時間を止める画面を見ている）の間は消えるまでの時間を数えない
 */
export function createNotices(layout: () => NoticeLayout, held?: Accessor<boolean>): Notices {
  const [list, setList] = createSignal<readonly Notice[]>([]);
  const [records, setRecords] = createSignal<readonly Notice[]>([]);
  const [unread, setUnread] = createSignal(0);
  const later = createHoldTimers(held);
  let next = 1;
  return {
    list,
    records,
    unread,
    readAll: () => setUnread(0),
    push(notice) {
      const id = next++;
      if (notice.level === 'record') {
        setRecords((l) => [{ ...notice, id }, ...l].slice(0, RECORD_MAX));
        setUnread((n) => Math.min(RECORD_MAX, n + 1));
        return;
      }
      const { max, durationMs } = layout();
      setList((l) => [{ ...notice, id }, ...l].slice(0, max));
      later(() => setList((l) => l.filter((n) => n.id !== id)), durationMs);
    },
  };
}
