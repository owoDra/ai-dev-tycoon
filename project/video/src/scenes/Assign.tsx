import { AbsoluteFill } from 'remotion';
import { Caption } from '../components/Caption';
import { Shot } from '../components/Shot';

/** 担当を決める：島（作業）を押して、人間・AI・その組み合わせから選ぶ */
export const Assign = () => (
  <AbsoluteFill>
    <Shot name="assign" from={{ x: 0.5, y: 0.6, zoom: 1.05 }} to={{ x: 0.33, y: 0.8, zoom: 1.75 }} />
    <Caption label="担当を決める" sub="人間・AI・AI → 人間レビュー・自動テスト・Agent Workflow">
      この仕事、だれに任せる？
    </Caption>
  </AbsoluteFill>
);
