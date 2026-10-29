import type { HookTiming } from '../types';

/*
 * プラグインの書き出し（core/pluginExport.ts）で、同梱の部品ごとに書くファイルの中身。どれも汎用の雛形で、
 * どのプロジェクトに入れても壊れないようにする（package.json に scripts がなければ何もしない・外部のコマンドに頼らない）。
 * 形式は Claude Code の公式ドキュメント（plugins・hooks・skills・sub-agents・mcp。2026-10-29 に確認）に合わせる。
 * 外部URLを書かない（MCP の接続先などは環境変数で受け取る）。
 */

/**
 * プラグインの中のスクリプトを呼ぶ command。${CLAUDE_PLUGIN_ROOT} はプラグインを置いた場所に置き換わる。
 * zip から展開すると実行の権限が付かないことがあるので、sh で呼ぶ
 */
const script = (name: string) => `sh "\${CLAUDE_PLUGIN_ROOT}/scripts/${name}.sh"`;

/** package.json の scripts に name があれば npm run する（なければ何もしない）。失敗したら exit 2 で Claude に返す */
const npmScript = (name: string, summary: string) =>
  [
    '#!/bin/sh',
    `# ${summary}`,
    `# package.json の scripts に「${name}」がなければ何もしない。失敗したら exit 2 で Claude に結果を返す`,
    `if [ -f package.json ] && grep -q '"${name}"[[:space:]]*:' package.json; then`,
    `  npm run --silent ${name} >&2 || exit 2`,
    'fi',
    'exit 0',
    '',
  ].join('\n');

/** Hook（hooks/hooks.json）。matcher は道具の名前（Edit|Write は名前の並び）。SessionStart は開始のしかた */
export interface HookExport {
  readonly event: HookTiming;
  readonly matcher?: string;
  readonly command: string;
  /** command から呼ぶスクリプト（プラグインの scripts/ に書き出す） */
  readonly script?: { readonly path: string; readonly content: string };
}

