import { AbsoluteFill, Sequence } from 'remotion';
import { Caption, Em } from '../components/Caption';
import { Shot } from '../components/Shot';

/** 持ち込みと持ち寄りバトル：自分の Claude Code の設定がカードになり、同じ合言葉で競う */
export const Bring = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={130}>
      <Shot name="bring" from={{ x: 0.5, y: 0.35, zoom: 1.1 }} to={{ x: 0.5, y: 0.62, zoom: 1.45 }} />
      <Caption label="持ち込み" sub="SKILL.md・Hook・Subagent・CLAUDE.md を読んで、書き方を採点">
        自分の <Em>Claude Code の設定</Em>が
        <br />
        ゲームのカードに
      </Caption>
    </Sequence>
    <Sequence from={130}>
      <Shot name="floor" from={{ x: 0.45, y: 0.45, zoom: 1.25 }} to={{ x: 0.5, y: 0.5, zoom: 1.05 }} />
      <Caption label="持ち寄りバトル" sub="同じ合言葉なら、同じ案件・同じ社員・同じ事件">
        みんなのカードで
        <br />
        <Em>利益を競う</Em>
      </Caption>
    </Sequence>
  </AbsoluteFill>
);
