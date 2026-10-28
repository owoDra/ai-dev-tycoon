import type { WorkflowDraft } from '../../src/core/library';

/**
 * テストで使う、プレイヤーが組んで保存しそうな Workflow の構成（ゲームには同梱しない）。
 * 企画書24・25章の例を、ゲームの部品で組んだもの。保存（SaveLibraryWorkflow）してから適用する
 */
export const sampleWorkflows = {
  // 企画書25章の例：Context Related Files / Skill Coding Standards / Tool Git / Subagent Security / Hook Tests / Eval Architecture Rules
  prReview: {
    name: 'Pull Request Review',
    mode: 'aiThenHumanReview',
    modelId: 'standard',
    context: 'needed',
    parts: ['skillPrReview', 'mcpGit', 'subReview', 'hookUnitTest', 'evalCodingRules'],
  },
  // 企画書24章の週次アクセス解析を、ゲームの調査・企画の Task に持ち込んだもの
  weeklyReport: {
    name: '週次レポート',
    mode: 'aiThenEval',
    modelId: 'standard',
    context: 'needed',
    parts: ['skillReport', 'mcpAnalytics', 'subResearch', 'evalAcceptance'],
  },
  frontend: {
    name: 'Frontend 改修',
    mode: 'aiThenHumanReview',
    modelId: 'standard',
    context: 'router',
    parts: ['skillFrontend', 'mcpFilesystem', 'permAcceptEdits', 'hookFormatter', 'evalUiReq', 'evalA11y'],
  },
  safeRelease: {
    name: '安全なリリース',
    mode: 'agentWorkflow',
    modelId: 'lite',
    context: 'needed',
    parts: ['mcpGit', 'permAuto', 'hookUnitTest', 'evalSecurity'],
  },
} satisfies Readonly<Record<string, WorkflowDraft>>;
