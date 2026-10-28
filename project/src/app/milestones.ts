import { type Accessor, createEffect, createSignal, onCleanup } from 'solid-js';
import { keyAction } from '../ui/keyboard';
import type { DeliveryView } from '../view/fiscal';
import type { DaySummary, Recap } from '../view/session';
import type { GameStore } from './store';

/** 節目の画面（区切りとあらすじのカード・納品・決算・倒産）の状態と、閉じて再開する流れ */
export interface Milestones {
  readonly dayCard: Accessor<DaySummary | null>;
  readonly recap: Accessor<Recap | null>;
  /** 出している決算の期（null なら出していない） */
  readonly fiscal: Accessor<number | null>;
  readonly bankrupt: Accessor<boolean>;
  /** 出している納品の結果（直轄の案件）。ほかの節目の画面を開いている間は、閉じるまで待たせる。null なら出していない */
  readonly delivery: Accessor<DeliveryView | null>;
  /** 節目の画面のどれかを開いているか（ゲーム内の時間を止め、プレイ画面のキー操作を効かせない） */
  readonly open: Accessor<boolean>;
  /** すべて閉じる（会社を読み込み直したとき） */
  reset(bankrupt: boolean): void;
  /** 営業日の終わりの区切りのカードを出す */
  showDay(summary: DaySummary): void;
  /** 「続きから」のあらすじを出す。閉じていた間に締めた決算（closed）は、あらすじを閉じた後に出す */
  showRecap(recap: Recap, closed: number | null): void;
  /** 期を締めた決算を出す（区切りのカードの代わり） */
  showFiscal(no: number): void;
  showBankrupt(): void;
  /** 納品の結果を出す（一時停止する）。続けて納品したら順に出す */
  showDeliveries(views: readonly DeliveryView[]): void;
  /** 出している納品の結果を閉じる。次の納品の結果も、ほかの節目の画面もなければ再開する */
  closeDelivery(): void;
  /**
   * 区切りやあらすじのカード・決算を閉じて再開する。閉じている間に締めた決算があれば、あらすじの後に出す（一時停止したまま）。
   * HUD やキーで先に再開していても、ここを通して決算を出す
   */
  resume(): void;
}

/**
 * 節目の画面の状態を持ち、HUD などからの再開（PauseToggled）と Space のキーでも resume を通す。
 * blocked の間（設定を開いているなど）は Space を受けない
 */
export function createMilestones(game: Accessor<GameStore>, blocked: Accessor<boolean> = () => false): Milestones {
  const [dayCard, setDayCard] = createSignal<DaySummary | null>(null);
  const [recap, setRecap] = createSignal<Recap | null>(null);
  const [fiscal, setFiscal] = createSignal<number | null>(null);
  let pendingFiscal: number | null = null;
  const [bankrupt, setBankrupt] = createSignal(false);
  const [deliveries, setDeliveries] = createSignal<readonly DeliveryView[]>([]);
  /** 区切りかあらすじのカードが見えているか（決算・倒産の下に隠れていない） */
  const card = () => !bankrupt() && (recap() !== null || (dayCard() !== null && fiscal() === null));
  /** 区切り・あらすじ・決算・倒産のどれかを開いているか（納品の結果はその後に出す） */
  const others = () => fiscal() !== null || bankrupt() || dayCard() !== null || recap() !== null;
  const delivery = () => (others() ? null : (deliveries()[0] ?? null));
  const pause = () => {
    if (!game().state().paused) game().dispatch({ type: 'TogglePause' });
  };

  const resume = () => {
    setDayCard(null);
    setRecap(null);
    const paused = game().state().paused;
    if (pendingFiscal !== null) {
      setFiscal(pendingFiscal);
      pendingFiscal = null;
      if (!paused) game().dispatch({ type: 'TogglePause' });
      return;
    }
    setFiscal(null);
    // まだ見せていない納品の結果があれば、一時停止したまま出す
    if (paused && deliveries().length === 0) game().dispatch({ type: 'TogglePause' });
  };

  const closeDelivery = () => {
    setDeliveries((list) => list.slice(1));
    if (deliveries().length === 0 && !others() && game().state().paused) game().dispatch({ type: 'TogglePause' });
  };

  // HUD などから再開したら、区切りとあらすじのカードを閉じる（保留していた決算があれば出す）
  createEffect(() =>
    onCleanup(
      game().onEvents((events) => {
        if (events.some((e) => e.type === 'PauseToggled' && !e.paused) && (dayCard() !== null || recap() !== null)) {
          resume();
        }
      }),
    ),
  );
  // 区切りとあらすじのカードと納品の結果は Space（一時停止の切り替えのキー）でも閉じて再開する（プレイ画面のキー操作はその間効かない）
  if (typeof window !== 'undefined') {
    const onKey = (e: KeyboardEvent) => {
      if (keyAction(e)?.type !== 'pause' || blocked()) return;
      if (card()) {
        e.preventDefault();
        resume();
      } else if (delivery()) {
        e.preventDefault();
        closeDelivery();
      }
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  }

  return {
    dayCard,
    recap,
    fiscal,
    bankrupt,
    delivery,
    open: () => others() || deliveries().length > 0,
    reset(b) {
      setDayCard(null);
      setRecap(null);
      setFiscal(null);
      setDeliveries([]);
      pendingFiscal = null;
      setBankrupt(b);
    },
    showDay: (summary) => setDayCard(summary),
    showRecap(r, closed) {
      setRecap(r);
      if (closed !== null) pendingFiscal = closed;
    },
    showFiscal(no) {
      setDayCard(null);
      setFiscal(no);
    },
    showDeliveries(views) {
      if (views.length === 0) return;
      setDeliveries((list) => [...list, ...views]);
      pause();
    },
    closeDelivery,
    showBankrupt() {
      setDayCard(null);
      setFiscal(null);
      setBankrupt(true);
    },
    resume,
  };
}
