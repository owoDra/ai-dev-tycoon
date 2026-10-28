import { type Accessor, createSignal, onCleanup } from 'solid-js';
import { keyAction } from '../ui/keyboard';
import type { DeliveryView } from '../view/fiscal';

/** 節目の画面（納品・決算・倒産）の状態 */
export interface Milestones {
  /** 出している決算の期（null なら出していない） */
  readonly fiscal: Accessor<number | null>;
  readonly bankrupt: Accessor<boolean>;
  /** 出している納品の結果（直轄の案件）。決算・倒産を開いている間は、閉じるまで待たせる。null なら出していない */
  readonly delivery: Accessor<DeliveryView | null>;
  /** 節目の画面のどれかを開いているか（ゲーム内の時間を止め、プレイ画面のキー操作を効かせない） */
  readonly open: Accessor<boolean>;
  /** すべて閉じる（会社を読み込み直したとき） */
  reset(bankrupt: boolean): void;
  /** 期を締めた決算を出す */
  showFiscal(no: number): void;
  showBankrupt(): void;
  /** 納品の結果を出す。続けて納品したら順に出す */
  showDeliveries(views: readonly DeliveryView[]): void;
  /** 出している納品の結果を閉じる */
  closeDelivery(): void;
  /** 決算を閉じる */
  closeFiscal(): void;
}

/**
 * 節目の画面の状態を持つ。開いている間はゲームループが時間を進めない（App の held）ので、閉じれば進めていた日の続きから動く。
 * 納品の結果は Space（次の日へ のキー）でも閉じる。blocked の間（設定を開いているなど）は Space を受けない
 */
export function createMilestones(blocked: Accessor<boolean> = () => false): Milestones {
  const [fiscal, setFiscal] = createSignal<number | null>(null);
  const [bankrupt, setBankrupt] = createSignal(false);
  const [deliveries, setDeliveries] = createSignal<readonly DeliveryView[]>([]);
  const others = () => fiscal() !== null || bankrupt();
  const delivery = () => (others() ? null : (deliveries()[0] ?? null));
  const closeDelivery = () => setDeliveries((list) => list.slice(1));

  if (typeof window !== 'undefined') {
    const onKey = (e: KeyboardEvent) => {
      if (keyAction(e)?.type !== 'nextDay' || blocked() || !delivery()) return;
      e.preventDefault();
      closeDelivery();
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  }

  return {
    fiscal,
    bankrupt,
    delivery,
    open: () => others() || deliveries().length > 0,
    reset(b) {
      setFiscal(null);
      setDeliveries([]);
      setBankrupt(b);
    },
    showFiscal: (no) => setFiscal(no),
    showDeliveries(views) {
      if (views.length === 0) return;
      setDeliveries((list) => [...list, ...views]);
    },
    closeDelivery,
    closeFiscal: () => setFiscal(null),
    showBankrupt() {
      setFiscal(null);
      setBankrupt(true);
    },
  };
}
