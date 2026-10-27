/**
 * ゲーム画面の構成（D3 で決めた「ゲームのドック」。docs/decisions/D3-ui-layout.md）。
 * 3D ワールドを画面全体に敷き、その上に次の領域を重ねる。
 * - 下部のドック：HUD（案件名と常時表示の項目）をまとめる。PC では中央に浮かせ、スマホでは画面幅いっぱいの2段にする
 * - 下から出るシート：選んだものの詳細と担当変更（大きなカード）。ドックのすぐ上に出し、ドックは隠さない
 * - 上部のトースト：「次に対応すべき問題」を積み重ねる。PC では右上、スマホでは上端に1件
 * 幅が breakpoints.compact 未満のときは compact（スマホ）、それ以上は wide（PC・タブレット）の構成を使う。
 * Phase 06 の UI はこの値に従って作る。
 */

/** HUD に常時表示する項目（企画書31章「常に見える」） */
export type HudItemId =
  /** Profit / Person-Day */
  | 'profitPerPersonDay'
  /** 残り時間（営業日と時刻） */
  | 'remaining'
  /** 人間と AI の稼働バー */
  | 'utilization'
  /** 一時停止と速度切り替え */
  | 'speed'
  /** 未対応の問題の数（押すと閉じたトーストを出し直す） */
  | 'problems';

/** HUD に常時表示してよい項目の上限（企画書31章） */
export const MAX_HUD_ITEMS = 5;

/** 下部のドック */
export interface DockLayout {
  /** 先頭に案件名を出すか。見出しなので常時表示の項目数には数えない */
  projectName: boolean;
  /** 表示する項目と順番 */
  items: readonly HudItemId[];
  /** 画面の下端からの距離（px）。0 なら下端に付けて角丸を上側だけにする */
  bottom: number;
}

/** 下から出るシート（選んだものの詳細） */
export interface SheetLayout {
  /** これより広い画面では中央に寄せる（px） */
  maxWidth: number;
  /** 高さ（画面の高さに対する割合） */
  heightRatio: number;
  /** 取っ手を下へこれ以上ドラッグしたら閉じる（px） */
  swipeClose: number;
}

/** 担当変更のカードの並べ方。grid: 1行に全部並べる / scroll: 横にスクロールする */
export type AssignCardsLayout = 'grid' | 'scroll';

/** 「次に対応すべき問題」のトースト */
export interface ToastLayout {
  /** 同時に出す数（重要な順） */
  max: number;
  /** 幅（px）。null なら画面幅いっぱい（左右に余白） */
  width: number | null;
}

/** 短いお知らせ（Task 完了など）。操作を妨げないよう、押せない表示として出して自動で消す（企画書44章） */
export interface NoticeLayout {
  /** 同時に出す数（新しい順） */
  max: number;
  /** 表示している時間（ms） */
  durationMs: number;
}

/** 1つの幅での画面構成 */
export interface LayoutForm {
  dock: DockLayout;
  sheet: SheetLayout;
  assignCards: AssignCardsLayout;
  toast: ToastLayout;
  notice: NoticeLayout;
}

/** 詳細を閉じる操作 */
export type DismissGesture = 'esc' | 'emptyClick' | 'closeButton' | 'swipeDown';

/** 操作の流れ：島を選ぶ → シートが出る → カードで担当を変える → トーストの「次の行動」で島へ移動する */
export interface LayoutFlow {
  /** 担当を変えた後にシートを開いたままにするか（false なら閉じてワールドに戻る） */
  keepDetailAfterAssign: boolean;
  /** 問題の「次の行動」を押したとき、該当する島を選び、シートとドックに隠れない範囲の中心へカメラを寄せる。そのときのズームの下限 */
  focusZoom: number;
  /** トーストを「あとで」で閉じられるか（閉じたものはドックの問題ボタンで出し直す） */
  toastDismissible: boolean;
  /** シートを閉じる操作 */
  dismiss: readonly DismissGesture[];
  /** 用語のカード（体験の後に名前を明かす）を出しておく時間（ms）。閉じるボタンでも閉じられる */
  termCardMs: number;
  /** チュートリアルのスポットライトの、照らす対象からの余白（px） */
  coachPadding: number;
}

export interface UiLayout {
  breakpoints: {
    /** この幅（CSS ピクセル）未満を compact（スマホ）の構成にする */
    compact: number;
  };
  wide: LayoutForm;
  compact: LayoutForm;
  flow: LayoutFlow;
}

const dockItems: readonly HudItemId[] = ['profitPerPersonDay', 'remaining', 'utilization', 'speed', 'problems'];

export const uiLayout: UiLayout = {
  breakpoints: { compact: 768 },
  wide: {
    dock: { projectName: true, items: dockItems, bottom: 12 },
    sheet: { maxWidth: 760, heightRatio: 0.42, swipeClose: 60 },
    assignCards: 'grid',
    toast: { max: 3, width: 384 },
    notice: { max: 3, durationMs: 2600 },
  },
  compact: {
    dock: { projectName: true, items: dockItems, bottom: 0 },
    sheet: { maxWidth: 760, heightRatio: 0.6, swipeClose: 60 },
    assignCards: 'scroll',
    toast: { max: 1, width: null },
    notice: { max: 2, durationMs: 2200 },
  },
  flow: {
    keepDetailAfterAssign: false,
    focusZoom: 1.4,
    toastDismissible: true,
    dismiss: ['esc', 'closeButton', 'emptyClick', 'swipeDown'],
    termCardMs: 9000,
    coachPadding: 10,
  },
};

/** 幅に応じた構成を選ぶ */
export function layoutFormFor(layout: UiLayout, width: number): { compact: boolean; form: LayoutForm } {
  const compact = width < layout.breakpoints.compact;
  return { compact, form: compact ? layout.compact : layout.wide };
}
