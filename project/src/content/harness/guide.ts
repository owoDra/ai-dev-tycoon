import type { HarnessCategory } from '../types';

/** ミスのカードで、そのミスを止めるもの。part は部品、category はそのカテゴリの（何かに効く）部品のどれか */
export type MistakeStopper = { readonly part: string } | { readonly category: HarnessCategory };

/**
 * Harness Builder の「AI のミスは、どこで止まる？」のカード（文言は ja.harness.mistakes）。
 * 止めるものがなければ、fallback（human: 人間のレビューや承認で止める / escape: 納品後に見つかる）になる。
 * escapeWith の部品を付けていると、人間の承認もなくなるので escape になる（auto mode で危ない操作が通る）。
 * ゲームの効果は部品の補正（content/harness の各ファイル）で表れ、このカードはその見取り図
 */
export interface MistakeDef {
  readonly id: 'dangerousCommand' | 'oldSpec' | 'failingTest' | 'skippedSteps' | 'unfinishedDone';
  readonly stoppedBy: readonly MistakeStopper[];
  readonly fallback: 'human' | 'escape';
  readonly escapeWith?: readonly string[];
}

export const mistakes: readonly MistakeDef[] = [
  {
    id: 'dangerousCommand',
    stoppedBy: [{ part: 'hookGuard' }, { part: 'permSandbox' }],
    fallback: 'human',
    escapeWith: ['permAuto'],
  },
  { id: 'oldSpec', stoppedBy: [{ category: 'claudeMd' }, { category: 'rules' }], fallback: 'human' },
  {
    id: 'failingTest',
    stoppedBy: [{ part: 'hookUnitTest' }, { part: 'hookLinter' }, { category: 'eval' }],
    fallback: 'human',
  },
  { id: 'skippedSteps', stoppedBy: [{ category: 'skill' }], fallback: 'escape' },
  { id: 'unfinishedDone', stoppedBy: [{ part: 'hookStopCheck' }], fallback: 'escape' },
];

/**
 * おすすめ構成（ワンタップで入れる。文言は ja.harness.presets）。まだ解放されていない部品は入れない。
 * 権限モードを含めないものは「毎回確認」
 */
export interface HarnessPresetDef {
  readonly id: 'safe' | 'fast' | 'night';
  readonly parts: readonly string[];
}

export const harnessPresets: readonly HarnessPresetDef[] = [
  {
    id: 'safe',
    parts: [
      'mdOverview',
      'ruleCoding',
      'ruleDesign',
      'ruleTesting',
      'ruleRelease',
      'hookGuard',
      'hookFormatter',
      'hookUnitTest',
      'hookStopCheck',
      'evalUnitTest',
      'evalAcceptance',
    ],
  },
  {
    id: 'fast',
    parts: [
      'mdOverview',
      'ruleCoding',
      'ruleDesign',
      'skillFrontend',
      'skillReport',
      'mcpFilesystem',
      'mcpGit',
      'subCode',
      'subResearch',
      'worktree',
      'hookFormatter',
      'permAuto',
      'modStatusLine',
    ],
  },
  {
    id: 'night',
    parts: [
      'mdOverview',
      'ruleCoding',
      'ruleTesting',
      'skillPrReview',
      'hookGuard',
      'hookUnitTest',
      'hookStopCheck',
      'evalUnitTest',
      'evalSecurity',
      'permSandbox',
      'routineNightTest',
      'routineReport',
      'modSidePanel',
    ],
  },
];
