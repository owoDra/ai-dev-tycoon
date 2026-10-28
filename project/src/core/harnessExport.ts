import {
  agentExports,
  evalExports,
  hookExports,
  mcpExports,
  requestExports,
  ruleExports,
  skillExports,
  statusLineCommand,
} from '../content/harness/export';
import { getHarnessPart } from '../content/index';
import type { HarnessPartDef, HookTiming, PracticeJobInput } from '../content/types';
import { usesAi } from './practice';

/** 書き出すファイル1つ。path はプロジェクトのルートからの相対パス（user はユーザーの設定 ~/.claude/） */
export interface ExportFile {
  readonly path: string;
  readonly content: string;
}

/** 書き出しの結果。files はコピーするファイル、manual はファイルにならない部品（claude.ai などで設定するもの）の id */
export interface ClaudeExport {
  readonly files: readonly ExportFile[];
  readonly manual: readonly string[];
}

/** settings.json の hooks の、イベントごとの並び（Claude Code の hooks の形） */
type HooksJson = Partial<Record<HookTiming, { matcher?: string; hooks: { type: 'command'; command: string }[] }[]>>;

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

/** ルールのカードの key（部品の group は memory:<key>） */
const cardKey = (p: HarnessPartDef) => (p.group ?? '').replace(/^memory:/, '');

/**
 * 実務モードで組んだ Harness から、Claude Code の設定一式（.claude/）を作る（純粋関数。外部には送らない）。
 * AI が関わる工程に付けた部品をまとめ、部品ごとの中身（content/harness/export.ts）をファイルに振り分ける。
 * - CLAUDE.md：業務の概要と工程・CLAUDE.md に置いたルール・お願い・完了の条件（Eval）
 * - .claude/rules/*.md：Rules に分けたルール（paths のファイルを触るときだけ読む）
 * - .claude/settings.json：権限モード・Hook・sandbox・ステータスライン
 * - .claude/skills・.claude/agents（worktree があれば isolation: worktree）・.mcp.json
 * auto mode はプロジェクトの settings.json では効かないので、ユーザーの設定（~/.claude/settings.json）に分けて書く
 */
export function exportClaudeConfig(job: PracticeJobInput): ClaudeExport {
  const ids = [...new Set(job.steps.filter(usesAi).flatMap((s) => s.parts))];
  const parts = ids.map(getHarnessPart);
  const has = (id: string) => ids.includes(id);
  const of = (category: HarnessPartDef['category']) => parts.filter((p) => p.category === category);
  const files: ExportFile[] = [];
  const manual: string[] = [];

  // CLAUDE.md
  const md: string[] = [`# ${job.name}`, '', '## 工程', ...job.steps.map((s, i) => `${i + 1}. ${s.name}`), ''];
  for (const p of of('claudeMd')) {
    const rule = ruleExports[cardKey(p)];
    if (rule) md.push(`## ${p.name}`, ...rule.body, '');
  }
  const requests = parts.filter((p) => p.enforcement === 'request').flatMap((p) => requestExports[p.id] ?? []);
  if (requests.length > 0) md.push('## お願い', ...requests.map((r) => `- ${r}`), '');
  const evals = of('eval').flatMap((p) => evalExports[p.id] ?? []);
  if (evals.length > 0) md.push('## 完了の条件', ...evals.map((e) => `- ${e}`), '');
  files.push({ path: 'CLAUDE.md', content: `${md.join('\n').trimEnd()}\n` });

  // .claude/rules
  for (const p of of('rules')) {
    const rule = ruleExports[cardKey(p)];
    if (!rule) continue;
    const front = rule.paths.length > 0 ? ['---', 'paths:', ...rule.paths.map((g) => `  - "${g}"`), '---', ''] : [];
    files.push({
      path: `.claude/rules/${rule.file}.md`,
      content: [...front, `# ${p.name}`, ...rule.body, ''].join('\n'),
    });
  }

  // .claude/settings.json
  const settings: Record<string, unknown> = {};
  const permissions: Record<string, unknown> = { deny: ['Read(./.env)', 'Read(./.env.*)'] };
  if (has('permAcceptEdits')) permissions.defaultMode = 'acceptEdits';
  settings.permissions = permissions;
  const hooks: HooksJson = {};
  for (const p of of('hook')) {
    const h = hookExports[p.id];
    if (!h || p.enforcement !== 'system') continue;
    const list = hooks[h.event] ?? [];
    const entry = list.find((e) => e.matcher === h.matcher);
    const hook = { type: 'command' as const, command: h.command };
    if (entry) entry.hooks.push(hook);
    else list.push({ ...(h.matcher !== undefined ? { matcher: h.matcher } : {}), hooks: [hook] });
    hooks[h.event] = list;
    if (h.script) files.push({ path: h.script.path, content: h.script.content });
  }
  if (Object.keys(hooks).length > 0) settings.hooks = hooks;
  if (has('permSandbox')) settings.sandbox = { enabled: true, autoAllowBashIfSandboxed: true };
  if (has('modStatusLine')) settings.statusLine = { type: 'command', command: statusLineCommand };
  files.push({ path: '.claude/settings.json', content: json(settings) });
  if (has('permAuto')) {
    files.push({ path: '~/.claude/settings.json', content: json({ permissions: { defaultMode: 'auto' } }) });
  }

  // .claude/skills
  for (const p of of('skill')) {
    const s = skillExports[p.id];
    if (!s) continue;
    const content = ['---', `name: ${s.name}`, `description: ${s.description}`, '---', '', ...s.body, ''].join('\n');
    files.push({ path: `.claude/skills/${s.name}/SKILL.md`, content });
  }

  // .claude/agents
  for (const p of of('subagent')) {
    const a = agentExports[p.id];
    if (!a) continue;
    const front = ['---', `name: ${a.name}`, `description: ${a.description}`, `tools: ${a.tools}`];
    if (has('worktree')) front.push('isolation: worktree');
    files.push({ path: `.claude/agents/${a.name}.md`, content: [...front, '---', '', a.description, ''].join('\n') });
  }

  // .mcp.json
  const servers = of('mcp').flatMap((p) => (mcpExports[p.id] ? [mcpExports[p.id]] : []));
  if (servers.length > 0) {
    files.push({
      path: '.mcp.json',
      content: json({ mcpServers: Object.fromEntries(servers.map((s) => [s?.name, s?.server])) }),
    });
  }

  for (const p of parts) {
    if (p.category === 'routine' || (p.category === 'mod' && p.id !== 'modStatusLine')) manual.push(p.id);
  }
  return { files, manual };
}
