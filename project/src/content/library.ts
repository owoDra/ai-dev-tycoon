import { ja } from '../i18n/ja';
import type { LibraryWorkflowDef } from './types';

const n = ja.library.presets;

/**
 * 同梱の Workflow プリセット（企画書25章）。良い改善を「○○さんは Claude がうまい」で終わらせず、
 * 会社の資産として最初から棚に並べておく例。プレイヤーが保存した Workflow（GameState.library）と同じ形で、
 * 案件の Task に適用すると AI Worker の構成と担当がまとめて決まる。参照先は tests/content/presets.test.ts が検査する
 */
export const libraryPresets: readonly LibraryWorkflowDef[] = [
  {
    // 企画書25章の例：Context Related Files / Skill Coding Standards / Tool Git / Subagent Security / Hook Tests / Eval Architecture Rules
    id: 'presetPrReview',
    name: n.presetPrReview,
    mode: 'aiThenHumanReview',
    modelId: 'standard',
    context: 'needed',
    parts: ['skillPrReview', 'toolGit', 'subReview', 'hookUnitTest', 'evalCodingRules'],
  },
  {
    // 企画書24章の週次アクセス解析を、ゲームの調査・企画の Task に持ち込んだもの
    id: 'presetWeeklyReport',
    name: n.presetWeeklyReport,
    mode: 'aiThenEval',
    modelId: 'standard',
    context: 'needed',
    parts: ['skillReport', 'toolAnalytics', 'subResearch', 'permRead', 'evalAcceptance'],
  },
  {
    id: 'presetFrontend',
    name: n.presetFrontend,
    mode: 'aiThenHumanReview',
    modelId: 'standard',
    context: 'router',
    parts: ['skillFrontend', 'toolFiles', 'permWrite', 'hookFormatter', 'evalUiReq', 'evalA11y'],
  },
  {
    id: 'presetSafeRelease',
    name: n.presetSafeRelease,
    mode: 'agentWorkflow',
    modelId: 'lite',
    context: 'needed',
    parts: ['toolGit', 'permDeploy', 'hookUnitTest', 'evalSecurity'],
  },
];
