import { describe, expect, it } from 'vitest';
import { practiceTemplates } from '../../src/content/practice/index';
import type { PracticeJobInput } from '../../src/content/types';
import { exportClaudeConfig } from '../../src/core/harnessExport';

function templateJob(): PracticeJobInput {
  const job = practiceTemplates[0]?.job;
  if (!job) throw new Error('実務モードのテンプレートがない');
  return job;
}
const template = templateJob();

/** テンプレートの業務の、AI が関わる工程に部品を足す */
function withParts(parts: readonly string[]): PracticeJobInput {
  return {
    ...template,
    steps: template.steps.map((s, i) =>
      i === 1 ? { ...s, mode: 'aiThenHumanReview', parts: [...s.parts, ...parts] } : s,
    ),
  };
}

const file = (job: PracticeJobInput, path: string) =>
  exportClaudeConfig(job).files.find((f) => f.path === path)?.content;

/** Claude Code の hooks のイベント名（公式ドキュメントの一覧の一部。書き出すのはこの4つだけ） */
const EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop'];

describe('実務モードの書き出し（core/harnessExport.ts）', () => {
  it('settings.json は JSON として正しく、hooks はイベント名 → [{ matcher, hooks: [{ type: command, command }] }] の形', () => {
    const job = withParts([
      'hookGuard',
      'hookFormatter',
      'hookUnitTest',
      'hookStopCheck',
      'hookSessionStart',
      'requestLinter',
    ]);
    const settings = JSON.parse(file(job, '.claude/settings.json') ?? '');
    expect(Object.keys(settings.hooks).sort()).toEqual([...EVENTS].sort());
    for (const event of EVENTS) {
      for (const entry of settings.hooks[event]) {
        expect(entry.hooks.length).toBeGreaterThan(0);
        for (const h of entry.hooks) {
          expect(h.type).toBe('command');
          expect(typeof h.command).toBe('string');
        }
      }
    }
    expect(settings.hooks.PreToolUse).toEqual([
      { matcher: 'Bash', hooks: [expect.objectContaining({ type: 'command' })] },
    ]);
    // 編集後の整形とテストは同じ matcher にまとめる
    expect(settings.hooks.PostToolUse).toHaveLength(1);
    expect(settings.hooks.PostToolUse[0].matcher).toBe('Edit|Write');
    expect(settings.hooks.PostToolUse[0].hooks).toHaveLength(2);
    expect(settings.hooks.SessionStart[0].matcher).toBe('startup');
    expect(settings.hooks.Stop[0].matcher).toBeUndefined();
    // お願いは Hook にならず、CLAUDE.md の指示文になる
    expect(file(job, 'CLAUDE.md')).toContain('Lint を実行し');
    expect(file(job, '.claude/hooks/guard.sh')).toContain('exit 2');
  });

  it('permissions は allow/deny の配列と defaultMode。auto mode はユーザーの設定に分ける。sandbox とステータスライン', () => {
    const edits = JSON.parse(file(withParts(['permAcceptEdits', 'modStatusLine']), '.claude/settings.json') ?? '');
    expect(edits.permissions.defaultMode).toBe('acceptEdits');
    expect(Array.isArray(edits.permissions.deny)).toBe(true);
    expect(edits.statusLine).toEqual({ type: 'command', command: expect.any(String) });

    const auto = withParts(['permAuto']);
    expect(JSON.parse(file(auto, '.claude/settings.json') ?? '').permissions.defaultMode).toBeUndefined();
    expect(JSON.parse(file(auto, '~/.claude/settings.json') ?? '')).toEqual({ permissions: { defaultMode: 'auto' } });

    const sandbox = JSON.parse(file(withParts(['permSandbox']), '.claude/settings.json') ?? '');
    expect(sandbox.sandbox.enabled).toBe(true);
  });

  it('CLAUDE.md と Rules・Skill・Subagent（worktree）・.mcp.json をファイルごとに書き出す', () => {
    const job = withParts([
      'mdOverview',
      'ruleCoding',
      'skillReport',
      'subResearch',
      'worktree',
      'mcpGit',
      'mcpAnalytics',
      'evalAcceptance',
    ]);
    const { files, manual } = exportClaudeConfig(job);
    expect(files.map((f) => f.path)).toEqual([
      'CLAUDE.md',
      '.claude/rules/coding.md',
      '.claude/settings.json',
      '.claude/skills/report/SKILL.md',
      '.claude/agents/researcher.md',
      '.mcp.json',
    ]);
    expect(manual).toEqual([]);
    expect(file(job, 'CLAUDE.md')).toMatch(/^# 週次アクセス解析\n/);
    expect(file(job, 'CLAUDE.md')).toContain('## 案件の概要とコマンド');
    expect(file(job, 'CLAUDE.md')).toContain('## 完了の条件');
    expect(file(job, '.claude/rules/coding.md')).toMatch(/^---\npaths:\n {2}- "src\/\*\*\/\*\.\{ts,tsx\}"\n---\n/);
    expect(file(job, '.claude/skills/report/SKILL.md')).toMatch(/^---\nname: report\ndescription: .+\n---\n/);
    expect(file(job, '.claude/agents/researcher.md')).toContain('isolation: worktree');
    const mcp = JSON.parse(file(job, '.mcp.json') ?? '');
    expect(mcp.mcpServers.git).toEqual({ command: 'uvx', args: ['mcp-server-git'] });
    expect(mcp.mcpServers.analytics).toEqual({ type: 'http', url: '${ANALYTICS_MCP_URL}' });
  });

  it('外部URLを書かず、ファイルにならない部品（Routine・横のパネル）は manual に挙げる', () => {
    const { files, manual } = exportClaudeConfig(withParts(['routineReport', 'modSidePanel', 'mcpChat']));
    expect(files.every((f) => !/https?:\/\//.test(f.content))).toBe(true);
    expect(manual).toEqual(['routineReport', 'modSidePanel']);
  });
});
