import { type Accessor, createSignal } from 'solid-js';

/**
 * 画面。タイトル → プレイ（3D のホーム）の順に進む。プレイは案件を開いていなくても入れ、
 * projectId のないプレイがホーム（会社のオフィスと、引き合いの入口だけのドック）になる。
 * 案件ボードはホームとプレイの上に開くシートで、画面ではない（タイトルへ戻るのは設定のメニューからだけ）。
 * 案件の結果画面（振り返り）は、納品のカード・案件ボードの受注行・社員と Seat の「実績」から開き、閉じると開く前の画面へ戻る
 * （決算は App が画面の上に重ねて出す）。
 * 会社はチュートリアルから始まり、タイトルから直接チュートリアルの案件へ進む。プレイ中はタブで案件を切り替える。
 * 「続きから」・会社で最後の案件を納品したあと・結果の後は、ホームへ戻る。
 * 実務モード（実際の仕事の試算）はタイトルから開き、タイトルへ戻る
 */
export type Screen =
  | { readonly id: 'title' }
  /** projectId を省くとホーム */
  | { readonly id: 'play'; readonly projectId?: string }
  /** from は振り返りを開く前に見ていた案件（ホームからなら省く。閉じたら戻る先） */
  | { readonly id: 'result'; readonly projectId: string; readonly from?: string }
  | { readonly id: 'practice' };

/** 画面遷移のきっかけ */
export type ScreenAction =
  /** タイトルから会社を開く（ホームへ） */
  | { readonly type: 'Open' }
  | { readonly type: 'Back' }
  | { readonly type: 'StartTutorial'; readonly projectId: string }
  | { readonly type: 'Complete' }
  | { readonly type: 'Retry' }
  | { readonly type: 'ToTitle' }
  /** プレイ中（ホームを含む）に案件のタブへ切り替える */
  | { readonly type: 'Switch'; readonly projectId: string }
  /** プレイ中・結果の後にホームへ戻る */
  | { readonly type: 'Home' }
  /** タイトルから実務モードを開く */
  | { readonly type: 'Practice' }
  /** 納品のカードなどから、その案件の結果画面（振り返り）を開く（プレイから） */
  | { readonly type: 'Review'; readonly projectId: string }
  /** 振り返りを閉じて、開く前に見ていた画面（案件のフロアかホーム）へ戻る */
  | { readonly type: 'Return' };

export const titleScreen: Screen = { id: 'title' };
export const homeScreen: Screen = { id: 'play' };

/** 画面遷移の表（純粋関数）。その画面で受け付けないきっかけなら同じ画面を返す */
export function nextScreen(screen: Screen, action: ScreenAction): Screen {
  switch (action.type) {
    case 'Open':
      return screen.id === 'title' ? homeScreen : screen;
    case 'Back':
      return screen.id === 'practice' ? titleScreen : screen;
    case 'StartTutorial':
      return screen.id === 'title' ? { id: 'play', projectId: action.projectId } : screen;
    case 'Complete':
      return screen.id === 'play' && screen.projectId !== undefined
        ? { id: 'result', projectId: screen.projectId }
        : screen;
    case 'Retry':
      return screen.id === 'result' ? { id: 'play', projectId: screen.projectId } : screen;
    case 'ToTitle':
      return titleScreen;
    case 'Switch':
      return screen.id === 'play' ? { id: 'play', projectId: action.projectId } : screen;
    case 'Home':
      return screen.id === 'play' || screen.id === 'result' ? homeScreen : screen;
    case 'Practice':
      return screen.id === 'title' ? { id: 'practice' } : screen;
    case 'Review':
      if (screen.id !== 'play') return screen;
      return screen.projectId === undefined
        ? { id: 'result', projectId: action.projectId }
        : { id: 'result', projectId: action.projectId, from: screen.projectId };
    case 'Return':
      if (screen.id !== 'result') return screen;
      return screen.from === undefined ? homeScreen : { id: 'play', projectId: screen.from };
  }
}

/**
 * 案件を納品した後の画面（純粋関数）。done は納品した案件、rest は進行中のまま残っている案件。
 * 会社（案件ボードのある会社）で最後の案件を納品したらホームへ戻り、開いていた案件を納品して残りがあれば、残りの先頭のフロアへ移る。
 * 案件ボードのない単発のプレイは、これまでどおり結果画面へ進む。プレイ以外の画面とホームは変えない
 */
export function afterDelivery(
  screen: Screen,
  done: readonly string[],
  rest: readonly string[],
  company: boolean,
): Screen {
  if (screen.id !== 'play' || screen.projectId === undefined || done.length === 0) return screen;
  if (rest.length === 0) {
    if (company) return nextScreen(screen, { type: 'Home' });
    const shown = done.includes(screen.projectId) ? screen : { id: 'play' as const, projectId: done.at(-1) ?? '' };
    return nextScreen(shown, { type: 'Complete' });
  }
  if (!done.includes(screen.projectId)) return screen;
  return nextScreen(screen, { type: 'Switch', projectId: rest[0] ?? screen.projectId });
}

export interface Screens {
  readonly screen: Accessor<Screen>;
  go(action: ScreenAction): void;
  /** 画面を直接置き換える（afterDelivery などの計算結果を反映する） */
  set(screen: Screen): void;
}

/** 画面遷移の状態（UI の state。core の GameState には入れない） */
export function createScreens(initial: Screen = titleScreen): Screens {
  const [screen, setScreen] = createSignal<Screen>(initial);
  return { screen, go: (action) => setScreen((s) => nextScreen(s, action)), set: (s) => setScreen(s) };
}
