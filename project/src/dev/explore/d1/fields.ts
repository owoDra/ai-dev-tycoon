import { ja } from '../../../i18n/ja';
import type { TweakGroup } from '../tweak';

const g = ja.explore.d1.tweakGroups;
const colors = (paths: readonly string[]) => paths.map((path) => ({ path, kind: 'color' as const }));
const range = (path: string, min: number, max: number, step: number) => ({
  path,
  kind: 'range' as const,
  min,
  max,
  step,
});

/** D1 の調整パネルで動かせる項目（VisualPreset のパス） */
export const visualTweakGroups: readonly TweakGroup[] = [
  {
    title: g.palette,
    fields: colors([
      'palette.bg',
      'palette.surface',
      'palette.sunken',
      'palette.line',
      'palette.text',
      'palette.textMuted',
      'palette.primary',
      'palette.onPrimary',
      'palette.accent',
      'palette.onAccent',
    ]),
  },
  {
    title: g.status,
    fields: colors(
      ['success', 'warning', 'danger'].flatMap((s) => [`palette.${s}.base`, `palette.${s}.text`, `palette.${s}.soft`]),
    ),
  },
  {
    title: g.shape,
    fields: [
      range('shape.radiusSm', 0, 24, 1),
      range('shape.radiusMd', 0, 32, 1),
      range('shape.radiusLg', 0, 48, 1),
      range('shape.outlineWidth', 0, 5, 0.5),
    ],
  },
  {
    title: g.shadow,
    fields: [
      range('shadow.offsetY', 0, 24, 1),
      range('shadow.blur', 0, 48, 1),
      range('shadow.opacity', 0, 1, 0.01),
      range('shadow.layers', 1, 5, 1),
      { path: 'shadow.color', kind: 'color' },
      range('shadow.innerLight', 0, 1, 0.05),
      range('shadow.pressDepth', 0, 8, 1),
    ],
  },
  { title: g.surface, fields: [range('surface.gradient', 0, 1, 0.05), range('surface.sideShade', 0, 0.6, 0.02)] },
  {
    title: g.icon,
    fields: [
      { path: 'icon.style', kind: 'select', options: ['sticker', 'clay', 'duotone'] },
      range('icon.strokeWidth', 1, 5, 0.1),
    ],
  },
  {
    title: g.type,
    fields: [
      range('type.baseSize', 14, 20, 1),
      range('type.scale', 1.1, 1.5, 0.01),
      range('type.headingWeight', 400, 900, 100),
      range('type.bodyWeight', 300, 700, 100),
      range('type.numberWeight', 400, 900, 100),
      range('type.headingTracking', -0.05, 0.05, 0.005),
    ],
  },
  { title: g.motion, fields: [range('motion.popOvershoot', 1, 1.5, 0.01), range('motion.popDuration', 200, 1500, 50)] },
];
