import type { Command } from '../../src/core/commands';

/**
 * 仕事に合わせた標準的な Harness：Skill・Hook・Eval と、仕事に必要な最小限の MCP・資料・権限モード。
 * 素の AI（Harness なし）は割に合わない（balance.harness.bare）ので、「上手に進める」Bot や、AI を使う前提の比較はこれを付ける
 */
export const FITTED: readonly string[] = [
  'skillFrontend',
  'skillReport',
  'skillPrReview',
  'hookFormatter',
  'hookUnitTest',
  'evalUnitTest',
  'evalAcceptance',
  'mcpFilesystem',
  'mcpGit',
  'mdOverview',
  'permAcceptEdits',
];

/** Skill だけの Harness。素の AI の弱さ（balance.harness.bare）の大半を消すが、少し残る */
export const SKILLS: readonly string[] = ['skillFrontend', 'skillReport', 'skillPrReview'];

/** チュートリアルの後に最初に解放される Skill と Hook だけの Harness（Eval・Tool・権限なし） */
export const EARLY: readonly string[] = [...SKILLS, 'hookFormatter', 'hookLinter', 'hookUnitTest'];

/** AI Worker に部品を付ける Command の列 */
export const equipCommands = (workerId: string, parts: readonly string[] = FITTED): Command[] =>
  parts.map((partId) => ({ type: 'EquipPart', workerId, partId }));
