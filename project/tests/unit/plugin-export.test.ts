import { describe, expect, it } from 'vitest';
import { allFeatures } from '../../src/content/unlocks';
import { readBring } from '../../src/core/bring';
import { saveWorkflow } from '../../src/core/library';
import {
  exportPlugin,
  MARKETPLACE_NAME,
  PLUGIN_NAME,
  type PluginFile,
  pluginArchive,
  workflowLimit,
} from '../../src/core/pluginExport';
import { createInitialState, type GameState } from '../../src/core/state';
import { createZip, readZip } from '../../src/lib/zip';
import { readFixture } from '../helpers/bring';
import { sampleWorkflows } from '../helpers/workflows';

const cards = readBring(readFixture()).cards;

/** 会社を始めたばかり（チュートリアルの後、Harness はまだ） */
const early = (): GameState => ({ ...createInitialState('plugin', { board: true, talent: true }), tutorial: null });

/** ゲームを進めた会社：解放はすべて済み・中堅・Workflow を4つ保存 */
function advanced(): GameState {
  let s: GameState = { ...early(), unlocked: [...allFeatures], tier: 'mid' };
  for (const w of Object.values(sampleWorkflows)) s = saveWorkflow(s, w)?.state ?? s;
  return s;
}

const fileOf = (files: readonly PluginFile[], path: string) => files.find((f) => f.path === path)?.content;

/** SKILL.md・agents/*.md の frontmatter（key: value） */
function front(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m?.[1]) throw new Error(`frontmatter がない：${text.slice(0, 40)}`);
  return Object.fromEntries(
    m[1]
      .split('\n')
      .filter((l) => /^[\w-]+:/.test(l))
      .map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]),
  );
}

/** Claude Code の hooks のイベント名（公式ドキュメントの一覧の一部。書き出すものはこの中にある） */
const EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop', 'Notification'];

/** Claude Code が読むプラグインの場所（それ以外は README と templates/ だけ） */
const KNOWN =
  /^(\.claude-plugin\/plugin\.json|README\.md|skills\/[a-z\d-]+\/SKILL\.md|agents\/[a-z\d-]+\.md|hooks\/hooks\.json|\.mcp\.json|scripts\/[a-z-]+\.sh|templates\/.+)$/;

