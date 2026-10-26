import { fxTierList } from '../../content/fx';
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

/** `?dev=tweak` の「演出」パネルで動かせる項目（FeelPreset のパス）。D4 で強さとモーションの性格を比べるのに使う */
export const feelTweakGroups: readonly TweakGroup[] = [
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
    title: g.spring,
    fields: [
      range('spring.stiffness', 50, 1200, 10),
      range('spring.damping', 2, 80, 1),
      range('spring.mass', 0.2, 4, 0.1),
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
