import type { HookTiming } from '../types';

/*
 * 実務モードの書き出し（core/harnessExport.ts）で、部品ごとに書くファイルの中身。
 * 形式は Claude Code の公式ドキュメント（settings・hooks・memory・skills・sub-agents・mcp。2026-10-28 に確認）に合わせる。
 * 外部URLを書かない（MCP の接続先などは環境変数で受け取る）。
 */

/** Hook（settings.json の hooks）。matcher は道具の名前（Edit|Write は名前の並び）。SessionStart は開始のしかた */
export interface HookExport {
  readonly event: HookTiming;
  readonly matcher?: string;
  readonly command: string;
  /** command から呼ぶスクリプト（.claude/hooks/ に書き出す） */
  readonly script?: { readonly path: string; readonly content: string };
}

export const hookExports: Readonly<Record<string, HookExport>> = {
  hookFormatter: {
    event: 'PostToolUse',
    matcher: 'Edit|Write',
    command: "jq -r '.tool_input.file_path' | xargs npx prettier --write",
  },
  hookLinter: { event: 'PostToolUse', matcher: 'Edit|Write', command: 'npm run lint >&2 || exit 2' },
  hookUnitTest: { event: 'PostToolUse', matcher: 'Edit|Write', command: 'npm test >&2 || exit 2' },
  hookGuard: {
    event: 'PreToolUse',
    matcher: 'Bash',
    command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/guard.sh',
    script: {
      path: '.claude/hooks/guard.sh',
      content: [
        '#!/bin/sh',
        '# 危ない操作を止める（PreToolUse）。exit 2 で道具の実行を止め、理由を Claude に返す',
        "cmd=$(jq -r '.tool_input.command')",
        'case "$cmd" in',
        '  *"rm -rf /"*|*"DROP DATABASE"*|*"drop database"*|*"git push --force"*)',
        '    echo "危ない操作なので止めた: $cmd" >&2',
        '    exit 2 ;;',
        'esac',
        'exit 0',
        '',
      ].join('\n'),
    },
  },
  hookStopCheck: { event: 'Stop', command: 'npm test >&2 || exit 2' },
  hookSessionStart: { event: 'SessionStart', matcher: 'startup', command: 'npm install --silent' },
};

/** お願い（CLAUDE.md に書く指示文） */
export const requestExports: Readonly<Record<string, string>> = {
  requestFormatter: '編集したファイルはフォーマッタで整形すること',
  requestLinter: '編集したら Lint を実行し、指摘を直すこと',
  requestUnitTest: '編集したらテストを実行し、落ちたら直すこと',
  requestGuard: '本番のデータを消す・強制 push するなどの危ない操作はしないこと',
  requestStopCheck: '「完了」と言う前に、やり残しがないか確かめること',
  requestSessionStart: '作業を始める前に依存を入れ、最新の状態にすること',
};

/** ルールのカード。CLAUDE.md の節、または .claude/rules/<file>.md（paths を触るときだけ読む） */
export interface RuleExport {
  readonly file: string;
  readonly paths: readonly string[];
  readonly body: readonly string[];
}

export const ruleExports: Readonly<Record<string, RuleExport>> = {
  overview: { file: 'overview', paths: [], body: ['- 案件の目的と、よく使うコマンド（npm run dev / npm test）を書く'] },
  coding: { file: 'coding', paths: ['src/**/*.{ts,tsx}'], body: ['- 命名・型・エラー処理のチームの規約を書く'] },
  design: { file: 'design', paths: ['src/**/*.css', 'design/**'], body: ['- 色・余白・言葉づかいのトーンを書く'] },
  testing: { file: 'testing', paths: ['tests/**'], body: ['- テストの置き場所と書き方を書く'] },
  release: { file: 'release', paths: ['deploy/**', '.github/**'], body: ['- リリースの手順と確認項目を書く'] },
  learnings: { file: 'learnings', paths: ['docs/**'], body: ['- 過去の案件で分かったこと（失敗と対策）を書く'] },
  oldSpec: { file: 'old-spec', paths: ['docs/old/**'], body: ['- 去年の仕様（古い。今の仕様と食い違う）'] },
};

