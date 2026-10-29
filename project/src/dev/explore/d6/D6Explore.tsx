import { createSignal } from 'solid-js';
import { type Command, reduce } from '../../../core/commands';
import { createInitialState, type GameState } from '../../../core/state';
import { ja } from '../../../i18n/ja';
import { HarnessSheet } from '../../../ui/play/HarnessSheet';
import { harnessForecast, harnessView } from '../../../view/harness';
import { ExploreShell } from '../ExploreShell';

/** 確認に使う案件（資料があり、受け取るで資料の渡し方も出る）と AI Worker */
const PROJECT = 'corporateSite';
const AGENT = 'agent';

/**
 * D6（Harness Builder の見た目）の確認ページ。案D（作業の流れの道＋スロット・盾・鍵）を、すべての部品を解放した状態で触れる。
 * 画面の幅に合わせてシートを出す（狭い幅では道が縦になる）。操作は本物の Command で state を変える
 */
export function D6Explore() {
  const [state, setState] = createSignal<GameState>(
    reduce(createInitialState('d6'), { type: 'StartProject', projectId: PROJECT }).state,
  );
  const dispatch = (c: Command) => setState((s) => reduce(s, c).state);
  const [height, setHeight] = createSignal(window.innerHeight);
  window.addEventListener('resize', () => setHeight(window.innerHeight));
  return (
    <ExploreShell
      title={ja.explore.d6.title}
      options={[{ id: 'laneD', label: ja.explore.d6.laneD, aim: ja.explore.d6.aim }]}
      selected="laneD"
      onSelect={() => undefined}
      tweakOpen={false}
      onToggleTweak={() => undefined}
      tweak={null}
      placement="top"
    >
      <div class="absolute inset-0 bg-bg">
        <HarnessSheet
          view={harnessView(state(), PROJECT, AGENT)}
          layout={{ maxWidth: 760, heightRatio: 1, minHeight: 0, swipeClose: 60 }}
          bottom={0}
          viewHeight={height()}
          maxHeight={height() - 96}
          forecast={(command) => harnessForecast(state(), PROJECT, AGENT, command)}
          dispatch={dispatch}
          onClose={() => undefined}
        />
      </div>
    </ExploreShell>
  );
}
