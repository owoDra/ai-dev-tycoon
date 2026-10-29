import type { HarnessCategory, HookTiming, TaskKind } from './types';

/*
 * 持ち込み（core/bring.ts）のデータ。読み込んだ Claude Code の設定のカテゴリ・評価の観点・雛形の部品・キーワード。
 * 観点の文言は i18n の ja.bring.criteria、上限と変換の係数は balance.bring。
 */

/** 持ち込みカードのカテゴリ（Harness 部品のカテゴリのうち、Claude Code の設定ファイルから作れるもの） */
export type BringCategory = Extract<
  HarnessCategory,
  'skill' | 'subagent' | 'hook' | 'permission' | 'mcp' | 'claudeMd' | 'rules'
>;

/** カテゴリの並び（一覧と結果コードの順。結果コードには並びの番号で書くので、足すときは末尾に） */
export const bringCategories: readonly BringCategory[] = [
  'skill',
  'subagent',
  'hook',
  'permission',
  'mcp',
  'claudeMd',
  'rules',
];

/** 評価の観点の id（文言は ja.bring.criteria） */
export type BringCriterionId =
  | 'hasDescription'
  | 'whenToUse'
  | 'concreteSteps'
  | 'notTooLong'
  | 'toolsLimited'
  | 'roleClear'
  | 'runsCheck'
  | 'matcherNarrow'
  | 'failLoud'
  | 'hasDeny'
  | 'noDangerous'
  | 'hasAllow'
  | 'fewServers'
  | 'envRef'
  | 'pinned'
  | 'lengthOk'
  | 'hasCommands'
  | 'hasStructure'
  | 'scoped'
  | 'concise'
  | 'concrete';

/** カテゴリごとの観点と配点（合計 100） */
export const bringCriteria: Readonly<
  Record<BringCategory, readonly { readonly id: BringCriterionId; readonly weight: number }[]>
> = {
  skill: [
    { id: 'hasDescription', weight: 20 },
    { id: 'whenToUse', weight: 30 },
    { id: 'concreteSteps', weight: 30 },
    { id: 'notTooLong', weight: 20 },
  ],
  subagent: [
    { id: 'hasDescription', weight: 20 },
    { id: 'whenToUse', weight: 20 },
    { id: 'toolsLimited', weight: 35 },
    { id: 'roleClear', weight: 25 },
  ],
  hook: [
    { id: 'runsCheck', weight: 45 },
    { id: 'matcherNarrow', weight: 35 },
    { id: 'failLoud', weight: 20 },
  ],
  permission: [
    { id: 'hasDeny', weight: 40 },
    { id: 'noDangerous', weight: 40 },
    { id: 'hasAllow', weight: 20 },
  ],
  mcp: [
    { id: 'fewServers', weight: 50 },
    { id: 'envRef', weight: 25 },
    { id: 'pinned', weight: 25 },
  ],
  claudeMd: [
    { id: 'lengthOk', weight: 40 },
    { id: 'hasCommands', weight: 30 },
    { id: 'hasStructure', weight: 30 },
  ],
  rules: [
    { id: 'scoped', weight: 40 },
    { id: 'concise', weight: 30 },
    { id: 'concrete', weight: 30 },
  ],
};

/**
 * カテゴリごとの雛形の部品（同梱の部品の id）。持ち込みカードの補正は雛形の補正を点で薄めたもの。
 * どのカテゴリも、そのカテゴリで最も強い同梱の部品を選ぶ（持ち込みが同梱を大きく超えない上限になる）。
 * hook は中身（command）のキーワードで雛形を選び、どれにも当たらなければタイミングで選ぶ。
 * permission は危ない許可がなければ sandbox、あれば auto（速いが事故が増える）
 */
export const bringTemplates = {
  skill: 'skillFrontend',
  subagent: 'subCode',
  mcp: 'mcpFilesystem',
  claudeMd: 'mdRelease',
  rules: 'ruleRelease',
  permission: { safe: 'permSandbox', risky: 'permAuto' },
  hook: {
    byWord: [
      { words: ['test', 'vitest', 'jest', 'pytest', 'check'], part: 'hookUnitTest' },
      { words: ['lint', 'eslint', 'biome', 'ruff', 'tsc', 'typecheck'], part: 'hookLinter' },
      { words: ['prettier', 'format', 'fmt'], part: 'hookFormatter' },
    ],
    byTiming: {
      SessionStart: 'hookSessionStart',
      PreToolUse: 'hookGuard',
      PostToolUse: 'hookFormatter',
      Stop: 'hookStopCheck',
    } satisfies Record<HookTiming, string>,
  },
} as const;

