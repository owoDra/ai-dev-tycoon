import { AbsoluteFill } from 'remotion';
import { Caption, Em } from '../components/Caption';
import { Shot } from '../components/Shot';

/** 納品：スコアは「一人あたりの利益」 */
export const Delivered = () => (
  <AbsoluteFill>
    <Shot name="result" from={{ x: 0.5, y: 0.5, zoom: 1 }} to={{ x: 0.5, y: 0.36, zoom: 1.55 }} />
    <Caption label="納品" style={{ top: 'auto', bottom: 70 }} sub="AIの使い方しだいで、同じ人数でも結果が変わる">
      スコアは<Em tone="success">一人あたりの利益</Em>
    </Caption>
  </AbsoluteFill>
);
