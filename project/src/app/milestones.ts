import { type Accessor, createEffect, createSignal, onCleanup } from 'solid-js';
import { keyAction } from '../ui/keyboard';
import type { DaySummary, Recap } from '../view/session';
import type { GameStore } from './store';

/** 節目の画面（区切りとあらすじのカード・決算・倒産）の状態と、閉じて再開する流れ */
export interface Milestones {
  readonly dayCard: Accessor<DaySummary | null>;
  readonly recap: Accessor<Recap | null>;
  /** 出している決算の期（null なら出していない） */
  readonly fiscal: Accessor<number | null>;
  readonly bankrupt: Accessor<boolean>;
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
  /** 区切りかあらすじのカードが見えているか（決算・倒産の下に隠れていない） */
  const card = () => !bankrupt() && (recap() !== null || (dayCard() !== null && fiscal() === null));

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
    if (paused) game().dispatch({ type: 'TogglePause' });
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
  // 区切りとあらすじのカードは Space（一時停止の切り替えのキー）でも閉じて再開する（プレイ画面のキー操作はその間効かない）
  if (typeof window !== 'undefined') {
    const onKey = (e: KeyboardEvent) => {
      if (keyAction(e)?.type !== 'pause' || !card() || blocked()) return;
      e.preventDefault();
      resume();
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  }

  return {
    dayCard,
    recap,
    fiscal,
    bankrupt,
    open: () => fiscal() !== null || bankrupt() || dayCard() !== null || recap() !== null,
    reset(b) {
      setDayCard(null);
      setRecap(null);
      setFiscal(null);
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
    showBankrupt() {
      setDayCard(null);
      setFiscal(null);
      setBankrupt(true);
    },
    resume,
  };
}
