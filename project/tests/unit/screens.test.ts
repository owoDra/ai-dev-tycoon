import { describe, expect, it } from 'vitest';
import { nextScreen, type Screen, titleScreen } from '../../src/app/screens';

describe('画面遷移', () => {
  it('タイトル → 案件選択 → プレイ → 結果 → もう一度 / タイトルへ', () => {
    let s: Screen = titleScreen;
    s = nextScreen(s, { type: 'Open' });
    expect(s).toEqual({ id: 'select' });
    s = nextScreen(s, { type: 'Choose', projectId: 'ecRenewal' });
    expect(s).toEqual({ id: 'play', projectId: 'ecRenewal' });
    s = nextScreen(s, { type: 'Complete' });
    expect(s).toEqual({ id: 'result', projectId: 'ecRenewal' });
    expect(nextScreen(s, { type: 'Retry' })).toEqual({ id: 'play', projectId: 'ecRenewal' });
    expect(nextScreen(s, { type: 'ToTitle' })).toEqual(titleScreen);
  });

  it('チュートリアルはタイトルから案件選択を飛ばしてプレイへ進む', () => {
    expect(nextScreen(titleScreen, { type: 'StartTutorial', projectId: 'tutorialLp' })).toEqual({
      id: 'play',
      projectId: 'tutorialLp',
    });
    const select: Screen = { id: 'select' };
    expect(nextScreen(select, { type: 'StartTutorial', projectId: 'tutorialLp' })).toBe(select);
  });

  it('その画面で受け付けないきっかけでは遷移しない', () => {
    expect(nextScreen(titleScreen, { type: 'Complete' })).toBe(titleScreen);
    expect(nextScreen(titleScreen, { type: 'Choose', projectId: 'ecRenewal' })).toBe(titleScreen);
    const play: Screen = { id: 'play', projectId: 'ecRenewal' };
    expect(nextScreen(play, { type: 'Back' })).toBe(play);
  });
});

describe('画面遷移（キャンペーン）', () => {
  it('プレイ中はタブで案件を切り替え、案件ボードへ戻れる。結果の後も案件ボードへ戻る', () => {
    const play: Screen = { id: 'play', projectId: 'corporateSite' };
    expect(nextScreen(play, { type: 'Switch', projectId: 'saasFeature' })).toEqual({
      id: 'play',
      projectId: 'saasFeature',
    });
    expect(nextScreen(play, { type: 'Board' })).toEqual({ id: 'select' });
    expect(nextScreen({ id: 'result', projectId: 'saasFeature' }, { type: 'Board' })).toEqual({ id: 'select' });
    expect(nextScreen(titleScreen, { type: 'Switch', projectId: 'saasFeature' })).toBe(titleScreen);
    expect(nextScreen(titleScreen, { type: 'Board' })).toBe(titleScreen);
  });
});