/** Skill（.claude/skills/<name>/SKILL.md。/<name> でも呼べる） */
export const skillExports: Readonly<Record<string, { name: string; description: string; body: readonly string[] }>> = {
  skillFrontend: {
    name: 'frontend-change',
    description: '画面の変更を、決まった手順（確認 → 実装 → 見た目の確認）で進める。画面を変えるときに使う',
    body: ['1. 変える画面と完了の条件を確かめる', '2. 実装する', '3. 狭い幅と広い幅で見た目を確かめる'],
  },
  skillReport: {
    name: 'report',
    description: '調査や集計の結果を、決まった形のレポートにまとめる。レポートを頼まれたときに使う',
    body: ['1. 結論を3行で書く', '2. 根拠の数字を表にする', '3. 次にすることを書く'],
  },
  skillPrReview: {
    name: 'code-review',
    description: '変更をレビューし、バグと危ない箇所を挙げる。レビューを頼まれたときに使う',
    body: ['1. 変更の差分を読む', '2. 正しさ・安全性・テストの不足を挙げる', '3. 重い順に並べる'],
  },
};

/** Subagent（.claude/agents/<name>.md） */
export const agentExports: Readonly<Record<string, { name: string; description: string; tools: string }>> = {
  subResearch: {
    name: 'researcher',
    description: '調べ物をして要点を返す。調査が必要なときに使う',
    tools: 'Read, Grep, Glob, WebSearch',
  },
  subCode: {
    name: 'implementer',
    description: '決まった変更を実装する。実装を分担するときに使う',
    tools: 'Read, Edit, Write, Bash',
  },
  subQa: { name: 'qa', description: 'テストを書いて動かし、落ちた所を報告する', tools: 'Read, Edit, Write, Bash' },
  subReview: { name: 'reviewer', description: '変更をレビューする。書き換えはしない', tools: 'Read, Grep, Glob' },
  subDocs: { name: 'docs-writer', description: 'ドキュメントを書く・直す', tools: 'Read, Edit, Write' },
};

/** .mcp.json で環境変数を展開する書き方（${NAME}） */
const env = (name: string) => ['$', '{', name, '}'].join('');

/** MCP（.mcp.json の mcpServers）。接続先は環境変数で受け取る */
export const mcpExports: Readonly<Record<string, { name: string; server: Readonly<Record<string, unknown>> }>> = {
  mcpFilesystem: {
    name: 'filesystem',
    server: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] },
  },
  mcpGit: { name: 'git', server: { command: 'uvx', args: ['mcp-server-git'] } },
  mcpBrowser: { name: 'browser', server: { command: 'npx', args: ['-y', '@playwright/mcp'] } },
  mcpDatabase: {
    name: 'database',
    server: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', env('DATABASE_URL')] },
  },
  mcpAnalytics: { name: 'analytics', server: { type: 'http', url: env('ANALYTICS_MCP_URL') } },
  mcpChat: { name: 'chat', server: { type: 'http', url: env('CHAT_MCP_URL') } },
};

/** Eval（CLAUDE.md の「完了の条件」） */
export const evalExports: Readonly<Record<string, string>> = {
  evalUnitTest: 'Unit Test がすべて通る',
  evalAcceptance: '受け入れ基準をすべて満たす',
  evalA11y: 'アクセシビリティの確認（キーボード操作・コントラスト）を通る',
  evalSecurity: '秘密情報や危ない依存が入っていない',
  evalCodingRules: 'コーディング規約に沿っている',
  evalUiReq: 'UI の要件（文言・状態の表示）を満たす',
};

/** ステータスライン（settings.json の statusLine） */
export const statusLineCommand = '"$CLAUDE_PROJECT_DIR"/.claude/statusline.sh';
