import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getProject } from '../../src/content/index';
import { tutorialScript } from '../../src/content/tutorial';
import type { CompanyTierId, FeatureId } from '../../src/content/types';
import { scoreCompany, scoreProject } from '../../src/core/scoring';
import { FULL_SEEDS, isFullBalance, seeds } from '../helpers/compare';
import {
  type CampaignPolicy,
  playCampaign,
  representativeRun,
  smartPolicy,
  smartSeatPolicy,
} from '../helpers/representative';

/**
 * 1回の遊び（企画書21章「1プレイ20〜30分」）の手応え。時間はプレイヤーが1日ずつ進めるので、遊ぶ長さは進めた日数（判断の回数）で測る。
 * 長く遊ぶ手応えは決算の期と会社の成長（long-run.test.ts）が受け持つ。チュートリアルから、固定 seed で生成した代表的な案件群
 * （以前のキャンペーンの6案件と同じ型・同じ受注の順と条件。tests/helpers/representative.ts）の納品までを、smart 系の戦略 Bot で通して遊ぶ。
 */
const MIN_DAYS = 4;
const MAX_DAYS = 14;
const BASE_SEEDS = [tutorialScript.seed, 'campaign-1', 'campaign-2', 'campaign-3'];
/** balance:full では、通常の4つに campaign-4 以降を足す */
const SEEDS = isFullBalance ? [...BASE_SEEDS, ...seeds(FULL_SEEDS, 'campaign').slice(BASE_SEEDS.length)] : BASE_SEEDS;

/** ゲーム内の分を、日（1日目が 1）に換算する */
const dayOf = (gameMinutes: number) => gameMinutes / balance.time.minutesPerDay + 1;
const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');

function play(policy: CampaignPolicy, seed: string, unlocked: readonly FeatureId[] = [], tier?: CompanyTierId) {
  return playCampaign({
    seed,
    policy,
    limitMinutes: MAX_DAYS * 2 * balance.time.minutesPerDay,
    unlocked,
    ...(tier ? { tier } : {}),
  });
}

describe('チュートリアルと代表的な案件群（企画書21章）', () => {
  it('smart 系の Bot が最後までクリアでき、進める日数が4〜14日に収まる', () => {
    for (const seed of SEEDS) {
      const { state, clearedAt, clearedDays } = play(smartSeatPolicy, seed);
      expect(clearedAt, seed).not.toBeNull();
      const days = clearedDays ?? 0;
      const company = scoreCompany(state);
      console.log(
        `[企画書21章] seed ${seed}：通し ${days} 日（ゲーム内 ${fmt(clearedAt ?? 0)} 分）` +
          ` / 会社の Profit/Person-Day ${fmt(company.profitPerPersonDay)} 円/人日（Seat の固定費 ${fmt(company.seatCost)} 円）`,
      );
      if (seed === tutorialScript.seed) {
        for (const id of representativeRun) {
          const run = state.projects[id];
          const s = scoreProject(state, id);
          console.log(
            `  ${getProject(id).name}：Profit/Person-Day ${fmt(s?.profitPerPersonDay ?? 0)} 円/人日` +
              ` / 受注 ${dayOf(run?.startedAt ?? 0).toFixed(1)} 日目 → 納品 ${dayOf(run?.completedAt ?? 0).toFixed(1)} 日目` +
              `${run?.burningAt !== null ? ' / 炎上' : ''}`,
          );
        }
      }
      expect(representativeRun.every((id) => (state.projects[id]?.completedAt ?? null) !== null)).toBe(true);
      expect(days, seed).toBeGreaterThanOrEqual(MIN_DAYS);
      expect(days, seed).toBeLessThanOrEqual(MAX_DAYS);
    }
  });

  it('Seat を買い足さなくてもクリアできるが、会社の Seat の使用量を使い切って AI が止まるぶん遅くなる', () => {
    // Seat を買える段階の会社どうしで比べる。Context（と、AI の使用量を押し上げる事件）も解放済みにする。
    // 事件はスタートアップから起きるので（Phase 38）、スタートアップの会社で比べる
    const stage: readonly FeatureId[] = ['context', 'team', 'seats'];
    const premium = play(smartSeatPolicy, tutorialScript.seed, stage, 'startup');
    const standard = play(smartPolicy, tutorialScript.seed, stage, 'startup');
    console.log(
      `[企画書6章] 通し：Standard 2枚のまま ${dayOf(standard.clearedAt ?? 0).toFixed(1)} 日目` +
        ` vs Premium を1枚買い足し ${dayOf(premium.clearedAt ?? 0).toFixed(1)} 日目`,
    );
    expect(standard.clearedAt).not.toBeNull();
    expect(premium.clearedAt ?? 0).toBeLessThan(standard.clearedAt ?? 0);
  });
});
