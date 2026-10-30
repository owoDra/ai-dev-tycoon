/**
 * ゲーム画面の構成（D3 で決めた「ゲームのドック」。docs/decisions/D3-ui-layout.md）。
 * 3D ワールドを画面全体に敷き、その上を重ならない領域に分ける（screenRegions）。各要素は自分の領域の中で流れに沿って並べる。
 * - 上の帯：左に会社の帯（資金・規模・決算）、右に操作の列（日付と時刻・速度・メニュー）。スマホでは時計と一時停止だけを右上に小さく出す
 * - お知らせの列：「次に対応すべき問題」のトースト・短いお知らせ・納品のカード・用語のカード。PC では右端の列、スマホでは上の帯の下の帯
 * - 3D の世界：残りの範囲。カメラはこの範囲に構図を合わせる
 * - 下部のドック：いま見ている案件の HUD（案件名と常時表示の項目）をまとめる。PC では中央に浮かせ、スマホでは画面幅いっぱいの2段にする
 * - モーダル：選んだものの詳細と担当変更（大きなカード）、案件ボードやメニューから開く画面。画面中央に出し、外側を暗くして時間を止める
 * 幅で3つの形に分ける：スマホ（breakpoints.compact 未満）・狭い PC（breakpoints.wide 未満）・広い PC。
 * 寸法はセーフエリアの内側（ブラウザのバーやノッチを除いた範囲）の CSS ピクセル。
 */

/** HUD に常時表示する項目（企画書31章「常に見える」） */
export type HudItemId =
  /** この案件に使った金額と受注額（見込み利益） */
  | 'spend'
  /** Profit / Person-Day（決算と会社の画面のスコア。ドックには出さない） */
  | 'profitPerPersonDay'
  /** 残り時間（営業日と時刻） */
  | 'remaining'
  /** 人間と AI の稼働バー */
  | 'utilization'
  /** Context の状態と AUTONOMY STREAK のメーター（解放されるまでは空） */
  | 'signals'
  /** 一時停止と速度切り替え（ふだんは上部の操作の列に出す。ui/play/PlayControls.tsx） */
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
  /** 「詳細」のボタンで開く項目（ドックの上に開く。空ならボタンを出さない） */
  details: readonly HudItemId[];
  tabs: DockTabsLayout;
  /** ドックの項目を小さく出すか（使った金額は見込み利益だけにする。内訳は「詳細」で開く） */
  dense: boolean;
  /** 画面の下端からの距離（px）。0 なら下端に付けて角丸を上側だけにする */
  bottom: number;
}

/** ドックの案件のタブの出し方（ui/play/ProjectTabs.tsx）。選んでいるタブはいつも出し、出さないタブは「ほか N 件」にまとめる */
export interface DockTabsLayout {
  /** オフィスのタブを並べるか（並べなければ「ほか N 件」に入れる） */
  office: boolean;
  /** 選んでいない案件のタブを並べる数の上限（幅に入りきらなければ減らす） */
  others: number;
}

/**
 * 画面中央のモーダル（選んだものの詳細・案件ボード・メニューから開く画面）。
 * 下から出るシートでは上の帯とドックに挟まれて低く見づらかったので、画面いっぱいの範囲の中央に大きく出す
 */
