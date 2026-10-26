import { type BufferGeometry, ExtrudeGeometry, Shape } from 'three';
import { agentModels, humanModels } from '../../../src/assets/catalog';
import type { VisualPreset } from '../../../src/content/look/visual';
import type { AgentRole, HumanLookId } from '../../../src/content/look/world';
import { colorScales } from '../../../src/styles/tokens';
import { bakeModel, type Part } from './build';
import { box, capsule, cone, cylinder, dome, groundAo, ring, sphere } from './shapes';

/**
 * キャラクター。丸い頭とカプセル状の体の抽象的な形にし、顔（目と口）は描かない
 * （ランタイムで表情のアトラスを catalog の face の位置に貼る）。
 * 人間は髪型・服の色・小物で、AI Agent はボディの形と役割の部品で見分けがつくようにする。
 */

/** 肌の色。パレットの外の値だが、どのプリセットでも同じにする */
const SKIN = '#ffd9c2';

const HEAD = { r: 0.24, y: 0.92 };

function humanBase(clothes: string, shoes: string): Part[] {
  return [
    { geometry: sphere(0.085, -0.09, 0.05, 0.03, 0.6), color: shoes },
    { geometry: sphere(0.085, 0.09, 0.05, 0.03, 0.6), color: shoes },
    { geometry: capsule(0.2, 0.28, 0, 0.4, 0), color: clothes },
    { geometry: sphere(0.065, -0.22, 0.38, 0.05), color: SKIN },
    { geometry: sphere(0.065, 0.22, 0.38, 0.05), color: SKIN },
    { geometry: sphere(HEAD.r, 0, HEAD.y, 0), color: SKIN },
  ];
}

/** 頭より少し大きい球を後ろへずらした髪。正面の顔は隠さず、頭頂と横と後ろを覆う */
function hair(color: string, back: number, up: number, r = HEAD.r + 0.02): Part {
  return { geometry: sphere(r, 0, HEAD.y + up, -back), color };
}

export function buildHuman(look: HumanLookId, preset: VisualPreset) {
  const s = colorScales(preset);
  const shoes = s.neutral[800];
  const parts: Part[] = [];
  switch (look) {
    case 'bob':
      parts.push(...humanBase(s.primary[400], shoes), hair(s.warning[800], 0.04, 0.03));
      // 前髪
      parts.push({ geometry: box(0.36, 0.08, 0.12, 0.04, 0, HEAD.y + 0.17, 0.13), color: s.warning[800] });
      break;
    case 'cap':
      parts.push(...humanBase(s.accent[400], shoes), hair(s.neutral[800], 0.06, 0.0, HEAD.r + 0.012));
      parts.push({ geometry: dome(HEAD.r + 0.022, 0, HEAD.y + 0.04, 0), color: s.primary[500] });
      parts.push({ geometry: cylinder(0.13, 0.13, 0.025, 0, HEAD.y + 0.1, 0.2, 20), color: s.primary[600] });
      // 名札
      parts.push({ geometry: box(0.1, 0.07, 0.03, 0.01, 0.08, 0.5, 0.19), color: preset.palette.surface });
      break;
    case 'glasses':
      parts.push(...humanBase(s.success[500], shoes), hair(s.neutral[900], 0.06, 0.05, HEAD.r + 0.01));
      for (const x of [-0.075, 0.075])
        parts.push({ geometry: ring(0.055, 0.012, x, HEAD.y + 0.0, HEAD.r + 0.02), color: s.neutral[900] });
      parts.push({ geometry: box(0.05, 0.015, 0.015, 0.005, 0, HEAD.y + 0.01, HEAD.r + 0.02), color: s.neutral[900] });
      // ネクタイ
      parts.push({ geometry: box(0.06, 0.2, 0.03, 0.012, 0, 0.5, 0.195), color: s.danger[500] });
      break;
    case 'bun':
      parts.push(...humanBase(s.warning[400], shoes), hair(s.danger[700], 0.05, 0.03));
      parts.push({ geometry: sphere(0.1, 0, HEAD.y + 0.27, -0.06), color: s.danger[700] });
      // ヘッドホン（頭の上のアーチと耳当て）
      parts.push({ geometry: ring(HEAD.r + 0.045, 0.022, 0, HEAD.y, 0, Math.PI), color: s.neutral[800] });
      for (const x of [-1, 1]) {
        const cup = cylinder(0.075, 0.075, 0.06, 0, 0, 0).rotateZ(Math.PI / 2);
        parts.push({ geometry: recenter(cup, x * (HEAD.r + 0.03), HEAD.y, 0), color: s.accent[400] });
      }
      break;
  }
  return bakeModel(humanModels[look], parts, groundAo);
}

/** rotate は原点まわりなので、回転後に元の中心へ戻す */
function recenter(g: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  g.computeBoundingBox();
  const b = g.boundingBox;
  if (!b) return g;
  return g.translate(x - (b.min.x + b.max.x) / 2, y - (b.min.y + b.max.y) / 2, z - (b.min.z + b.max.z) / 2);
}

