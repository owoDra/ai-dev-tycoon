import { getGuideChapter, guideChapters } from '../content/guides';
import type { GuideChapterId, GuideStepDef } from '../content/types';
import { holds } from './conditions';
import { companyRunning } from './funds';
import type { GameState } from './state';

/** 今の案内のステップ。案内の途中でなければ null */
export function currentGuideStep(state: GameState): GuideStepDef | null {
  if (!state.guide) return null;
  return getGuideChapter(state.guide.chapter).steps[state.guide.step] ?? null;
}

/** 章を終えたことにする（最後まで進んだ・飛ばした） */
function finish(state: GameState, chapter: GuideChapterId): GameState {
  return { ...state, guide: null, guidesDone: [...state.guidesDone, chapter] };
}

/**
 * 案内を進める。条件で進むステップは条件を満たしていれば進め（一度に複数進むこともある）、最後まで進んだら章を終える。
 * 章の途中でなければ、まだ終えていない章のうち、始める条件を満たした最初のものを始める。
 * チュートリアルを終えて営業している会社だけで動く。Command の適用後と、時間を進めた各ステップの最後に呼ぶ（core/progress.ts）
 */
export function advanceGuides(state: GameState): GameState {
  if (!companyRunning(state)) return state;
  let next = state;
  if (!next.guide) {
    const chapter = guideChapters.find((c) => !next.guidesDone.includes(c.id) && holds(next, c.start));
    if (!chapter) return state;
    next = { ...next, guide: { chapter: chapter.id, step: 0 } };
  }
  for (let step = currentGuideStep(next); step && step.done !== 'ack' && holds(next, step.done); ) {
    const guide = next.guide;
    if (!guide) break;
    next = { ...next, guide: { ...guide, step: guide.step + 1 } };
    step = currentGuideStep(next);
  }
  if (next.guide && !currentGuideStep(next)) next = finish(next, next.guide.chapter);
  return next;
}

/** 「わかった」で ack のステップを進める。ack のステップでなければ同じ state を返す */
export function ackGuide(state: GameState): GameState {
  const guide = state.guide;
  if (!guide || currentGuideStep(state)?.done !== 'ack') return state;
  return advanceGuides({ ...state, guide: { ...guide, step: guide.step + 1 } });
}

/** 今の章を飛ばす。all なら、まだ終えていない章をすべて飛ばす（以後は案内を出さない） */
export function skipGuide(state: GameState, all: boolean): GameState {
  if (all) {
    const rest = guideChapters.map((c) => c.id).filter((id) => !state.guidesDone.includes(id));
    return { ...state, guide: null, guidesDone: [...state.guidesDone, ...rest] };
  }
  return state.guide ? finish(state, state.guide.chapter) : state;
}