export interface SheetLayout {
  /** 幅の上限（px）。これより広い画面では中央に寄せる */
  maxWidth: number;
  /** 高さ（画面の高さに対する割合）。画面の余白の内側（screenRegions の sheet）を超えない */
  heightRatio: number;
  /** 高さの下限（px）。低い画面でも見出しと担当カードまで見えるよう、割合で足りなければここまで伸ばす（画面の余白の内側は超えない） */
  minHeight: number;
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

/**
 * 操作の列（ui/play/PlayControls.tsx）の出し方。
 * labeled: 上の帯にラベル付きのメニューと速度のボタンを並べる / icons: 上の帯にアイコンだけのメニューと1つの速度ボタン /
 * dock: 上の帯の右には時計と一時停止・速度だけを小さく出し、メニューはドックの2段目に入れる
 */
export type ControlsPlacement = 'labeled' | 'icons' | 'dock';

/** お知らせの列の置き方。side: 右端の縦の列（幅）/ stack: 上の帯の下の横長の帯（高さ） */
export type NoticeColumnLayout = { place: 'side'; width: number } | { place: 'stack'; height: number };

/** 領域の寸法（px） */
export interface RegionLayout {
  /** 画面の端と領域の間の余白 */
  gutter: number;
  /** 上の帯の高さ */
  top: number;
  notices: NoticeColumnLayout;
  /** ドックの高さの予算（ドックの中身はこれに収める。下端からの距離は dock.bottom） */
  dock: number;
}

/** 1つの幅での画面構成 */
export interface LayoutForm {
  regions: RegionLayout;
  controls: ControlsPlacement;
  dock: DockLayout;
  sheet: SheetLayout;
  assignCards: AssignCardsLayout;
  toast: ToastLayout;
  notice: NoticeLayout;
}

/** 詳細を閉じる操作 */
export type DismissGesture = 'esc' | 'closeButton' | 'backdropClick';

/** 操作の流れ：島を選ぶ → モーダルが出る → カードで担当を変える → トーストの「次の行動」で島へ移動する */
export interface LayoutFlow {
  /** 担当を変えた後にシートを開いたままにするか（false なら閉じてワールドに戻る） */
  keepDetailAfterAssign: boolean;
  /** 問題の「次の行動」を押したとき、該当する島を選び、3D の世界の領域の中心へカメラを寄せる。そのときのズームの下限 */
  focusZoom: number;
  /** トーストを「あとで」で閉じられるか（閉じたものはドックの問題ボタンで出し直す） */
  toastDismissible: boolean;
  /** モーダルを閉じる操作 */
  dismiss: readonly DismissGesture[];
  /** 用語のカード（体験の後に名前を明かす）を出しておく時間（ms）。閉じるボタンでも閉じられる */
  termCardMs: number;
  /** チュートリアルのスポットライトの、照らす対象からの余白（px） */
  coachPadding: number;
  /** 納品のカードを一度に積む数（古いものから消す）と、出しておく時間（ms）。閉じるボタンでも閉じられる */
  deliveryCards: number;
  deliveryCardMs: number;
  /** Task の詳細に出す、おすすめの Workflow の数（view/library.ts の recommendWorkflows） */
  workflowPicks: number;
  /** 「次の日へ」で1日の作業を見せる実時間（ms） */
  dayMs: number;
  /** 「判断が必要になるまで進める」で1日あたりにかける実時間（ms）。何日も続くので短くする */
  skipDayMs: number;
}

export interface UiLayout {
  breakpoints: {
    /** この幅（CSS ピクセル）未満を compact（スマホ）の構成にする */
    compact: number;
    /** この幅未満を narrow（狭い PC・タブレット）、以上を wide（広い PC）の構成にする */
    wide: number;
  };
  wide: LayoutForm;
  narrow: LayoutForm;
  compact: LayoutForm;
  /** 3D の世界の領域として必ず残す高さ（px）。tests/unit/layout.test.ts で確かめる */
  minWorldHeight: number;
  flow: LayoutFlow;
}

/**
 * ドックはいま見ている案件の状態だけを、見込み利益・納期・問題の3つに絞って出す（Phase 41）。稼働はどの幅でも「詳細」に入れる
 * （Context と Streak の札は、解放されてから広い画面のドックに出す）。
 * 会社の状態（資金）は左上の帯、時計・速度・メニューは右上の操作の列に出す
 */
const dockItems: readonly HudItemId[] = ['spend', 'remaining', 'signals', 'problems'];
/** 幅の狭い画面では Context と Streak の札も「詳細」に入れ、ドックを1段に収める */
const narrowItems: readonly HudItemId[] = ['spend', 'remaining', 'problems'];

export const uiLayout: UiLayout = {
  breakpoints: { compact: 600, wide: 1024 },
  wide: {
    regions: { gutter: 8, top: 60, notices: { place: 'side', width: 384 }, dock: 100 },
    controls: 'labeled',
    dock: {
      projectName: true,
      items: dockItems,
      details: ['utilization'],
      tabs: { office: true, others: 2 },
      dense: false,
      bottom: 12,
    },
    sheet: { maxWidth: 880, heightRatio: 0.8, minHeight: 360 },
    assignCards: 'grid',
    toast: { max: 3, width: 384 },
    notice: { max: 3, durationMs: 2600 },
  },
  narrow: {
    regions: { gutter: 8, top: 60, notices: { place: 'side', width: 300 }, dock: 100 },
    controls: 'icons',
    dock: {
      projectName: true,
      items: narrowItems,
      details: ['spend', 'utilization', 'signals'],
      tabs: { office: true, others: 0 },
      dense: true,
      bottom: 8,
    },
    sheet: { maxWidth: 760, heightRatio: 0.82, minHeight: 360 },
    assignCards: 'grid',
    toast: { max: 2, width: 300 },
    notice: { max: 2, durationMs: 2600 },
  },
  compact: {
    // スマホのドックは2段（案件名と利益・納期 / 問題・詳細・メニュー）
    regions: { gutter: 6, top: 48, notices: { place: 'stack', height: 136 }, dock: 112 },
    controls: 'dock',
    dock: {
      projectName: true,
      items: narrowItems,
      details: ['spend', 'utilization', 'signals'],
      tabs: { office: false, others: 0 },
      dense: true,
      bottom: 0,
    },
    sheet: { maxWidth: 760, heightRatio: 0.86, minHeight: 360 },
    assignCards: 'scroll',
    toast: { max: 1, width: null },
    notice: { max: 1, durationMs: 2200 },
  },
  minWorldHeight: 200,
  flow: {
    keepDetailAfterAssign: false,
    focusZoom: 1.4,
    toastDismissible: true,
    dismiss: ['esc', 'closeButton', 'backdropClick'],
    termCardMs: 9000,
    coachPadding: 10,
    deliveryCards: 3,
    deliveryCardMs: 10000,
    workflowPicks: 3,
    dayMs: 2400,
    skipDayMs: 700,
  },
};

/** 画面の形。phone: スマホ / narrow: 狭い PC・タブレット / wide: 広い PC */
export type ScreenShape = 'phone' | 'narrow' | 'wide';

export function screenShape(layout: UiLayout, width: number): ScreenShape {
  if (width < layout.breakpoints.compact) return 'phone';
  return width < layout.breakpoints.wide ? 'narrow' : 'wide';
}

const formOf = (layout: UiLayout, shape: ScreenShape): LayoutForm =>
  shape === 'phone' ? layout.compact : shape === 'narrow' ? layout.narrow : layout.wide;

/** 幅に応じた構成を選ぶ */
export function layoutFormFor(layout: UiLayout, width: number): { compact: boolean; form: LayoutForm } {
  const shape = screenShape(layout, width);
  return { compact: shape === 'phone', form: formOf(layout, shape) };
}

/** 画面上の矩形（CSS ピクセル。セーフエリアの内側の左上が原点） */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 画面の領域。top・notices・world・dock は互いに重ならない。sheet（モーダル）は開いたときにすべての上へ出す */
export interface ScreenRegions {
  readonly shape: ScreenShape;
  readonly form: LayoutForm;
  readonly top: Rect;
  readonly notices: Rect;
  readonly world: Rect;
  readonly dock: Rect;
  /** モーダルを出せる範囲（画面の余白の内側。幅は sheet.maxWidth まで）。モーダルの高さはこれを超えない */
  readonly sheet: Rect;
}

/**
 * 画面の大きさ（セーフエリアの内側）から、領域の矩形を求める。
 * 上の帯は上端、ドックは下端（dock.bottom だけ浮かせる）に置き、その間をお知らせの列と 3D の世界で分ける。
 * 3D の世界が minWorldHeight より低くなるときは、お知らせの帯（stack）を縮めてでも世界の高さを残す
 */
export function screenRegions(layout: UiLayout, size: { width: number; height: number }): ScreenRegions {
  const shape = screenShape(layout, size.width);
  const form = formOf(layout, shape);
  const { gutter: g, top: topHeight, notices: column } = form.regions;
  const W = Math.max(0, size.width);
  const H = Math.max(0, size.height);
  const top: Rect = { x: g, y: g, width: W - 2 * g, height: topHeight };
  const below = top.y + top.height + g;
  const full = form.dock.bottom === 0;
  const dockY = H - form.dock.bottom - form.regions.dock;
  const dock: Rect = { x: full ? 0 : g, y: dockY, width: full ? W : W - 2 * g, height: form.regions.dock };
  const middle = Math.max(0, dockY - g - below);
  let notices: Rect;
  let world: Rect;
  if (column.place === 'side') {
    const width = Math.min(column.width, Math.max(0, W - 2 * g) / 2);
    notices = { x: W - g - width, y: below, width, height: middle };
    world = { x: 0, y: below, width: Math.max(0, notices.x - g), height: middle };
  } else {
    const height = Math.max(0, Math.min(column.height, middle - g - layout.minWorldHeight));
    notices = { x: g, y: below, width: W - 2 * g, height };
    const worldY = below + height + g;
    world = { x: 0, y: worldY, width: W, height: Math.max(0, dockY - g - worldY) };
  }
  const sheetWidth = Math.max(0, Math.min(form.sheet.maxWidth, W - 2 * g));
  const sheet: Rect = { x: (W - sheetWidth) / 2, y: g, width: sheetWidth, height: Math.max(0, H - 2 * g) };
  return { shape, form, top, notices, world, dock, sheet };
}

/** モーダルの高さ：画面の高さ × 比率（低い画面では minHeight まで伸ばす）を、画面の余白の内側（maxHeight）に収める */
export function sheetHeight(sheet: SheetLayout, viewHeight: number, maxHeight = Number.POSITIVE_INFINITY): number {
  return Math.min(Math.max(viewHeight * sheet.heightRatio, sheet.minHeight), maxHeight);
}

/** 画面の領域でのモーダルの高さ（sheetHeight） */
export function sheetHeightIn(regions: ScreenRegions, viewHeight: number): number {
  return sheetHeight(regions.form.sheet, viewHeight, regions.sheet.height);
}

/** モーダルの矩形：出せる範囲（regions.sheet）の上下中央に、高さ sheetHeightIn で置く */
export function sheetRect(regions: ScreenRegions, viewHeight: number): Rect {
  const height = sheetHeightIn(regions, viewHeight);
  const area = regions.sheet;
  return { x: area.x, y: area.y + (area.height - height) / 2, width: area.width, height };
}
