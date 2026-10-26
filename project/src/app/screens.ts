import { type Accessor, createSignal } from 'solid-js';

/** 画面。タイトル → 案件選択 → プレイ → 結果（仮）の順に進む */
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
  | { readonly type: 'Complete' }
  | { readonly type: 'Retry' }
  | { readonly type: 'ToTitle' };

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
    case 'Complete':
      return screen.id === 'play' ? { id: 'result', projectId: screen.projectId } : screen;
    case 'Retry':
      return screen.id === 'result' ? { id: 'play', projectId: screen.projectId } : screen;
    case 'ToTitle':
      return titleScreen;
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
