import { tutorialLp } from './projects/tutorial-lp';
import type { TutorialScript } from './types';

const P = tutorialLp.id;

/**
 * 最初の3分（企画書50〜51章）。最初の案件そのものをチュートリアルにし、
 * 「人間だけ → AI 導入 → 作業時間が激減 → AI のミス → レビューで改善 → 自動テストでさらに改善」を順に体験させる。
 * 各ステップは「前のステップの後で when を満たしたら進む」。「次へ」ボタンはなく、操作すれば進む。
 * 照らす場所・文言・許す操作はここで決め、UI はこのデータを読んで表示するだけにする。
 */
export const tutorialScript: TutorialScript = {
  projectId: P,
  seed: 'tutorial',
  // 最初の AI は成功させて速さを見せ、2つ目でミスさせる。レビューと自動テストでは、それぞれが失敗を見つける場面を必ず見せる
  forcedAiOutcomes: { wireframe: true, coding: false, form: false, responsive: false },
  alwaysAllowed: ['SetSpeed', 'TogglePause', 'SeeFeatures', 'StartProject', 'SkipTutorial'],
  steps: [
    {
      id: 'choose',
      when: { type: 'start' },
      highlight: { kind: 'task', taskId: 'wireframe' },
      say: 'choose',
      allow: [{ type: 'AssignTask', taskId: 'wireframe', modes: ['human', 'ai'] }],
    },
    {
      id: 'firstWork',
      when: { type: 'taskAssigned', projectId: P, taskId: 'wireframe' },
      highlight: null,
      say: {
        if: { type: 'taskAssigned', projectId: P, taskId: 'wireframe', mode: 'ai' },
        yes: 'aiWorking',
        no: 'humanWorking',
      },
      allow: [],
    },
    {
      id: 'next',
      when: { type: 'taskCompleted', projectId: P, taskId: 'wireframe' },
      highlight: { kind: 'task', taskId: 'coding', mode: 'ai' },
      say: {
        if: { type: 'taskAssigned', projectId: P, taskId: 'wireframe', mode: 'ai' },
        yes: 'aiFast',
        no: 'humanSlow',
      },
      allow: [{ type: 'AssignTask', taskId: 'coding', modes: ['ai'] }],
    },
    {
      id: 'aiAgain',
      when: { type: 'taskAssigned', projectId: P, taskId: 'coding' },
      highlight: null,
      say: 'aiAgain',
      allow: [],
    },
    {
      id: 'miss',
      when: { type: 'taskCompleted', projectId: P, taskId: 'coding' },
      highlight: { kind: 'task', taskId: 'form', mode: 'aiThenHumanReview' },
      say: 'needReview',
      allow: [{ type: 'AssignTask', taskId: 'form', modes: ['aiThenHumanReview'] }],
    },
    {
      id: 'reviewing',
      when: { type: 'taskAssigned', projectId: P, taskId: 'form' },
      highlight: null,
      say: 'reviewing',
      allow: [],
    },
    {
      id: 'tryEval',
      when: { type: 'taskCompleted', projectId: P, taskId: 'form' },
      highlight: { kind: 'task', taskId: 'responsive', mode: 'aiThenEval' },
      say: 'tryEval',
      allow: [{ type: 'AssignTask', taskId: 'responsive', modes: ['aiThenEval'] }],
    },
    {
      id: 'evaluating',
      when: { type: 'taskAssigned', projectId: P, taskId: 'responsive' },
      highlight: null,
      say: 'evaluating',
      allow: [],
    },
  ],
  completeWhen: { type: 'projectCompleted', projectId: P },
};