export const hookExports: Readonly<Record<string, HookExport>> = {
  hookFormatter: {
    event: 'PostToolUse',
    matcher: 'Edit|Write',
    command: script('format'),
    script: { path: 'scripts/format.sh', content: npmScript('format', '編集の後に整形する（PostToolUse）') },
  },
  hookLinter: {
    event: 'PostToolUse',
    matcher: 'Edit|Write',
    command: script('lint'),
    script: { path: 'scripts/lint.sh', content: npmScript('lint', '編集の後に Lint を動かす（PostToolUse）') },
  },
  hookUnitTest: {
    event: 'PostToolUse',
    matcher: 'Edit|Write',
    command: script('test'),
    script: { path: 'scripts/test.sh', content: npmScript('test', '編集の後にテストを動かす（PostToolUse）') },
  },
  hookGuard: {
    event: 'PreToolUse',
    matcher: 'Bash',
    command: script('guard'),
    script: {
      path: 'scripts/guard.sh',
      content: [
        '#!/bin/sh',
        '# 危ない操作を止める（PreToolUse）。exit 2 で道具の実行を止め、理由を Claude に返す',
        '# 入力は道具の呼び出しの JSON。jq に頼らず、文字列として調べる',
        'input=$(cat)',
        'case "$input" in',
        '  *"rm -rf /"*|*"rm -rf ~"*|*"DROP DATABASE"*|*"drop database"*|*"git push --force"*|*"git push -f"*)',
        '    echo "危ない操作なので止めた" >&2',
        '    exit 2 ;;',
        'esac',
        'exit 0',
        '',
      ].join('\n'),
    },
  },
  hookStopCheck: {
    event: 'Stop',
    command: script('stop-check'),
    script: {
      path: 'scripts/stop-check.sh',
      content: npmScript('test', '「完了」の前にテストを動かす（Stop）。落ちていれば作業を続けさせる'),
    },
  },
  hookSessionStart: {
    event: 'SessionStart',
    matcher: 'startup',
    command: script('session-start'),
    script: {
      path: 'scripts/session-start.sh',
      content: [
        '#!/bin/sh',
        '# 作業を始める前に依存を入れる（SessionStart）。package.json があって node_modules がなければ npm install',
        'if [ -f package.json ] && [ ! -d node_modules ]; then',
        '  npm install --silent >&2 || true',
        'fi',
        'exit 0',
        '',
      ].join('\n'),
    },
  },
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

/**
 * ルールのカード（プラグインには入らないので、templates/.claude/rules/<file>.md の雛形として書き出す）。
 * paths のファイルを触るときだけ読む。本文はそのまま使える汎用の決まりにする
 */
export interface RuleExport {
  readonly file: string;
  readonly paths: readonly string[];
  readonly body: readonly string[];
}

export const ruleExports: Readonly<Record<string, RuleExport>> = {
  overview: {
    file: 'overview',
    paths: [],
    body: [
      '- 作業の前に README と package.json を読み、目的とよく使うコマンドを確かめる',
      '- 分からないことは推測で埋めずに聞く',
    ],
  },
  coding: {
    file: 'coding',
    paths: ['src/**/*.{ts,tsx,js,jsx}'],
    body: [
      '- 既存のコードの書き方（命名・型・エラー処理）に合わせる',
      '- 使っていないコードや一時的なログを残さない',
      '- 1つの変更で1つのことだけをする',
    ],
  },
  design: {
    file: 'design',
    paths: ['src/**/*.css', 'design/**'],
    body: ['- 色・余白は既存の変数（デザイントークン）を使う', '- 狭い幅と広い幅の両方で崩れないことを確かめる'],
  },
  testing: {
    file: 'testing',
    paths: ['tests/**', '**/*.test.*'],
    body: [
      '- 1つのテストで1つのことを確かめる',
      '- 乱数と日時は固定する',
      '- 落ちたテストを消したり skip したりしない',
    ],
  },
  release: {
    file: 'release',
    paths: ['deploy/**', '.github/**'],
    body: ['- リリースの前にテストとビルドを通す', '- 本番の設定や秘密情報をコミットしない'],
  },
  learnings: {
    file: 'learnings',
    paths: ['docs/**'],
    body: ['- 失敗と対策を見つけたら、このファイルに1行で書き足す'],
  },
  oldSpec: { file: 'old-spec', paths: ['docs/old/**'], body: ['- 古い仕様。今の仕様と食い違うときは今の仕様に従う'] },
};

/** Skill（skills/<name>/SKILL.md。プラグインでは /<プラグイン名>:<name> で呼べ、Claude が description を見て自分でも使う） */
export const skillExports: Readonly<Record<string, { name: string; description: string; body: readonly string[] }>> = {
  skillFrontend: {
    name: 'frontend-change',
    description: '画面の変更を、決まった手順（確認 → 実装 → 見た目の確認）で進める。画面を変えるときに使う',
    body: [
      '1. 変える画面と完了の条件を確かめる（分からなければ聞く）',
      '2. 既存の部品とデザイントークンを使って実装する',
      '3. 狭い幅と広い幅で見た目を確かめ、キーボードでも操作できるか確かめる',
      '4. 変えた画面と確かめたことを短く報告する',
    ],
  },
  skillReport: {
    name: 'report',
    description: '調査や集計の結果を、決まった形のレポートにまとめる。レポートを頼まれたときに使う',
    body: ['1. 結論を3行で書く', '2. 根拠の数字を表にし、出どころを添える', '3. 次にすることを書く'],
  },
  skillPrReview: {
    name: 'code-review',
    description: '変更をレビューし、バグと危ない箇所を挙げる。レビューを頼まれたときに使う',
    body: [
      '1. `git diff` で変更の差分を読む',
      '2. 正しさ・安全性・テストの不足を挙げる',
      '3. 重い順に並べ、直し方を1行で添える',
    ],
  },
};

/** Subagent（agents/<name>.md）。tools で使える道具を絞り、本文に役割を書く */
export const agentExports: Readonly<
  Record<string, { name: string; description: string; tools: string; body: readonly string[] }>
> = {
  subResearch: {
    name: 'researcher',
    description: '調べ物をして要点を返す。調査が必要なときに使う',
    tools: 'Read, Grep, Glob, WebSearch',
    body: [
      'あなたは調査の担当です。調べた結果を、結論・根拠・出どころの順に短く返してください。',
      'ファイルは書き換えないでください。',
    ],
  },
  subCode: {
    name: 'implementer',
    description: '決まった変更を実装する。実装を分担するときに使う',
    tools: 'Read, Edit, Write, Bash',
    body: [
      'あなたは実装の担当です。頼まれた変更だけを実装し、テストを動かしてから、変えたファイルを報告してください。',
    ],
  },
  subQa: {
    name: 'qa',
    description: 'テストを書いて動かし、落ちた所を報告する。実装の後に使う',
    tools: 'Read, Edit, Write, Bash',
    body: [
      'あなたはテストの担当です。足りないテストを書いて動かし、落ちたテストごとに原因と直し方を報告してください。',
    ],
  },
  subReview: {
    name: 'reviewer',
    description: '変更をレビューする。書き換えはしない。レビューを頼まれたときに使う',
    tools: 'Read, Grep, Glob',
    body: [
      'あなたはレビューの担当です。バグ・危ない箇所・テストの不足を重い順に挙げてください。',
      'ファイルは書き換えないでください。',
    ],
  },
  subDocs: {
    name: 'docs-writer',
    description: 'ドキュメントを書く・直す。ドキュメントの更新が必要なときに使う',
    tools: 'Read, Edit, Write',
    body: ['あなたはドキュメントの担当です。コードと食い違わないように、短く具体的に書いてください。'],
  },
};

/** .mcp.json で環境変数を展開する書き方（${NAME}） */
const env = (name: string) => ['$', '{', name, '}'].join('');

/**
 * MCP（.mcp.json の mcpServers）。接続先は環境変数で受け取る。
 * ready はそのまま動くもの（npx だけで動き、設定の要らないもの）で、プラグインの .mcp.json に入れる。
 * それ以外（環境変数や uvx が要るもの）は templates/.mcp.json の雛形にする
 */
export const mcpExports: Readonly<
  Record<string, { name: string; ready: boolean; server: Readonly<Record<string, unknown>> }>
> = {
  mcpFilesystem: {
    name: 'filesystem',
    ready: true,
    server: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] },
  },
  mcpGit: { name: 'git', ready: false, server: { command: 'uvx', args: ['mcp-server-git'] } },
  mcpBrowser: { name: 'browser', ready: true, server: { command: 'npx', args: ['-y', '@playwright/mcp'] } },
  mcpDatabase: {
    name: 'database',
    ready: false,
    server: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', env('DATABASE_URL')] },
  },
  mcpAnalytics: { name: 'analytics', ready: false, server: { type: 'http', url: env('ANALYTICS_MCP_URL') } },
  mcpChat: { name: 'chat', ready: false, server: { type: 'http', url: env('CHAT_MCP_URL') } },
};

/** Eval（完了の前に確かめる Skill「done-check」の確かめる項目） */
export const evalExports: Readonly<Record<string, string>> = {
  evalUnitTest: 'Unit Test がすべて通る',
  evalAcceptance: '受け入れ基準をすべて満たす',
  evalA11y: 'アクセシビリティの確認（キーボード操作・コントラスト）を通る',
  evalSecurity: '秘密情報や危ない依存が入っていない',
  evalCodingRules: 'コーディング規約に沿っている',
  evalUiReq: 'UI の要件（文言・状態の表示）を満たす',
};

/** ゲームの Model を、Workflow の Skill の model（Claude Code のモデルの別名）に読み替える */
export const pluginModels: Readonly<Record<string, string>> = { lite: 'haiku', standard: 'sonnet', frontier: 'opus' };
