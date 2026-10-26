import {
  BackSide,
  Color,
  type Material,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshToonMaterial,
  type Texture,
} from 'three';
import type { VisualPreset } from '../content/look/visual';
import type { ScaleRef, WorldLook } from '../content/look/world';
import { colorScales, type ScaleName, type ScaleStep } from '../styles/tokens';

/** トークンの段階（`primary.200`）を色にする */
export function scaleColor(ref: ScaleRef, visual: VisualPreset): string {
  const [name, step] = ref.split('.') as [ScaleName, `${ScaleStep}`];
  return colorScales(visual)[name][Number(step) as ScaleStep];
}

export interface WorldMaterials {
  /** 頂点カラーで塗ったモデル（キャラクター・小物）。陰影の方式は look.shading.mode */
  readonly vertex: Material;
  /** 反転ハルのアウトライン。法線方向へ押し出した裏面を線の色で塗る */
  readonly outline: Material;
  /** 単色の面（島など）。色ごとに1つを共有する */
  solid(color: string): Material;
  /** 光るパケット */
  readonly packet: Material;
  /** 接地影 */
  readonly shadow: MeshBasicMaterial;
  dispose(): void;
}

/**
 * ワールドで共有するマテリアル。同じ見た目のものは1つのマテリアルを使い回し、描画の切り替えを減らす。
 * look を変えたときは作り直す（呼び出し側がメッシュに付け替える）。
 */
export function createMaterials(
  look: WorldLook,
  visual: VisualPreset,
  textures: { gradient: Texture; blob: Texture },
): WorldMaterials {
  const toon = look.shading.mode === 'toon';
  const make = (params: { color?: string; vertexColors?: boolean; emissive?: string; emissiveIntensity?: number }) =>
    toon ? new MeshToonMaterial({ ...params, gradientMap: textures.gradient }) : new MeshLambertMaterial(params);

  const outline = new MeshBasicMaterial({ color: visual.palette.line, side: BackSide });
  const thickness = { value: look.outline.thickness };
  outline.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = thickness;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uOutline;\nvoid main() {')
      .replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * uOutline;');
  };
  outline.customProgramCacheKey = () => 'world-outline';

  const solids = new Map<string, Material>();
  const all: Material[] = [];
  const track = <M extends Material>(m: M) => {
    all.push(m);
    return m;
  };
  const accent = new Color(scaleColor('accent.300', visual));

  return {
    vertex: track(make({ vertexColors: true })),
    outline: track(outline),
    packet: track(
      make({ vertexColors: true, emissive: `#${accent.getHexString()}`, emissiveIntensity: look.flow.packetGlow }),
    ),
    shadow: track(
      new MeshBasicMaterial({
        color: visual.palette.line,
        alphaMap: textures.blob,
        transparent: true,
        opacity: look.shadow.opacity,
        depthWrite: false,
      }),
    ),
    solid(color) {
      let m = solids.get(color);
      if (!m) {
        m = track(make({ color }));
        solids.set(color, m);
      }
      return m;
    },
    dispose() {
      for (const m of all) m.dispose();
    },
  };
}
