import { fxTierList } from '../../content/fx';
import type { FeelPreset } from '../../content/look/feel';
import { ja } from '../../i18n/ja';
import type { TweakGroup } from '../explore/tweak';

const g = ja.fx.tweakGroups;
const range = (path: string, min: number, max: number, step: number) => ({
  path,
  kind: 'range' as const,
  min,
  max,
  step,
});

/**
 * `?dev=tweak` の「演出」パネルで動かせる項目（FeelPreset のパス）。D4 で強さとモーションの性格を比べるのに使う。
 * 動き方の項目は、いまのモーションの性格が spring か tween かで変わる
 */
export function feelTweakGroups(feel: FeelPreset): readonly TweakGroup[] {
  const t = feel.motion.transition;
  return [
    ...fxTierList.map((tier) => ({
      title: g[`tier${tier}`],
      fields: [
        range(`tiers.${tier}.scale`, 0.5, 2.5, 0.05),
        range(`tiers.${tier}.durationMs`, 100, 4000, 50),
        range(`tiers.${tier}.particles`, 0, 320, 2),
        range(`tiers.${tier}.shakePx`, 0, 12, 0.5),
        range(`tiers.${tier}.flash`, 0, 1, 0.05),
      ],
    })),
    {
      title: g.motion,
      fields: [
        ...(t.type === 'spring'
          ? [
              range('motion.transition.stiffness', 50, 1200, 10),
              range('motion.transition.damping', 2, 80, 1),
              range('motion.transition.mass', 0.2, 4, 0.1),
            ]
          : [range('motion.transition.durationMs', 100, 1200, 10)]),
        range('motion.bounce.overshoot', 0, 1.5, 0.05),
        range('motion.bounce.wobbles', 0, 5, 1),
        range('motion.bounce.seconds', 0.1, 1.5, 0.05),
        range('motion.pop.from', 0, 1, 0.05),
        range('motion.pop.overshoot', 1, 1.6, 0.01),
      ],
    },
    {
      title: g.combo,
      fields: [
        range('combo.step', 0, 0.6, 0.01),
        range('combo.maxSteps', 0, 12, 1),
        range('hitStop.durationMs', 0, 400, 10),
        range('hitStop.timeScale', 0, 1, 0.05),
        range('countUpMs', 0, 2000, 50),
        range('chipMs', 200, 4000, 100),
      ],
    },
  ];
}