describe('プラグインの書き出し（core/pluginExport.ts）', () => {
  it('書き出したファイルの一覧と、plugin.json・hooks.json・各 SKILL.md・agents の形が正しい', () => {
    const { files } = exportPlugin({ state: advanced(), cards });
    for (const f of files) expect(f.path, f.path).toMatch(KNOWN);
    expect(new Set(files.map((f) => f.path)).size).toBe(files.length);

    const manifest = JSON.parse(fileOf(files, '.claude-plugin/plugin.json') ?? '');
    expect(manifest.name).toBe(PLUGIN_NAME);
    expect(manifest.name).toMatch(/^[a-z][a-z\d-]*$/);
    expect(manifest.name).not.toMatch(/^(claude|anthropic)/);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof manifest.description).toBe('string');
    expect(manifest.author).toEqual({ name: expect.any(String) });

    const hooks = JSON.parse(fileOf(files, 'hooks/hooks.json') ?? '');
    expect(Object.keys(hooks)).toEqual(['hooks']);
    for (const [event, entries] of Object.entries(hooks.hooks)) {
      expect(EVENTS, event).toContain(event);
      for (const e of entries as { matcher?: string; hooks: { type: string; command: string }[] }[]) {
        expect(e.hooks.length).toBeGreaterThan(0);
        for (const h of e.hooks) {
          expect(h.type).toBe('command');
          expect(typeof h.command).toBe('string');
        }
      }
    }
    // 同梱の Hook はプラグインの中のスクリプトを ${CLAUDE_PLUGIN_ROOT} から sh で呼び、そのスクリプトも入っている
    const scripts = files.filter((f) => f.path.startsWith('scripts/')).map((f) => f.path);
    expect(scripts).toEqual(
      expect.arrayContaining(['scripts/guard.sh', 'scripts/test.sh', 'scripts/lint.sh', 'scripts/format.sh']),
    );
    for (const path of scripts) {
      expect(fileOf(files, 'hooks/hooks.json')).toContain(`sh \\"\${CLAUDE_PLUGIN_ROOT}/${path}\\"`);
      expect(fileOf(files, path)).toMatch(/^#!\/bin\/sh\n/);
    }

    // 持ち込みの Skill（notes）は元の中身のままなので、description がなくても書き換えない（Claude Code では省ける）
    const skills = files.filter((f) => f.path.startsWith('skills/') && f.path !== 'skills/notes/SKILL.md');
    expect(skills.length).toBeGreaterThan(5);
    for (const s of skills) {
      const fm = front(s.content);
      expect(fm.name, s.path).toBe(s.path.split('/')[1]);
      expect(fm.description?.length, s.path).toBeGreaterThan(0);
    }
    for (const a of files.filter((f) => f.path.startsWith('agents/'))) {
      const fm = front(a.content);
      expect(fm.name?.length, a.path).toBeGreaterThan(0);
      expect(fm.description?.length, a.path).toBeGreaterThan(0);
    }
    expect(JSON.parse(fileOf(files, '.mcp.json') ?? '').mcpServers).toBeTypeOf('object');
    // CLAUDE.md はプラグインから読まれないので、ルートには置かない（templates/ の雛形にする）
    expect(files.some((f) => f.path === 'CLAUDE.md')).toBe(false);
    expect(fileOf(files, 'README.md')).toContain('claude plugin install tycoon-harness@tycoon-market');
  });

  it('ゲームを進めた会社は、始めたばかりの会社より書き出す部品が多い', () => {
    const a = exportPlugin({ state: early(), cards: [] });
    const b = exportPlugin({ state: advanced(), cards: [] });
    expect(a.components.length).toBe(0);
    expect(b.components.length).toBeGreaterThan(a.components.length + 10);
    expect(b.level).toBeGreaterThan(a.level);
    expect(b.files.length).toBeGreaterThan(a.files.length);
    // 始めたばかりなら、次は Harness の解放で増える
    expect(a.next).toMatchObject({ type: 'feature', feature: 'harness' });
  });

  it('解放した束の部品だけが入り、Workflow は会社の規模の上限まで入る', () => {
    const harnessOnly: GameState = { ...advanced(), unlocked: [...early().unlocked, 'harness'], tier: 'startup' };
    const exp = exportPlugin({ state: harnessOnly, cards: [] });
    expect(exp.components.some((c) => c.kind === 'agent')).toBe(false);
    expect(exp.files.some((f) => f.path === 'skills/done-check/SKILL.md')).toBe(false);
    expect(exp.components.filter((c) => c.kind === 'workflow')).toHaveLength(workflowLimit('startup'));
    expect(exp.next).toMatchObject({ type: 'feature', feature: 'harness:eval' });
    const all = exportPlugin({ state: advanced(), cards: [] });
    expect(all.components.filter((c) => c.kind === 'workflow')).toHaveLength(4);
    expect(all.files.some((f) => f.path === 'skills/done-check/SKILL.md')).toBe(true);
  });

  it('Workflow の Skill に、進め方・使う部品・ゲーム内の成績を書き、README にも成績を書く', () => {
    const { files } = exportPlugin({ state: advanced(), cards: [] });
    const skill = fileOf(files, 'skills/workflow-custom1/SKILL.md') ?? '';
    expect(front(skill)).toMatchObject({ name: 'workflow-custom1', model: 'sonnet' });
    expect(skill).toContain('Pull Request Review');
    expect(skill).toContain(`/${PLUGIN_NAME}:code-review`);
    expect(skill).toContain('使った回数：0回');
    expect(fileOf(files, 'README.md')).toContain('### Pull Request Review');
  });

  it('持ち込みカードを書き出すと、元の中身と同じになる', () => {
    const { files } = exportPlugin({ state: null, cards });
    const fixture = readFixture();
    const original = (path: string) => fixture.find((f) => f.path === path)?.text;
    expect(fileOf(files, 'skills/code-review/SKILL.md')).toBe(original('.claude/skills/code-review/SKILL.md'));
    expect(fileOf(files, 'skills/notes/SKILL.md')).toBe(original('.claude/skills/notes/SKILL.md'));
    expect(fileOf(files, 'agents/test-runner.md')).toBe(original('.claude/agents/test-runner.md'));
    expect(fileOf(files, 'templates/CLAUDE.md')).toBe(original('CLAUDE.md'));
    expect(fileOf(files, 'templates/.claude/rules/testing.md')).toBe(original('.claude/rules/testing.md'));
    const settings = JSON.parse(original('.claude/settings.json') ?? '');
    const hooks = JSON.parse(fileOf(files, 'hooks/hooks.json') ?? '').hooks;
    expect(hooks.PostToolUse).toEqual(settings.hooks.PostToolUse);
    expect(hooks.PreToolUse).toEqual(settings.hooks.PreToolUse);
    expect(JSON.parse(fileOf(files, 'templates/.claude/settings.json') ?? '')).toEqual({
      permissions: settings.permissions,
    });
    expect(JSON.parse(fileOf(files, '.mcp.json') ?? '')).toEqual(JSON.parse(original('.mcp.json') ?? ''));
  });

  it('持ち込みカードと同じ名前の同梱の Skill は、持ち込みを優先する', () => {
    const { files, components } = exportPlugin({ state: advanced(), cards });
    expect(fileOf(files, 'skills/code-review/SKILL.md')).toBe(
      readFixture().find((f) => f.path === '.claude/skills/code-review/SKILL.md')?.text,
    );
    expect(components.filter((c) => c.kind === 'skill' && c.name === 'code-review')).toHaveLength(1);
  });

  it('zip を自前のコードで読み戻すと、同じファイルの一覧と中身になる', async () => {
    const archive = pluginArchive(exportPlugin({ state: advanced(), cards }));
    const encoder = new TextEncoder();
    const zip = createZip(archive.map((f) => ({ path: f.path, data: encoder.encode(f.content) })));
    const decoder = new TextDecoder();
    const back = (await readZip(zip)).map((e) => ({ path: e.path, content: decoder.decode(e.data) }));
    expect(back).toEqual(archive);
    const market = JSON.parse(archive.find((f) => f.path.endsWith('marketplace.json'))?.content ?? '');
    expect(market).toMatchObject({
      name: MARKETPLACE_NAME,
      plugins: [{ name: PLUGIN_NAME, source: `./plugins/${PLUGIN_NAME}` }],
    });
    expect(archive.every((f) => f.path.startsWith(`${PLUGIN_NAME}/`))).toBe(true);
  });

  it('同じ入力からは同じ中身になる', () => {
    expect(exportPlugin({ state: advanced(), cards })).toEqual(exportPlugin({ state: advanced(), cards }));
  });
});
