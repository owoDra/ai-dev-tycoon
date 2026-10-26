import { createUniqueId, For, Show } from 'solid-js';
import { outlineColor, type VisualPreset } from '../../../content/look/visual';
import { shade } from '../../../styles/color';

/**
 * 画風の比較用のアイコン。1つの形の定義（面・小さな面・線・点）を、プリセットの画風に応じて描き分ける。
 * 本番のアイコンセットは Phase 04 で作る。
 */

type Hue = 'primary' | 'accent' | 'success' | 'warning' | 'danger';

interface Glyph {
  hue: Hue;
  /** 主要な面 */
  main: readonly string[];
  /** 主要な面の上に重ねる小さな面 */
  sub: readonly string[];
  /** 線（目・チェック・針など） */
  lines: readonly string[];
  /** 濃い色で塗る点 */
  dots: readonly string[];
}

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const rect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;

export const glyphs = {
  human: {
    hue: 'primary',
    main: [circle(24, 15, 8.5), 'M8.5 43c0-9.5 6.9-15.5 15.5-15.5S39.5 33.5 39.5 43z'],
    sub: ['M21.5 28h5l1.6 8.5-4.1 4.5-4.1-4.5z'],
    lines: [],
    dots: [],
  },
  ai: {
    hue: 'accent',
    main: [rect(8.5, 15, 31, 25, 8.5)],
    sub: [circle(24, 7.5, 3.6), rect(4, 23, 5, 9, 2.5), rect(39, 23, 5, 9, 2.5)],
    lines: ['M24 11v4', 'M20 33.5h8'],
    dots: [circle(18.5, 26.5, 3), circle(29.5, 26.5, 3)],
  },
  review: {
    hue: 'success',
    main: [rect(9.5, 5.5, 29, 38, 6)],
    sub: [rect(17, 2.5, 14, 7, 3.5)],
    lines: ['M16.5 25.5l5.5 5.5 10-11'],
    dots: [],
  },
  eval: {
    hue: 'danger',
    main: [circle(24, 24, 19)],
    sub: [circle(24, 24, 11.5)],
    lines: [],
    dots: [circle(24, 24, 4.5)],
  },
  hook: {
    hue: 'warning',
    main: ['M27.5 3.5 9.5 27.5h12.5l-3.5 17 20-25.5H26z'],
    sub: [],
    lines: [],
    dots: [],
  },
  money: {
    hue: 'success',
    main: [circle(24, 24, 19)],
    sub: [circle(24, 24, 13)],
    lines: ['M18.5 16.5l5.5 7.5 5.5-7.5', 'M24 24v10', 'M19 26.5h10', 'M19 31h10'],
    dots: [],
  },
  clock: {
    hue: 'primary',
    main: [circle(24, 24, 19)],
    sub: [circle(24, 24, 13.5)],
    lines: ['M24 15.5V24l6 4'],
    dots: [circle(24, 24, 2.4)],
  },
  warning: {
    hue: 'warning',
    main: [
      'M24 5.5c1.3 0 2.5.7 3.2 1.9l16.2 28.2c1.4 2.4-.3 5.4-3.2 5.4H7.8c-2.9 0-4.6-3-3.2-5.4L20.8 7.4c.7-1.2 1.9-1.9 3.2-1.9z',
    ],
    sub: [],
    lines: ['M24 17v11'],
    dots: [circle(24, 34, 2.6)],
  },
} as const satisfies Record<string, Glyph>;

export type GlyphName = keyof typeof glyphs;
export const glyphNames = Object.keys(glyphs) as GlyphName[];

function hueColor(preset: VisualPreset, hue: Hue): string {
  const p = preset.palette;
  switch (hue) {
    case 'primary':
      return p.primary;
    case 'accent':
      return p.accent;
    default:
      return p[hue].base;
  }
}

interface Paint {
  main: string;
  sub: string;
  ink: string;
  stroke: string;
  strokeWidth: number;
}

/** mono は文字色（currentColor）1色で描く。ボタンの中など、色の付いた面の上に置くときに使う */
export function GlyphIcon(props: { name: GlyphName; preset: VisualPreset; size?: number; hue?: Hue; mono?: boolean }) {
  const id = createUniqueId();
  const glyph = () => glyphs[props.name] as Glyph;
  const color = () => hueColor(props.preset, props.hue ?? glyph().hue);
  const style = () => props.preset.icon.style;
  const sw = () => props.preset.icon.strokeWidth;

  const paint = (): Paint => {
    const c = color();
    if (props.mono)
      return { main: 'currentColor', sub: 'currentColor', ink: 'currentColor', stroke: 'none', strokeWidth: 0 };
    switch (style()) {
      case 'sticker':
        return {
          main: c,
          sub: shade(c, 0.6),
          ink: outlineColor(props.preset),
          stroke: outlineColor(props.preset),
          strokeWidth: sw(),
        };
      case 'clay':
        return { main: `url(#${id}-m)`, sub: `url(#${id}-s)`, ink: shade(c, -0.55), stroke: 'none', strokeWidth: 0 };
      case 'duotone':
        return {
          main: `url(#${id}-m)`,
          sub: `url(#${id}-s)`,
          ink: shade(c, -0.2),
          stroke: c,
          strokeWidth: sw() * 0.55,
        };
    }
  };

  return (
    <svg viewBox="0 0 48 48" width={props.size ?? 48} height={props.size ?? 48} aria-hidden="true" overflow="visible">
      <defs>
        <Show when={style() === 'clay'}>
          <radialGradient id={`${id}-m`} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stop-color={shade(color(), 0.5)} />
            <stop offset="0.55" stop-color={color()} />
            <stop offset="1" stop-color={shade(color(), -0.18)} />
          </radialGradient>
          <radialGradient id={`${id}-s`} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stop-color={shade(color(), 0.85)} />
            <stop offset="1" stop-color={shade(color(), 0.42)} />
          </radialGradient>
          <filter id={`${id}-f`} x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="1.8" flood-color={shade(color(), -0.5)} flood-opacity="0.35" />
          </filter>
        </Show>
        <Show when={style() === 'duotone'}>
          <linearGradient id={`${id}-m`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stop-color={shade(color(), 0.85)} />
            <stop offset="1" stop-color={shade(color(), 0.6)} />
          </linearGradient>
          <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stop-color={shade(color(), 0.25)} />
            <stop offset="1" stop-color={color()} />
          </linearGradient>
        </Show>
      </defs>
      <g
        filter={style() === 'clay' && !props.mono ? `url(#${id}-f)` : undefined}
        stroke-linejoin="round"
        stroke-linecap="round"
      >
        <For each={glyph().main}>
          {(d) => <path d={d} fill={paint().main} stroke={paint().stroke} stroke-width={paint().strokeWidth} />}
        </For>
        <For each={glyph().sub}>
          {(d) => <path d={d} fill={paint().sub} stroke={paint().stroke} stroke-width={paint().strokeWidth} />}
        </For>
        <For each={glyph().lines}>{(d) => <path d={d} fill="none" stroke={paint().ink} stroke-width={sw()} />}</For>
        <For each={glyph().dots}>{(d) => <path d={d} fill={paint().ink} />}</For>
      </g>
    </svg>
  );
}
