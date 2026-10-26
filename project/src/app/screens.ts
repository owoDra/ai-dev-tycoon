import { type Accessor, createSignal } from 'solid-js';

/**
 * 画面。タイトル → 案件ボード（select：キャンペーンの受注と進行中の案件）→ プレイ → 結果（仮）の順に進む。
 * キャンペーンはチュートリアルから始まり、タイトルから直接プレイへ進む。プレイ中はタブで案件を切り替え、
 * 新しい依頼があれば案件ボードへ戻って受注する。結果の後は案件ボードへ戻る
 */
export type Screen =
  | { readonly id: 'title' }
  | { readonly id: 'select' }
  | { readonly id: 'play'; readonly projectId: string }
  | { readonly id: 'result'; readonly projectId: string };

/** 画面遷移のきっかけ */
export type ScreenAction =
  | { readonly type: 'Open' }
  | { readonly type: 'Back' }
  | { readonly type: 'Choose'; readonly projectId: string }
  | { readonly type: 'StartTutorial'; readonly projectId: string }
  | { readonly type: 'Complete' }
  | { readonly type: 'Retry' }
  | { readonly type: 'ToTitle' }
  /** プレイ中に別の案件のタブへ切り替える */
  | { readonly type: 'Switch'; readonly projectId: string }
  /** プレイ中・結果の後に案件ボードへ戻る */
  | { readonly type: 'Board' };

export const titleScreen: Screen = { id: 'title' };

/** 画面遷移の表（純粋関数）。その画面で受け付けないきっかけなら同じ画面を返す */
export function nextScreen(screen: Screen, action: ScreenAction): Screen {
  switch (action.type) {
    case 'Open':
      return screen.id === 'title' ? { id: 'select' } : screen;
    case 'Back':
      return screen.id === 'select' ? titleScreen : screen;
    case 'Choose':
      return screen.id === 'select' ? { id: 'play', projectId: action.projectId } : screen;
    case 'StartTutorial':
      return screen.id === 'title' ? { id: 'play', projectId: action.projectId } : screen;
    case 'Complete':
      return screen.id === 'play' ? { id: 'result', projectId: screen.projectId } : screen;
    case 'Retry':
      return screen.id === 'result' ? { id: 'play', projectId: screen.projectId } : screen;
    case 'ToTitle':
      return titleScreen;
    case 'Switch':
      return screen.id === 'play' ? { id: 'play', projectId: action.projectId } : screen;
    case 'Board':
      return screen.id === 'play' || screen.id === 'result' ? { id: 'select' } : screen;
  }
}

export interface Screens {
  readonly screen: Accessor<Screen>;
  go(action: ScreenAction): void;
}

/** 画面遷移の状態（UI の state。core の GameState には入れない） */
export function createScreens(initial: Screen = titleScreen): Screens {
  const [screen, setScreen] = createSignal<Screen>(initial);
  return { screen, go: (action) => setScreen((s) => nextScreen(s, action)) };
}
