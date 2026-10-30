import { AbsoluteFill } from 'remotion';
import { Caption, Em } from '../components/Caption';
import { Shot } from '../components/Shot';

/** 進行中：AI は速いが、事件が起き、ボトルネックが動く */
export const Trouble = () => (
  <AbsoluteFill>
    <Shot name="trouble" from={{ x: 0.5, y: 0.5, zoom: 1 }} to={{ x: 0.42, y: 0.42, zoom: 1.35 }} />
    <Caption
      label="進める"
      sub="ルールの衝突、レビュー待ちの渋滞…ボトルネックはどんどん動く"
      style={{ top: 'auto', bottom: 160 }}
    >
      AIは速い。<Em>でも、事件も起きる</Em>
    </Caption>
  </AbsoluteFill>
);
