import aiSvg from '../../../src/assets/icons/ai.svg?raw';
import evalSvg from '../../../src/assets/icons/eval.svg?raw';
import hookSvg from '../../../src/assets/icons/hook.svg?raw';
import humanSvg from '../../../src/assets/icons/human.svg?raw';
import permissionSvg from '../../../src/assets/icons/permission.svg?raw';
import reviewSvg from '../../../src/assets/icons/review.svg?raw';
import skillSvg from '../../../src/assets/icons/skill.svg?raw';
import subagentSvg from '../../../src/assets/icons/subagent.svg?raw';
import toolSvg from '../../../src/assets/icons/tool.svg?raw';
import workflowSvg from '../../../src/assets/icons/workflow.svg?raw';
import { color } from '../theme';

const svgs = {
  ai: [aiSvg, color.accent, '#ffeeb6'],
  eval: [evalSvg, color.danger, '#ffc9cf'],
  hook: [hookSvg, color.warning, '#ffe2b8'],
  human: [humanSvg, color.primary, '#ffbcd3'],
  permission: [permissionSvg, color.warning, '#ffe2b8'],
  review: [reviewSvg, color.accent, '#ffeeb6'],
  skill: [skillSvg, color.success, '#abeacc'],
  subagent: [subagentSvg, color.accent, '#ffeeb6'],
  tool: [toolSvg, '#aa9da4', '#e1d6d0'],
  workflow: [workflowSvg, color.primary, '#ffbcd3'],
} as const;

export type IconName = keyof typeof svgs;

/**
 * ゲームのアイコン（src/assets/icons）。SVG のクラス（m: 面 / s: 小さな面 / l: 線 / d: 点）に、
 * ゲームの styles/icons.css と同じ考え方で色を当てる
 */
export const Icon = ({ name, size }: { name: IconName; size: number }) => {
  const [svg, main, sub] = svgs[name];
  const css = `.i-${name} svg{width:100%;height:100%;overflow:visible}
.i-${name} .m,.i-${name} .s,.i-${name} .l{stroke:${color.ink};stroke-width:3.2}
.i-${name} .m{fill:${main}}.i-${name} .s{fill:${sub}}.i-${name} .l{fill:none}.i-${name} .d{fill:${color.ink}}`;
  return (
    <div className={`i-${name}`} style={{ width: size, height: size, lineHeight: 0 }}>
      <style>{css}</style>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: リポジトリ内のアイコン SVG だけを入れる */}
      <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
};
