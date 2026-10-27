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

  it('実務モードはタイトルから開き、タイトルへ戻る。ほかの画面からは開かない', () => {
    const practice = nextScreen(titleScreen, { type: 'Practice' });
    expect(practice).toEqual({ id: 'practice' });
    expect(nextScreen(practice, { type: 'Back' })).toEqual(titleScreen);
    const select = nextScreen(titleScreen, { type: 'Open' });
    expect(nextScreen(select, { type: 'Practice' })).toBe(select);
  });
});

describe('画面遷移（長く遊ぶ会社）', () => {
  it('納品のカードから、案件ボードとプレイの画面でその案件の結果画面（振り返り）を開き、案件ボードへ戻る', () => {
    const review = { type: 'Review', projectId: 'p~1~M' } as const;
    expect(nextScreen({ id: 'select' }, review)).toEqual({ id: 'result', projectId: 'p~1~M' });
    expect(nextScreen({ id: 'play', projectId: 'p~2~S' }, review)).toEqual({ id: 'result', projectId: 'p~1~M' });
    expect(nextScreen(titleScreen, review)).toBe(titleScreen);
    expect(nextScreen({ id: 'result', projectId: 'p~1~M' }, { type: 'Board' })).toEqual({ id: 'select' });
  });
});
