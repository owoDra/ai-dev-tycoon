import { getAssignMode } from '../content/assignModes';
import { balance } from '../content/balance';
import { companyTiers } from '../content/companyTiers';
import {
  agentExports,
  evalExports,
  hookExports,
  mcpExports,
  pluginModels,
  ruleExports,
  skillExports,
} from '../content/harness/export';
import { content, findHarnessPart, getModel } from '../content/index';
import type { CompanyTierId, FeatureId, HarnessPartDef, LibraryWorkflowDef } from '../content/types';
import { ja } from '../i18n/ja';
import type { BringCard } from './bring';
import { workflowStats } from './library';
import type { GameState } from './state';

/*
 * プラグインの書き出し（Phase 43）。ゲームで組んで育てたハーネスを、本物の Claude Code に入れられるプラグインにする（純粋関数）。
 * 元にするのは、会社で解放した部品（同梱の汎用の雛形。content/harness/export.ts）・Workflow Library の Workflow・持ち込みカード（Phase 42）。
 * 持ち込みカードは読み込んだ元の中身をそのまま戻し、ゲームの評価で書き換えない。
 *
 * プラグインの形（Claude Code の公式ドキュメント plugins・plugins reference・hooks・skills・sub-agents・mcp。2026-10-29 に確認）：
 * - .claude-plugin/plugin.json：マニフェスト。必須は name だけ（kebab-case。claude- などで始まる名前は予約）。version・description・author など
 * - skills/<name>/SKILL.md：frontmatter の description（いつ使うか）。プラグインでは /<プラグイン名>:<name> で呼べる
 * - agents/<name>.md：frontmatter の name と description が必須。tools・model など
 * - hooks/hooks.json：{ "hooks": { イベント: [{ matcher, hooks: [{ type: "command", command }] }] } }。${CLAUDE_PLUGIN_ROOT} が使える
 * - .mcp.json：{ "mcpServers": { 名前: 設定 } }
 * - CLAUDE.md・Rules・権限（settings.json の permissions）はプラグインからは読み込まれないので、templates/ に雛形として置き、
 *   README で自分のプロジェクトへコピーする手順を書く
 * ローカルのフォルダから入れるために、zip はマーケットプレイス（.claude-plugin/marketplace.json）で包む（pluginArchive）。
 */

/** プラグインの名前（plugin.json の name）と、包むマーケットプレイスの名前 */
export const PLUGIN_NAME = 'tycoon-harness';
export const MARKETPLACE_NAME = 'tycoon-market';
/** プラグインの雛形のフォルダ（プラグインとしては読み込まれない。README の手順で手で入れる） */
const TEMPLATES = 'templates';

/** 書き出すファイル1つ（path はプラグインのルートからの相対パス） */
export interface PluginFile {
  readonly path: string;
  readonly content: string;
}

export type PluginComponentKind = 'skill' | 'agent' | 'hook' | 'mcp' | 'workflow' | 'template';
export type PluginOrigin = 'bundled' | 'brought' | 'workflow';

/** プラグインに入れた部品1つ（画面と README の一覧に使う） */
export interface PluginComponent {
  readonly kind: PluginComponentKind;
  readonly name: string;
  readonly origin: PluginOrigin;
}

/** 次に増えるもの。feature: 機能を解放すると同梱の部品が増える / tier: 会社が大きくなると Workflow を多く入れられる / workflow: Workflow を保存すると増える */
export type PluginGrowth =
  | { readonly type: 'feature'; readonly feature: FeatureId; readonly parts: readonly string[] }
  | { readonly type: 'tier'; readonly tier: CompanyTierId; readonly workflows: number }
  | { readonly type: 'workflow'; readonly room: number };

export interface PluginExport {
  readonly files: readonly PluginFile[];
  readonly components: readonly PluginComponent[];
  /** ハーネスのレベル（入っている部品の種類の数） */
  readonly level: number;
  readonly next: PluginGrowth | null;
}

export interface PluginSource {
  /** 会社の state（案件ボードのある会社）。会社がなければ null（持ち込みカードだけを書き出す） */
  readonly state: GameState | null;
  readonly cards: readonly BringCard[];
}

