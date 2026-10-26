import { outlineColor, type StatusColor, type VisualPreset } from '../content/look/visual';
import { mix, rgba, shade } from './color';

/**
 * 影の CSS を作る。blur が 0 なら輪郭のはっきりした1枚の影、そうでなければ距離とぼかしを段階的に広げた層を重ねる。
 * innerLight は上辺の白いハイライトと下辺の内側の陰で、面をぷっくり見せる。
 */
export function boxShadow(preset: VisualPreset, depth = 1): string {
  const s = preset.shadow;
  const layers: string[] = [];
  if (s.blur === 0) {
    layers.push(`0 ${s.offsetY * depth}px 0 0 ${rgba(s.color, s.opacity)}`);
  } else {
    for (let i = 1; i <= s.layers; i++) {
      const k = i / s.layers;
      layers.push(
        `0 ${(s.offsetY * k * depth).toFixed(1)}px ${(s.blur * k).toFixed(1)}px ${rgba(s.color, s.opacity / s.layers)}`,
      );
    }
  }
  if (s.innerLight > 0) {
    layers.push(`inset 0 2px 1px ${rgba('#ffffff', 0.9 * s.innerLight)}`);
    layers.push(`inset 0 -4px 8px ${rgba(s.color, 0.12 * s.innerLight)}`);
  }
  return layers.join(', ');
}

/** 面のグラデーション。上を明るく、下を少し暗くする */
export function surfaceFill(color: string, gradient: number): string {
  if (gradient === 0) return color;
  return `linear-gradient(180deg, ${shade(color, 0.35 * gradient)} 0%, ${color} 55%, ${shade(color, -0.12 * gradient)} 100%)`;
}

function statusVars(name: string, c: StatusColor): Record<string, string> {
  return { [`--v-${name}`]: c.base, [`--v-${name}-text`]: c.text, [`--v-${name}-soft`]: c.soft };
}

/** プリセットを CSS 変数（--v-*）にする。比較ページはこれを要素の style に流し込んで案を切り替える */
export function visualCssVars(preset: VisualPreset): Record<string, string> {
  const p = preset.palette;
  const { shape, type, surface, shadow, motion } = preset;
  const size = (step: number) => `${(type.baseSize * type.scale ** step).toFixed(1)}px`;
  return {
    '--v-bg': p.bg,
    '--v-surface': p.surface,
    '--v-sunken': p.sunken,
    '--v-line': p.line,
    '--v-text': p.text,
    '--v-text-muted': p.textMuted,
    '--v-primary': p.primary,
    '--v-primary-hover': shade(p.primary, 0.12),
    '--v-primary-pressed': shade(p.primary, -0.12),
    '--v-on-primary': p.onPrimary,
    '--v-accent': p.accent,
    '--v-on-accent': p.onAccent,
    '--v-disabled': mix(p.sunken, p.surface, 0.3),
    '--v-on-disabled': mix(p.textMuted, p.sunken, 0.35),
    ...statusVars('success', p.success),
    ...statusVars('warning', p.warning),
    ...statusVars('danger', p.danger),
    '--v-radius-sm': `${shape.radiusSm}px`,
    '--v-radius-md': `${shape.radiusMd}px`,
    '--v-radius-lg': `${shape.radiusLg}px`,
    '--v-outline-width': `${shape.outlineWidth}px`,
    '--v-outline': outlineColor(preset),
    '--v-shadow': boxShadow(preset),
    '--v-shadow-raised': boxShadow(preset, 1.4),
    '--v-shadow-pressed': boxShadow(preset, Math.max(0, 1 - shadow.pressDepth / Math.max(1, shadow.offsetY))),
    '--v-press-depth': `${shadow.pressDepth}px`,
    '--v-fill-surface': surfaceFill(p.surface, surface.gradient),
    '--v-fill-primary': surfaceFill(p.primary, surface.gradient),
    '--v-fill-accent': surfaceFill(p.accent, surface.gradient),
    '--v-font-size': `${type.baseSize}px`,
    '--v-font-h1': size(3),
    '--v-font-h2': size(2),
    '--v-font-h3': size(1),
    '--v-font-small': size(-1),
    '--v-font-display': size(6),
    '--v-weight-heading': String(type.headingWeight),
    '--v-weight-body': String(type.bodyWeight),
    '--v-weight-number': String(type.numberWeight),
    '--v-tracking-heading': `${type.headingTracking}em`,
    '--v-pop-overshoot': String(motion.popOvershoot),
    '--v-pop-duration': `${motion.popDuration}ms`,
  };
}