/**
 * Claude Code の hooks のイベントを、ゲームの盾（4つのタイミング）に読み替える。ここにないイベントの Hook はカードにしない
 * （Notification など、作業の流れに効かないもの）
 */
export const bringHookEvents: Readonly<Record<string, HookTiming>> = {
  SessionStart: 'SessionStart',
  Setup: 'SessionStart',
  UserPromptSubmit: 'SessionStart',
  PreToolUse: 'PreToolUse',
  PermissionRequest: 'PreToolUse',
  PostToolUse: 'PostToolUse',
  PostToolUseFailure: 'PostToolUse',
  PostToolBatch: 'PostToolUse',
  Stop: 'Stop',
  SubagentStop: 'Stop',
  TaskCompleted: 'Stop',
};

/** 中身のキーワードから、効く仕事の種類を推し量る（小文字にして部分一致）。どれにも当たらなければ雛形の種類 */
export const bringKindWords: Readonly<Record<TaskKind, readonly string[]>> = {
  planning: ['plan', 'spec', 'requirement', '要件', '企画', '計画', '仕様'],
  research: ['research', 'investigat', 'search', '調査', '調べ'],
  design: ['design', 'css', 'figma', 'style', 'デザイン', '画面'],
  content: ['doc', 'readme', 'writ', 'blog', '文書', '記事', 'ドキュメント'],
  code: ['code', 'implement', 'refactor', '.ts', '.py', 'src/', '実装', 'コード'],
  test: ['test', 'spec.', 'vitest', 'jest', 'pytest', 'テスト'],
  release: ['release', 'deploy', '.github/workflows', 'publish', 'リリース', 'デプロイ'],
};

/** 「いつ使うか」が書いてある説明の言い回し */
export const bringWhenWords: readonly string[] = [
  'use when',
  'when ',
  'use this',
  'use for',
  'ときに',
  '時に',
  '場合',
  '使う',
];

/** テストや lint などの確認を動かす Hook の言い回し */
export const bringCheckWords: readonly string[] = [
  'test',
  'lint',
  'tsc',
  'typecheck',
  'check',
  'prettier',
  'format',
  'biome',
  'eslint',
  'ruff',
  'pytest',
];

/** 失敗を Claude に返す書き方（exit 2・標準エラー出力） */
export const bringFailWords: readonly string[] = ['exit 2', '>&2', '|| exit', 'decision'];

/** よく使うコマンドの書き方（CLAUDE.md に「よく使うコマンド」があるか） */
export const bringCommandWords: readonly string[] = [
  '```',
  'npm ',
  'pnpm ',
  'yarn ',
  'make ',
  'cargo ',
  'go ',
  'uv ',
  'pip ',
];

/** 危ない許可。permissions.allow にこれがあるか、既定のモードが確認なし（bypassPermissions）なら危ない */
export const bringDangerousAllows: readonly string[] = [
  'Bash',
  'Bash(*)',
  '*',
  'Bash(rm:*)',
  'Bash(sudo:*)',
  'Bash(curl:*)',
];

/**
 * 秘密の文字列（トークン・鍵）の形。読み込んだファイルの中にあれば、そのファイルは保存せずに警告する。
 * 誤検出は「保存しない」側に倒す（持ち込みに使えないだけで、何も外へ出さない）
 */
export const bringSecretPatterns: readonly { readonly kind: string; readonly pattern: RegExp }[] = [
  { kind: 'anthropic', pattern: /sk-ant-[A-Za-z0-9_-]{10,}/ },
  { kind: 'openai', pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}/ },
  { kind: 'github', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/ },
  { kind: 'aws', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: 'slack', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { kind: 'google', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: 'privateKey', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    kind: 'assignment',
    pattern: /\b(?:api[_-]?key|secret|token|password|passwd)\b["']?\s*[:=]\s*["']?(?!\$\{)[A-Za-z0-9_\-+/=]{16,}/i,
  },
];

/** 読まずに「秘密が入っていそう」と知らせるファイル名（.env など） */
export const bringSecretFiles: readonly RegExp[] = [
  /(^|\/)\.env(\.[^/]*)?$/,
  /\.(pem|key|p12)$/,
  /(^|\/)credentials(\.json)?$/,
];

/** 読まないフォルダ */
export const bringIgnoredDirs: readonly string[] = ['node_modules', '.git'];
