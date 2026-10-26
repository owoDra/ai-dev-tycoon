import { createUniqueId, For } from 'solid-js';
import { outlineColor, type VisualPreset } from '../../../content/look/visual';
import { mix, rgba, shade } from '../../../styles/color';
import { GlyphIcon, type GlyphName } from './icons';

/**
 * オフィスの島の見本（SVG によるアイソメトリックの静止画）。3D の雰囲気を伝えるためのもので、本番の描画は Phase 05 の Three.js で行う。
 * 座標は床のマス単位で、x は右下・y は左下・z は上に伸びる。
 */

const UNIT = 34;
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;

function project(x: number, y: number, z: number): [number, number] {
  return [(x - y) * COS * UNIT, (x + y) * SIN * UNIT - z * UNIT];
}

const points = (pts: ReadonlyArray<readonly [number, number, number]>) =>
  pts
    .map(([x, y, z]) =>
      project(x, y, z)
        .map((v) => v.toFixed(1))
        .join(','),
    )
    .join(' ');

interface BoxProps {
  at: readonly [number, number, number];
  size: readonly [number, number, number];
  color: string;
  preset: VisualPreset;
  topFill?: string;
}

/** 直方体。上面・左の側面（+y）・右の側面（+x）の3面を描く */
function Box(props: BoxProps) {
  const s = () => props.preset.surface.sideShade;
  const ow = () => Math.min(props.preset.shape.outlineWidth, 2.5);
  const face = (pts: ReadonlyArray<readonly [number, number, number]>, fill: string) => (
    <polygon
      points={points(pts)}
      fill={fill}
      stroke={ow() > 0 ? outlineColor(props.preset) : fill}
      stroke-width={ow() > 0 ? ow() : 0.5}
    />
  );
  const v = () => {
    const [x, y, z] = props.at;
    const [w, d, h] = props.size;
    return { x, y, z, X: x + w, Y: y + d, Z: z + h };
  };
  return (
    <g stroke-linejoin="round">
      {face(
        [
          [v().x, v().Y, v().z],
          [v().X, v().Y, v().z],
          [v().X, v().Y, v().Z],
          [v().x, v().Y, v().Z],
        ],
        shade(props.color, -s() * 0.55),
      )}
      {face(
        [
          [v().X, v().y, v().z],
          [v().X, v().Y, v().z],
          [v().X, v().Y, v().Z],
          [v().X, v().y, v().Z],
        ],
        shade(props.color, -s()),
      )}
      {face(
        [
          [v().x, v().y, v().Z],
          [v().X, v().y, v().Z],
          [v().X, v().Y, v().Z],
          [v().x, v().Y, v().Z],
        ],
        props.topFill ?? props.color,
      )}
    </g>
  );
}

/** 足元の影 */
function Shadow(props: { x: number; y: number; r: number; preset: VisualPreset; filter: string }) {
  const p = () => project(props.x, props.y, 0);
  const hard = () => props.preset.shadow.blur === 0;
  return (
    <ellipse
      cx={p()[0]}
      cy={p()[1] + (hard() ? 3 : 2)}
      rx={props.r * UNIT * COS}
      ry={props.r * UNIT * SIN}
      fill={rgba(props.preset.shadow.color, hard() ? 0.35 : Math.min(0.5, props.preset.shadow.opacity * 1.6))}
      filter={hard() ? undefined : props.filter}
    />
  );
}

/** 人やAIのコマ（胴体＋頭） */
function Pawn(props: { x: number; y: number; body: string; head: string; preset: VisualPreset; robot?: boolean }) {
  const p = () => project(props.x, props.y, 0);
  const ow = () => Math.min(props.preset.shape.outlineWidth, 2.5);
  const stroke = () => (ow() > 0 ? outlineColor(props.preset) : 'none');
  const shadeBody = () => shade(props.body, -props.preset.surface.sideShade);
  return (
    <g transform={`translate(${p()[0]} ${p()[1]})`} stroke={stroke()} stroke-width={ow()} stroke-linejoin="round">
      <path d="M-13 0v-22a13 13 0 0 1 26 0v22a13 6 0 0 1-26 0z" fill={shadeBody()} />
      <path d="M-13 -22a13 13 0 0 1 26 0v8a13 6 0 0 1-26 0z" fill={props.body} />
      {props.robot ? (
        <>
          <rect x="-12" y="-56" width="24" height="20" rx="7" fill={props.head} />
          <circle cx="-5" cy="-46" r="2.6" fill={props.preset.palette.text} stroke="none" />
          <circle cx="5" cy="-46" r="2.6" fill={props.preset.palette.text} stroke="none" />
          <path d="M0 -56v-5" fill="none" />
          <circle cx="0" cy="-63" r="2.8" fill={props.body} />
        </>
      ) : (
        <circle cx="0" cy="-45" r="11" fill={props.head} />
      )}
    </g>
  );
}

