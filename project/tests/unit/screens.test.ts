import { describe, expect, it } from 'vitest';
import { afterDelivery, homeScreen, nextScreen, type Screen, titleScreen } from '../../src/app/screens';

describe('画面遷移', () => {
  it('タイトル → ホーム → 案件のプレイ → 結果 → もう一度 / タイトルへ', () => {
    let s: Screen = titleScreen;
    s = nextScreen(s, { type: 'Open' });
    expect(s).toEqual({ id: 'play' });
    s = nextScreen(s, { type: 'Switch', projectId: 'ecRenewal' });
    expect(s).toEqual({ id: 'play', projectId: 'ecRenewal' });
    s = nextScreen(s, { type: 'Complete' });
    expect(s).toEqual({ id: 'result', projectId: 'ecRenewal' });
    expect(nextScreen(s, { type: 'Retry' })).toEqual({ id: 'play', projectId: 'ecRenewal' });
    expect(nextScreen(s, { type: 'ToTitle' })).toEqual(titleScreen);
  });

  it('チュートリアルはタイトルからホームを飛ばして案件のプレイへ進む', () => {
    expect(nextScreen(titleScreen, { type: 'StartTutorial', projectId: 'tutorialLp' })).toEqual({
      id: 'play',
      projectId: 'tutorialLp',
    });
    expect(nextScreen(homeScreen, { type: 'StartTutorial', projectId: 'tutorialLp' })).toBe(homeScreen);
  });

  it('その画面で受け付けないきっかけでは遷移しない', () => {
    expect(nextScreen(titleScreen, { type: 'Complete' })).toBe(titleScreen);
    expect(nextScreen(titleScreen, { type: 'Switch', projectId: 'ecRenewal' })).toBe(titleScreen);
    const play: Screen = { id: 'play', projectId: 'ecRenewal' };
    expect(nextScreen(play, { type: 'Back' })).toBe(play);
    // ホームでは結果画面へ進まない（開いている案件がない）
    expect(nextScreen(homeScreen, { type: 'Complete' })).toBe(homeScreen);
  });
});

describe('画面遷移（キャンペーン）', () => {
  it('プレイ中はタブで案件を切り替え、ホームへ戻れる。結果の後もホームへ戻る', () => {
    const play: Screen = { id: 'play', projectId: 'corporateSite' };
    expect(nextScreen(play, { type: 'Switch', projectId: 'saasFeature' })).toEqual({
      id: 'play',
      projectId: 'saasFeature',
    });
    expect(nextScreen(play, { type: 'Home' })).toEqual(homeScreen);
    expect(nextScreen({ id: 'result', projectId: 'saasFeature' }, { type: 'Home' })).toEqual(homeScreen);
    expect(nextScreen(homeScreen, { type: 'Switch', projectId: 'saasFeature' })).toEqual({
      id: 'play',
      projectId: 'saasFeature',
    });
    expect(nextScreen(titleScreen, { type: 'Switch', projectId: 'saasFeature' })).toBe(titleScreen);
    expect(nextScreen(titleScreen, { type: 'Home' })).toBe(titleScreen);
  });

  it('実務モードはタイトルから開き、タイトルへ戻る。ほかの画面からは開かない', () => {
    const practice = nextScreen(titleScreen, { type: 'Practice' });
    expect(practice).toEqual({ id: 'practice' });
    expect(nextScreen(practice, { type: 'Back' })).toEqual(titleScreen);
    const home = nextScreen(titleScreen, { type: 'Open' });
    expect(nextScreen(home, { type: 'Practice' })).toBe(home);
  });
});

describe('画面遷移（長く遊ぶ会社）', () => {
  it('納品のカードから、プレイ（ホームを含む）でその案件の結果画面（振り返り）を開き、ホームへ戻る', () => {
    const review = { type: 'Review', projectId: 'p~1~M' } as const;
    expect(nextScreen(homeScreen, review)).toEqual({ id: 'result', projectId: 'p~1~M' });
    expect(nextScreen({ id: 'play', projectId: 'p~2~S' }, review)).toEqual({ id: 'result', projectId: 'p~1~M' });
    expect(nextScreen(titleScreen, review)).toBe(titleScreen);
    expect(nextScreen({ id: 'result', projectId: 'p~1~M' }, { type: 'Home' })).toEqual(homeScreen);
  });
});

describe('3D ホーム', () => {
  it('案件がなくてもプレイ（ホーム）へ入れる。「続きから」もホームへ進む', () => {
    expect(nextScreen(titleScreen, { type: 'Open' })).toEqual({ id: 'play' });
    expect(homeScreen).toEqual({ id: 'play' });
    expect('projectId' in homeScreen).toBe(false);
  });

  it('タイトルへ戻る遷移は ToTitle（設定のメニュー）だけで、ホームの「もどる」ではタイトルへ行かない', () => {
    expect(nextScreen(homeScreen, { type: 'Back' })).toBe(homeScreen);
    expect(nextScreen(homeScreen, { type: 'ToTitle' })).toEqual(titleScreen);
  });

  it('会社で最後の案件を納品したらホームへ戻る。残りがあれば残りのフロアへ移る', () => {
    const play: Screen = { id: 'play', projectId: 'a' };
    expect(afterDelivery(play, ['a'], [], true)).toEqual(homeScreen);
    // 別の案件を見ている間に最後の案件を納品しても、ホームへ戻る
    expect(afterDelivery({ id: 'play', projectId: 'b' }, ['a', 'b'], [], true)).toEqual(homeScreen);
    expect(afterDelivery(play, ['a'], ['c'], true)).toEqual({ id: 'play', projectId: 'c' });
    // 見ていない案件を納品して残りがあれば、そのまま
    expect(afterDelivery(play, ['b'], ['a'], true)).toBe(play);
    // ホームで納品しても、ホームのまま
    expect(afterDelivery(homeScreen, ['a'], [], true)).toBe(homeScreen);
  });

  it('案件ボードのない単発のプレイは、これまでどおり納品した案件の結果画面へ進む', () => {
    expect(afterDelivery({ id: 'play', projectId: 'a' }, ['a'], [], false)).toEqual({ id: 'result', projectId: 'a' });
    expect(afterDelivery({ id: 'play', projectId: 'b' }, ['a'], [], false)).toEqual({ id: 'result', projectId: 'a' });
  });
});
