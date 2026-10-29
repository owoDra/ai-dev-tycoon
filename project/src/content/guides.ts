import type { GuideChapterDef } from './types';

/**
 * チュートリアルの後の案内（章）。最初のチュートリアルは任せ方だけを教えるので、会社の運営の基本（受注・評価・お金・昇格）を、
 * 必要になったときに短い章で教える。章は1つずつ進み、どれも飛ばせる。案内は解放の進み方を変えない（教えるだけ）。
 * 照らす場所と文言はここで決め、進行は core/guides.ts が判定し、UI はこのデータを読んで表示するだけにする
 */
export const guideChapters: readonly GuideChapterDef[] = [
  {
    // 第2章：初めての受注。チュートリアルの案件を納品した直後に、評価の中心と、仕事の取り方を教える
    id: 'firstOrder',
    start: { type: 'projectsCompleted', count: 1 },
    steps: [
      { say: 'result', spot: null, done: 'ack' },
      { say: 'openBoard', spot: 'board', done: { type: 'projectsStarted', count: 2 } },
      { say: 'work', spot: 'nextDay', done: { type: 'projectsCompleted', count: 2 } },
      { say: 'review', spot: 'strip', done: 'ack' },
    ],
  },
  {
    // 第3章：お金の流れ。2件目を納品したら、資金・費用・倒産と、昇格の条件を教える
    id: 'money',
    start: { type: 'projectsCompleted', count: 2 },
    steps: [
      { say: 'cash', spot: 'strip', done: 'ack' },
      { say: 'goal', spot: 'strip', done: 'ack' },
    ],
  },
  // 昇格の章：その規模で増えるものを短く教える
  { id: 'startup', start: { type: 'tier', tier: 'startup' }, steps: [{ say: 'startup', spot: 'board', done: 'ack' }] },
  { id: 'small', start: { type: 'tier', tier: 'small' }, steps: [{ say: 'small', spot: null, done: 'ack' }] },
  { id: 'mid', start: { type: 'tier', tier: 'mid' }, steps: [{ say: 'mid', spot: 'board', done: 'ack' }] },
  { id: 'large', start: { type: 'tier', tier: 'large' }, steps: [{ say: 'large', spot: 'strip', done: 'ack' }] },
];

export function getGuideChapter(id: GuideChapterDef['id']): GuideChapterDef {
  const chapter = guideChapters.find((c) => c.id === id);
  if (!chapter) throw new Error(`未定義の案内の章: ${id}`);
  return chapter;
}
