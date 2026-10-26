import { ja } from '../../i18n/ja';
import type { TweakGroup } from '../explore/tweak';

const g = ja.world.tweakGroups;
const range = (path: string, min: number, max: number, step: number) => ({
  path,
  kind: 'range' as const,
  min,
  max,
  step,
});
const select = (path: string, options: readonly string[]) => ({ path, kind: 'select' as const, options });

const scaleRefs = ['neutral', 'primary', 'accent', 'success', 'warning', 'danger'].flatMap((n) =>
  [50, 100, 200, 300, 400].map((s) => `${n}.${s}`),
);

/** `?dev=tweak` のワールドの調整パネルで動かせる項目（WorldLook のパス） */
export const worldTweakGroups: readonly TweakGroup[] = [
  {
    title: g.camera,
    fields: [
      range('camera.elevationDeg', 15, 80, 1),
      range('camera.azimuthDeg', 0, 90, 1),
      range('camera.zoomMin', 0.3, 1, 0.05),
      range('camera.zoomMax', 1, 5, 0.1),
      range('camera.stiffness', 50, 600, 10),
      range('camera.damping', 5, 60, 1),
    ],
  },
  {
    title: g.shading,
    fields: [
      select('shading.mode', ['toon', 'lambert']),
      range('shading.ambient', 0, 3, 0.05),
      range('shading.sun', 0, 5, 0.1),
      range('shading.sunElevationDeg', 10, 90, 1),
      range('shading.sunAzimuthDeg', -180, 180, 5),
    ],
  },
  {
    title: g.outline,
    fields: [select('outline.enabled', ['true', 'false']), range('outline.thickness', 0.005, 0.08, 0.005)],
  },
  { title: g.shadow, fields: [range('shadow.opacity', 0, 1, 0.02), range('shadow.size', 0.5, 3, 0.05)] },
  {
    title: g.character,
    fields: [
      range('character.scale', 0.6, 1.6, 0.05),
      range('character.stretch', 0.7, 1.4, 0.05),
      range('character.bob', 0, 0.15, 0.005),
      range('character.tiltDeg', 0, 25, 1),
      range('character.squash', 0, 0.4, 0.01),
      range('character.walkSpeed', 0.5, 6, 0.1),
    ],
  },
  {
    title: g.flow,
    fields: [
      range('flow.travelMinutes', 5, 60, 1),
      range('flow.packetSize', 0.15, 0.6, 0.01),
      range('flow.packetGlow', 0, 1, 0.05),
      range('flow.stackSpacing', 0.15, 0.6, 0.01),
    ],
  },
  {
    title: g.bottleneck,
    fields: [
      range('bottleneck.fullMinutes', 30, 600, 10),
      range('bottleneck.threshold', 0, 1, 0.05),
      range('bottleneck.pulseAmplitude', 0, 0.15, 0.005),
      range('bottleneck.pulseHz', 0.2, 3, 0.1),
      range('bottleneck.ringOpacity', 0, 1, 0.05),
      select('bottleneck.ringColor', scaleRefs),
    ],
  },
  {
    title: g.environment,
    fields: [
      range('environment.islandSize', 2, 5, 0.1),
      range('environment.islandHeight', 0.1, 0.8, 0.05),
      range('environment.islandGap', 1, 5, 0.1),
      range('environment.props', 0, 1, 0.05),
      select('environment.background', scaleRefs),
      select('environment.floorTint', scaleRefs),
      select('environment.islandTop', scaleRefs),
      select('environment.islandDone', scaleRefs),
    ],
  },
];