function shield(w: number, h: number): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(-w / 2, h / 2);
  shape.lineTo(w / 2, h / 2);
  shape.lineTo(w / 2, 0);
  shape.quadraticCurveTo(w / 2, -h * 0.35, 0, -h / 2);
  shape.quadraticCurveTo(-w / 2, -h * 0.35, -w / 2, 0);
  shape.closePath();
  return new ExtrudeGeometry(shape, {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 6,
  });
}

export function buildAgent(role: AgentRole, preset: VisualPreset) {
  const s = colorScales(preset);
  const body = preset.palette.surface;
  const dark = s.neutral[800];
  const parts: Part[] = [];
  switch (role) {
    case 'research': {
      // 縦長のカプセル・アンテナ・片目のレンズ・浮遊台
      const c = s.accent[400];
      parts.push({ geometry: cylinder(0.16, 0.2, 0.06, 0, 0.05, 0), color: dark });
      parts.push({ geometry: capsule(0.22, 0.5, 0, 0.55, 0), color: body });
      parts.push({ geometry: box(0.46, 0.06, 0.46, 0.03, 0, 0.42, 0), color: c });
      parts.push({ geometry: cylinder(0.015, 0.015, 0.22, 0, 1.08, 0), color: dark });
      parts.push({ geometry: sphere(0.05, 0, 1.21, 0), color: c });
      const lens = cylinder(0.075, 0.085, 0.09, 0, 0, 0).rotateX(Math.PI / 2);
      parts.push({ geometry: recenter(lens, 0.16, 0.93, 0.19), color: dark });
      parts.push({
        geometry: recenter(cylinder(0.055, 0.055, 0.02, 0, 0, 0).rotateX(Math.PI / 2), 0.16, 0.93, 0.24),
        color: s.accent[100],
      });
      break;
    }
    case 'code': {
      // 角丸の箱・ブラケット状のバイザー（< >）・車輪
      const c = s.primary[400];
      parts.push({ geometry: box(0.6, 0.7, 0.5, 0.12, 0, 0.5, 0), color: body });
      parts.push({ geometry: box(0.5, 0.26, 0.04, 0.05, 0, 0.6, 0.235), color: s.primary[100] });
      for (const side of [-1, 1]) {
        for (const tilt of [-1, 1]) {
          const bar = box(0.035, 0.14, 0.04, 0.012, 0, 0, 0).rotateZ(side * tilt * 0.6);
          parts.push({ geometry: recenter(bar, side * 0.21, 0.6 + tilt * 0.05, 0.26), color: c });
        }
      }
      parts.push({ geometry: box(0.6, 0.08, 0.5, 0.04, 0, 0.2, 0), color: c });
      for (const x of [-0.2, 0.2]) {
        const wheel = cylinder(0.08, 0.08, 0.08, 0, 0, 0).rotateZ(Math.PI / 2);
        parts.push({ geometry: recenter(wheel, x, 0.08, 0), color: dark });
      }
      break;
    }
    case 'qa': {
      // 幅の広い丸いボディ・小さな頭・盾の形の胸部
      const c = s.success[400];
      parts.push({ geometry: sphere(0.09, -0.14, 0.06, 0.04, 0.6), color: dark });
      parts.push({ geometry: sphere(0.09, 0.14, 0.06, 0.04, 0.6), color: dark });
      parts.push({ geometry: sphere(0.33, 0, 0.42, 0, 0.85, 20), color: body });
      parts.push({ geometry: sphere(0.2, 0, 0.84, 0), color: body });
      parts.push({ geometry: shield(0.26, 0.3).translate(0, 0.42, 0.27), color: c });
      parts.push({ geometry: box(0.03, 0.12, 0.03, 0.01, 0, 0.44, 0.33), color: preset.palette.surface });
      parts.push({ geometry: box(0.12, 0.03, 0.03, 0.01, 0, 0.47, 0.33), color: preset.palette.surface });
      for (const x of [-1, 1]) parts.push({ geometry: sphere(0.07, x * 0.36, 0.42, 0.05), color: c });
      break;
    }
    case 'release': {
      // 卵形のボディ・背中のロケット（ひれと炎）
      const c = s.danger[400];
      parts.push({ geometry: sphere(0.27, 0, 0.45, 0, 1.3, 20), color: body });
      parts.push({ geometry: box(0.5, 0.05, 0.4, 0.02, 0, 0.32, 0.02), color: c });
      // 頭の上へ突き出すように背負い、正面から見ても先端とひれと炎が見えるようにする
      parts.push({ geometry: cylinder(0.11, 0.11, 0.5, 0, 0.78, -0.3), color: c });
      parts.push({ geometry: cone(0.11, 0.2, 0, 1.13, -0.3), color: preset.palette.surface });
      for (const x of [-1, 1]) parts.push({ geometry: box(0.03, 0.2, 0.16, 0.01, x * 0.13, 0.6, -0.3), color: dark });
      parts.push({
        geometry: cone(0.08, 0.18, 0, 0, 0).rotateX(Math.PI).translate(0, 0.44, -0.3),
        color: s.warning[400],
      });
      break;
    }
  }
  return bakeModel(agentModels[role], parts, groundAo);
}
