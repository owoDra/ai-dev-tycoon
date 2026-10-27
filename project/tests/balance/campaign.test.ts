import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { campaignProjects } from '../../src/content/campaign';
import { getProject } from '../../src/content/index';
import { tutorialScript } from '../../src/content/tutorial';
import { scoreCompany, scoreProject } from '../../src/core/scoring';
import { type CampaignPolicy, playCampaign, smartPolicy, smartSeatPolicy } from '../helpers/campaign';
import { FULL_SEEDS, isFullBalance, seeds } from '../helpers/compare';

/**
 * キャンペーン（企画書21章「1プレイ20〜30分」）を smart 系の戦略 Bot で最初から最後まで通して遊ぶ。
 * 1倍速のまま進め（早送りしない）、チュートリアルの吹き出しを読む時間と、新しい依頼を読んで担当を決める時間も時計が進む。
 */
const TUTORIAL_THINK_SECONDS = 5;
const THINK_SECONDS = 20;
const MIN_MINUTES = 20;
const MAX_MINUTES = 30;
const SECONDS_PER_MINUTE = 60;
const BASE_SEEDS = [tutorialScript.seed, 'campaign-1', 'campaign-2', 'campaign-3'];
/** balance:full では、通常の4つに campaign-4 以降を足す */
const SEEDS = isFullBalance ? [...BASE_SEEDS, ...seeds(FULL_SEEDS, 'campaign').slice(BASE_SEEDS.length)] : BASE_SEEDS;

/** ゲーム内の分を、1倍速での実時間（分）に換算する */
const realMinutes = (gameMinutes: number) => gameMinutes / balance.time.minutesPerRealSecond / SECONDS_PER_MINUTE;
const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');

function play(policy: CampaignPolicy, seed: string) {
  return playCampaign({
    seed,
    policy,
    thinkSeconds: THINK_SECONDS,
    tutorialThinkSeconds: TUTORIAL_THINK_SECONDS,
    limitMinutes: MAX_MINUTES * 2 * SECONDS_PER_MINUTE * balance.time.minutesPerRealSecond,
  });
}

describe('キャンペーン（企画書21章）', () => {
  it('smart 系の Bot が最後までクリアでき、所要時間（実時間・1倍速）が20〜30分に収まる', () => {
    for (const seed of SEEDS) {
      const { state, clearedAt } = play(smartSeatPolicy, seed);
      expect(clearedAt, seed).not.toBeNull();
      const minutes = realMinutes(clearedAt ?? 0);
      const company = scoreCompany(state);
      console.log(
        `[企画書21章] seed ${seed}：キャンペーン全体 ${minutes.toFixed(1)} 分（ゲーム内 ${fmt(clearedAt ?? 0)} 分）` +
          ` / 会社の Profit/Person-Day ${fmt(company.profitPerPersonDay)} 円/人日（Seat の固定費 ${fmt(company.seatCost)} 円）`,
      );
      if (seed === tutorialScript.seed) {
        for (const id of campaignProjects) {
          const run = state.projects[id];
          const s = scoreProject(state, id);
          console.log(
            `  ${getProject(id).name}：Profit/Person-Day ${fmt(s?.profitPerPersonDay ?? 0)} 円/人日` +
              ` / 受注 ${realMinutes(run?.startedAt ?? 0).toFixed(1)} 分 → 納品 ${realMinutes(run?.completedAt ?? 0).toFixed(1)} 分` +
              ` / 遅延損失 ${fmt(s?.delayLoss ?? 0)} 円`,
          );
        }
      }
      expect(campaignProjects.every((id) => state.projects[id]?.completedAt !== null)).toBe(true);
      expect(minutes, seed).toBeGreaterThanOrEqual(MIN_MINUTES);
      expect(minutes, seed).toBeLessThanOrEqual(MAX_MINUTES);
    }
  });

  it('Seat を変えなくてもクリアできるが、運用者の Seat の使用量の上限で遅くなる', () => {
    const premium = play(smartSeatPolicy, tutorialScript.seed);
    const standard = play(smartPolicy, tutorialScript.seed);
    console.log(
      `[企画書6章] キャンペーン全体：全員Standard ${realMinutes(standard.clearedAt ?? 0).toFixed(1)} 分` +
        ` vs 運用者だけPremium ${realMinutes(premium.clearedAt ?? 0).toFixed(1)} 分`,
    );
    expect(standard.clearedAt).not.toBeNull();
    expect(premium.clearedAt ?? 0).toBeLessThan(standard.clearedAt ?? 0);
  });
});