/** Harness の束の解放の順（先に解放されるものから。次に増える部品を探す順） */
const FEATURE_ORDER: readonly FeatureId[] = ['harness', 'harness:eval', 'harness:tool'];

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z\d]+/g, '-')
    .replace(/^-+|-+$/g, '');

type HooksJson = Record<string, unknown[]>;

/** 書き出せる同梱の部品（雛形の中身があるもの）のうち、feature で解放されるもの */
const exportable = (p: HarnessPartDef) =>
  (p.category === 'skill' && p.id in skillExports) ||
  (p.category === 'subagent' && p.id in agentExports) ||
  (p.category === 'hook' && p.enforcement === 'system' && p.id in hookExports) ||
  (p.category === 'mcp' && p.id in mcpExports) ||
  (p.category === 'eval' && p.id in evalExports) ||
  (p.category === 'claudeMd' && (p.group ?? '').replace(/^memory:/, '') in ruleExports);

/** 会社が入れられる Workflow の数 */
export const workflowLimit = (tier: CompanyTierId) => balance.pluginExport.workflowsByTier[tier];

/** プラグインの中身を作る */
export function exportPlugin(src: PluginSource): PluginExport {
  const { state, cards } = src;
  const unlocked = (f: FeatureId) => state?.unlocked.includes(f) === true;
  const bundled = content.harnessParts.filter((p) => exportable(p) && unlocked(p.unlock));
  const files = new Map<string, string>();
  const components: PluginComponent[] = [];
  const put = (path: string, text: string) => {
    if (!files.has(path)) files.set(path, text);
  };
  const add = (kind: PluginComponentKind, name: string, origin: PluginOrigin) =>
    components.push({ kind, name, origin });

  // 持ち込みカード（元の中身をそのまま）。同梱の雛形と同じ場所なら持ち込みを優先する
  const hooks: HooksJson = {};
  const servers: Record<string, unknown> = {};
  const templateServers: Record<string, unknown> = {};
  let permissions: unknown = null;
  const used = new Set<string>();
  const unique = (base: string) => {
    let name = base;
    for (let n = 1; used.has(name); n++) name = `${base}-${n + 1}`;
    used.add(name);
    return name;
  };
  for (const card of cards) {
    const o = card.origin;
    if (o.kind === 'hook') {
      hooks[o.event] = [...(hooks[o.event] ?? []), o.entry];
      add('hook', card.name, 'brought');
    } else if (o.kind === 'mcp') {
      for (const [name, server] of Object.entries(o.servers)) servers[name] = server;
      add('mcp', card.name, 'brought');
    } else if (o.kind === 'permissions') {
      permissions = o.value;
      add('template', card.name, 'brought');
    } else if (card.category === 'skill') {
      const dir = unique(slug(o.path.split('/').slice(0, -1).at(-1) ?? '') || 'skill');
      put(`skills/${dir}/SKILL.md`, o.text);
      add('skill', card.name, 'brought');
    } else if (card.category === 'subagent') {
      const base = unique(`agent:${slug((o.path.split('/').at(-1) ?? '').replace(/\.md$/, '')) || 'agent'}`);
      put(`agents/${base.slice('agent:'.length)}.md`, o.text);
      add('agent', card.name, 'brought');
    } else {
      // CLAUDE.md・Rules は読み込んだ場所のまま templates/ の下へ
      put(`${TEMPLATES}/${o.path}`, o.text);
      add('template', card.name, 'brought');
    }
  }

  // 同梱の部品（汎用の雛形）
  for (const p of bundled) {
    if (p.category === 'skill') {
      const s = skillExports[p.id];
      if (!s || used.has(s.name)) continue;
      used.add(s.name);
      put(`skills/${s.name}/SKILL.md`, skillMd(s.name, s.description, [...s.body]));
      add('skill', p.name, 'bundled');
    } else if (p.category === 'subagent') {
      const a = agentExports[p.id];
      if (!a || used.has(`agent:${a.name}`)) continue;
      used.add(`agent:${a.name}`);
      const front = ['---', `name: ${a.name}`, `description: ${a.description}`, `tools: ${a.tools}`, '---'];
      put(`agents/${a.name}.md`, [...front, '', ...a.body, ''].join('\n'));
      add('agent', p.name, 'bundled');
    } else if (p.category === 'hook') {
      const h = hookExports[p.id];
      if (!h) continue;
      const entry = {
        ...(h.matcher !== undefined ? { matcher: h.matcher } : {}),
        hooks: [{ type: 'command', command: h.command }],
      };
      hooks[h.event] = [...(hooks[h.event] ?? []), entry];
      if (h.script) put(h.script.path, h.script.content);
      add('hook', p.name, 'bundled');
    } else if (p.category === 'mcp') {
      const m = mcpExports[p.id];
      if (!m) continue;
      const target = m.ready ? servers : templateServers;
      if (!(m.name in servers)) target[m.name] = m.server;
      add(m.ready ? 'mcp' : 'template', p.name, 'bundled');
    } else if (p.category === 'claudeMd') {
      const rule = ruleExports[(p.group ?? '').replace(/^memory:/, '')];
      if (!rule || rule.file === 'old-spec') continue;
      const front = rule.paths.length > 0 ? ['---', 'paths:', ...rule.paths.map((g) => `  - "${g}"`), '---', ''] : [];
      put(`${TEMPLATES}/.claude/rules/${rule.file}.md`, [...front, `# ${p.name}`, '', ...rule.body, ''].join('\n'));
      add('template', p.name, 'bundled');
    }
  }
  const evals = bundled.filter((p) => p.category === 'eval').flatMap((p) => evalExports[p.id] ?? []);
  if (evals.length > 0 && !used.has('done-check')) {
    const d = ja.pluginExport.doneCheck;
    put(
      'skills/done-check/SKILL.md',
      skillMd('done-check', d.description, [d.intro, '', ...evals.map((e) => `- ${e}`)]),
    );
    add('skill', 'done-check', 'bundled');
  }

  // Workflow Library の Workflow（会社の規模で入れられる数が決まる）
  const workflows = state ? state.library.slice(0, workflowLimit(state.tier)) : [];
  for (const w of workflows) {
    const name = unique(`workflow-${slug(w.id) || 'w'}`);
    put(`skills/${name}/SKILL.md`, workflowSkill(state as GameState, w, name));
    add('workflow', w.name, 'workflow');
  }

  if (Object.keys(hooks).length > 0) put('hooks/hooks.json', json({ hooks }));
  if (Object.keys(servers).length > 0) put('.mcp.json', json({ mcpServers: servers }));
  if (Object.keys(templateServers).length > 0) put(`${TEMPLATES}/.mcp.json`, json({ mcpServers: templateServers }));
  if (state || permissions !== null) {
    const fallback = { deny: ['Read(./.env)', 'Read(./.env.*)'] };
    put(`${TEMPLATES}/.claude/settings.json`, json({ permissions: permissions ?? fallback }));
  }

  const level = new Set(components.map((c) => c.kind)).size;
  const next = growthOf(state, content.harnessParts.filter(exportable));
  const manifest = {
    name: PLUGIN_NAME,
    version: `0.${level}.${components.length}`,
    description: ja.pluginExport.plugin.description,
    author: { name: ja.pluginExport.plugin.author },
    keywords: ['harness', 'skills', 'hooks', 'subagents'],
  };
  const readme = readmeOf(state, components, level, workflows);
  const all: PluginFile[] = [
    { path: '.claude-plugin/plugin.json', content: json(manifest) },
    { path: 'README.md', content: readme },
    ...[...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([path, c]) => ({ path, content: c })),
  ];
  return { files: all, components, level, next };
}

