import { describe, expect, it } from 'vitest';
import { createPlayLog, IDLE_THRESHOLD_SECONDS } from '../../src/dev/log/playLog';

describe('プレイログ（?dev=log）', () => {
  it('各ステップに着いた時刻・最初の操作まで・迷った時間を記録する', () => {
    const log = createPlayLog('choose');
    log.input(2);
    log.input(2 + IDLE_THRESHOLD_SECONDS + 1);
    log.events(7, [{ type: 'TutorialStepChanged', stepId: 'firstWork' }]);
    log.events(9, [{ type: 'TutorialEnded', skipped: false }]);
    const json = log.toJson(100);
    expect(json.ended).toBe('completed');
    expect(json.totalSeconds).toBe(9);
    expect(json.steps).toEqual([
      { id: 'choose', reachedAt: 0, seconds: 7, firstInputSeconds: 2, longestIdleSeconds: 4, idleSeconds: 4 },
      { id: 'firstWork', reachedAt: 7, seconds: 2, firstInputSeconds: null, longestIdleSeconds: 2, idleSeconds: 0 },
    ]);
  });

  it('誤って押した操作・速度の変更・一時停止・スキップを記録し、終わった後の操作は記録しない', () => {
    const log = createPlayLog('choose');
    log.misclick(1, 'human');
    log.events(2, [
      { type: 'SpeedChanged', speed: 10 },
      { type: 'PauseToggled', paused: true },
    ]);
    expect(log.currentStep()).toBe('choose');
    log.events(3, [{ type: 'TutorialEnded', skipped: true }]);
    log.misclick(4, 'ai');
    const json = log.toJson(5);
    expect(log.currentStep()).toBeNull();
    expect(json.ended).toBe('skipped');
    expect(json.misclicks).toEqual([{ at: 1, step: 'choose', target: 'human' }]);
    expect(json.speedChanges).toEqual([{ at: 2, speed: 10 }]);
    expect(json.pauses).toBe(1);
  });

  it('終わる前に書き出しても、今のステップを今の時刻で締めた形で出し、記録は続ける', () => {
    const log = createPlayLog('choose');
    expect(log.toJson(3).steps).toEqual([
      { id: 'choose', reachedAt: 0, seconds: 3, firstInputSeconds: null, longestIdleSeconds: 3, idleSeconds: 3 },
    ]);
    log.events(5, [{ type: 'TutorialStepChanged', stepId: 'firstWork' }]);
    expect(log.toJson(6).steps.map((s) => s.seconds)).toEqual([5, 1]);
  });
});