/** 頭上の吹き出し（アイコン） */
function Bubble(props: { x: number; y: number; z: number; icon: GlyphName; preset: VisualPreset }) {
  const p = () => project(props.x, props.y, props.z);
  const ow = () => Math.min(props.preset.shape.outlineWidth, 2.5);
  return (
    <g transform={`translate(${p()[0] - 16} ${p()[1] - 16})`}>
      <rect
        x="-3"
        y="-3"
        width="38"
        height="38"
        rx={Math.min(19, props.preset.shape.radiusSm + 4)}
        fill={props.preset.palette.surface}
        stroke={ow() > 0 ? outlineColor(props.preset) : props.preset.palette.line}
        stroke-width={ow() > 0 ? ow() : 1}
      />
      <g transform="translate(4 4) scale(0.5)">
        <GlyphIcon name={props.icon} preset={props.preset} size={48} />
      </g>
    </g>
  );
}

export function IsoIsland(props: { preset: VisualPreset; title: string }) {
  const id = createUniqueId();
  const pal = () => props.preset.palette;
  const floor = () => mix(pal().sunken, pal().accent, 0.18);
  const desk = () => mix(pal().surface, pal().sunken, 0.25);
  const topFill = (c: string): string | undefined =>
    props.preset.surface.gradient > 0.3 ? `url(#${id}-${c === floor() ? 'floor' : 'desk'})` : undefined;
  return (
    <svg viewBox="-150 -110 345 300" role="img" aria-label={props.title} class="h-auto w-full">
      <defs>
        <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <linearGradient id={`${id}-floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color={shade(floor(), 0.35)} />
          <stop offset="1" stop-color={floor()} />
        </linearGradient>
        <linearGradient id={`${id}-desk`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color={shade(desk(), 0.5)} />
          <stop offset="1" stop-color={desk()} />
        </linearGradient>
      </defs>
      <Box at={[0, 0, -0.45]} size={[6, 4.2, 0.45]} color={floor()} topFill={topFill(floor())} preset={props.preset} />
      <For each={[0.8, 3.4]}>
        {(x) => (
          <>
            <Shadow x={x + 1.05} y={1.1} r={1.3} preset={props.preset} filter={`url(#${id}-blur)`} />
            <Box
              at={[x, 0.5, 0]}
              size={[2.1, 1.1, 0.72]}
              color={desk()}
              topFill={topFill(desk())}
              preset={props.preset}
            />
            <Box at={[x + 0.45, 0.6, 0.72]} size={[1.2, 0.14, 0.75]} color={pal().text} preset={props.preset} />
            <Box at={[x + 0.55, 0.75, 0.82]} size={[1.0, 0.02, 0.55]} color={pal().accent} preset={props.preset} />
          </>
        )}
      </For>
      <Shadow x={1.85} y={2.55} r={0.55} preset={props.preset} filter={`url(#${id}-blur)`} />
      <Pawn x={1.85} y={2.55} body={pal().primary} head={pal().surface} preset={props.preset} />
      <Shadow x={4.45} y={2.55} r={0.55} preset={props.preset} filter={`url(#${id}-blur)`} />
      <Pawn x={4.45} y={2.55} body={pal().accent} head={pal().surface} preset={props.preset} robot />
      <Shadow x={0.7} y={3.5} r={0.45} preset={props.preset} filter={`url(#${id}-blur)`} />
      <Box at={[0.4, 3.2, 0]} size={[0.6, 0.6, 0.5]} color={pal().warning.base} preset={props.preset} />
      <PlantTop x={0.7} y={3.5} preset={props.preset} />
      <Bubble x={1.85} y={2.55} z={2.5} icon="warning" preset={props.preset} />
      <Bubble x={4.45} y={2.55} z={2.55} icon="review" preset={props.preset} />
    </svg>
  );
}

function PlantTop(props: { x: number; y: number; preset: VisualPreset }) {
  const p = () => project(props.x, props.y, 0.5);
  const c = () => props.preset.palette.success.base;
  const ow = () => Math.min(props.preset.shape.outlineWidth, 2.5);
  return (
    <g
      transform={`translate(${p()[0]} ${p()[1]})`}
      stroke={ow() > 0 ? outlineColor(props.preset) : 'none'}
      stroke-width={ow()}
    >
      <circle cx="-7" cy="-12" r="11" fill={shade(c(), -props.preset.surface.sideShade)} />
      <circle cx="7" cy="-14" r="11" fill={c()} />
      <circle cx="0" cy="-24" r="11" fill={shade(c(), 0.2)} />
    </g>
  );
}