function skillMd(name: string, description: string, body: readonly string[], extra: readonly string[] = []): string {
  return ['---', `name: ${name}`, `description: ${description}`, ...extra, '---', '', ...body, ''].join('\n');
}

/** Workflow を Skill にする。進め方（担当モードの工程）・使う部品・ゲーム内の成績を書く */
function workflowSkill(state: GameState, w: LibraryWorkflowDef, name: string): string {
  const x = ja.pluginExport.workflow;
  const mode = getAssignMode(w.mode);
  const parts = w.parts.flatMap((id) => findHarnessPart(id) ?? []);
  const partLine = (p: HarnessPartDef) => {
    if (p.category === 'skill' && skillExports[p.id]) return x.skill(`/${PLUGIN_NAME}:${skillExports[p.id]?.name}`);
    if (p.category === 'subagent' && agentExports[p.id]) return x.agent(agentExports[p.id]?.name ?? p.name);
    if (p.category === 'hook') return x.hook(p.name);
    return x.other(p.name);
  };
  const stats = workflowStats(state, w.id);
  const model = pluginModels[w.modelId];
  const body = [
    `# ${w.name}`,
    '',
    x.intro,
    '',
    `## ${x.steps}`,
    '',
    ...ja.pluginExport.modeSteps[w.mode].map((step, i) => `${i + 1}. ${step}`),
    '',
    `## ${x.parts}`,
    '',
    `- ${x.model(getModel(w.modelId).name)}`,
    ...parts.map((p) => `- ${partLine(p)}`),
    '',
    `## ${x.stats}`,
    '',
    ...statLines(stats),
  ];
  return skillMd(name, x.description(w.name, mode.name), body, model ? [`model: ${model}`] : []);
}

