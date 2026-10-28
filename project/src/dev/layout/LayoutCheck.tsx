import { App } from '../../app/App';
import { layoutScene } from './scene';

/**
 * 画面構成の確認ページ（Phase 25「レスポンシブな画面構成」）。決まった場面（scene.ts）の会社を本物のプレイ画面で開き、
 * スマホ・狭い PC・広い PC の幅で、上の帯・お知らせの列・3D の世界・ドック・シートが重ならないことを目で確かめる。
 * `home` ならホーム（会社のオフィス）を開く
 */
export function LayoutCheck(props: { home: boolean }) {
  const scene = layoutScene();
  return <App tweak={false} start={{ state: scene.state, projectId: props.home ? null : scene.projectId }} />;
}