function statLines(stats: ReturnType<typeof workflowStats>): string[] {
  const x = ja.pluginExport.workflow;
  return [
    `- ${x.uses(stats.uses)}`,
    `- ${x.saved(stats.savedHumanMinutes)}`,
    `- ${x.profit(Math.round(stats.profit))}`,
  ];
}

/** 次に増えるもの：まだ解放していない束の部品 → 会社の規模で増える Workflow の枠 → Workflow の保存 */
function growthOf(state: GameState | null, all: readonly HarnessPartDef[]): PluginGrowth | null {
  if (!state) return null;
  for (const feature of FEATURE_ORDER) {
    if (state.unlocked.includes(feature)) continue;
    const parts = all.filter((p) => p.unlock === feature).map((p) => p.id);
    if (parts.length > 0) return { type: 'feature', feature, parts };
  }
  const limit = workflowLimit(state.tier);
  if (state.library.length >= limit) {
    const at = companyTiers.findIndex((t) => t.id === state.tier);
    const bigger = companyTiers.slice(at + 1).find((t) => workflowLimit(t.id) > limit);
    return bigger ? { type: 'tier', tier: bigger.id, workflows: workflowLimit(bigger.id) } : null;
  }
  return { type: 'workflow', room: limit - state.library.length };
}

function readmeOf(
  state: GameState | null,
  components: readonly PluginComponent[],
  level: number,
  workflows: readonly LibraryWorkflowDef[],
): string {
  const r = ja.pluginExport.readme;
  const x = ja.pluginExport;
  const list = components.map((c) => `- ${x.kinds[c.kind]}：${c.name}（${x.origins[c.origin]}）`);
  const stats = state
    ? workflows.flatMap((w) => [`### ${w.name}`, '', ...statLines(workflowStats(state, w.id)), ''])
    : [];
  return [
    `# ${r.title}`,
    '',
    r.intro,
    '',
    `> ${r.template}`,
    `> ${r.brought}`,
    '',
    `## ${r.contents}`,
    '',
    r.level(level, components.length),
    '',
    ...list,
    '',
    `## ${r.stats}`,
    '',
    ...(stats.length > 0 ? stats : [r.noStats, '']),
    `## ${r.install}`,
    '',
    ...x.install.steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    `## ${r.templates}`,
    '',
    r.templatesBody,
    '',
  ].join('\n');
}

/**
 * zip に入れるファイルの並び。ローカルのフォルダから入れられるよう、マーケットプレイスで包む：
 * tycoon-harness/.claude-plugin/marketplace.json と tycoon-harness/plugins/tycoon-harness/（プラグイン）
 */
export function pluginArchive(exp: PluginExport): PluginFile[] {
  const root = PLUGIN_NAME;
  const marketplace = {
    name: MARKETPLACE_NAME,
    owner: { name: ja.pluginExport.plugin.author },
    metadata: { description: ja.pluginExport.plugin.marketplace },
    plugins: [
      { name: PLUGIN_NAME, source: `./plugins/${PLUGIN_NAME}`, description: ja.pluginExport.plugin.description },
    ],
  };
  return [
    { path: `${root}/.claude-plugin/marketplace.json`, content: json(marketplace) },
    ...exp.files.map((f) => ({ path: `${root}/plugins/${PLUGIN_NAME}/${f.path}`, content: f.content })),
  ];
}
