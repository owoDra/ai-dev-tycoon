import { describe, expect, it } from 'vitest';
import { getHarnessPart } from '../../src/content/index';
import {
  type BringFile,
  bringSummary,
  broughtPart,
  frontmatter,
  isBroughtPartId,
  parseBringPartId,
  readBring,
  screenPath,
} from '../../src/core/bring';
import { createZip, readZip } from '../../src/lib/zip';
import { readFixture } from '../helpers/bring';

const fixture = readFixture();

describe('持ち込みの読み込みと評価（core/bring.ts）', () => {
  it('実在する形の .claude/ を読み込むと、カテゴリと点が期待どおりに出る', () => {
    const { cards } = readBring(fixture);
    expect(cards.map((c) => [c.category, c.name, c.score])).toEqual([
      ['subagent', 'test-runner', 100],
      ['rules', 'testing', 100],
      ['hook', 'PostToolUse(Edit|Write) npm test >&2 || exit 2', 100],
      ['hook', 'PreToolUse(Bash) "$CLAUDE_PROJECT_DIR"/.claude/hooks/guard.sh', 35],
      ['permission', 'permissions (allow 3 / deny 3)', 100],
      ['skill', 'code-review', 100],
      ['skill', 'notes', 20],
      ['mcp', 'playwright, github', 75],
      ['claudeMd', 'CLAUDE.md', 100],
    ]);
  });

  it('観点ごとに、良かった点と伸ばすと強くなる点が分かる', () => {
    const { cards } = readBring(fixture);
    const notes = cards.find((c) => c.name === 'notes');
    expect(notes?.checks.filter((c) => c.ok).map((c) => c.id)).toEqual(['notTooLong']);
    expect(notes?.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual([
      'hasDescription',
      'whenToUse',
      'concreteSteps',
    ]);
    const mcp = cards.find((c) => c.category === 'mcp');
    expect(mcp?.checks.find((c) => !c.ok)?.id).toBe('pinned');
  });

  it('Hook はイベントをゲームのタイミングに読み替え、中身で雛形を選ぶ。作業の流れに効かないイベントはカードにしない', () => {
    const { cards, skipped } = readBring(fixture);
    const hooks = cards.filter((c) => c.category === 'hook');
    expect(hooks.map((c) => c.timing)).toEqual(['PostToolUse', 'PreToolUse']);
    expect(parseBringPartId(hooks[0]?.id ?? '')?.template).toBe('hookUnitTest');
    expect(parseBringPartId(hooks[1]?.id ?? '')?.template).toBe('hookGuard');
    expect(skipped).toContainEqual({
      path: '.claude/settings.json#hooks.Notification',
      reason: 'unusedHook',
      detail: 'Notification',
    });
  });

  it('.env は中身を読まずに知らせ、対象でないファイル（スクリプト・ソース）は黙って飛ばす', () => {
    const { skipped } = readBring(fixture);
    expect(skipped.filter((s) => s.reason !== 'unusedHook')).toEqual([{ path: '.env', reason: 'secretFile' }]);
    expect(screenPath('.claude/hooks/guard.sh', 10)).toBe('notTarget');
    expect(screenPath('src/index.ts', 10)).toBe('notTarget');
    expect(screenPath('node_modules/x/SKILL.md', 10)).toBe('notTarget');
    expect(screenPath('.claude/skills/a/SKILL.md', 10_000_000)).toBe('tooLarge');
  });

  it('同じ入力を2回評価すると同じ結果になる（渡す順が違っても同じ）', () => {
    const a = readBring(fixture);
    const b = readBring(fixture);
    const reversed = readBring([...fixture].reverse());
    expect(b).toEqual(a);
    expect(reversed).toEqual(a);
  });

  it('トークンに見える文字列を含むファイルは、カードにも中身にも残さない', () => {
    // 本物に見える鍵をリポジトリに置かないよう、テストの中で組み立てる
    const token = `sk-ant-api03-${'Ab3'.repeat(12)}`;
    const leaky: BringFile = {
      path: '.claude/skills/deploy/SKILL.md',
      text: `---\nname: deploy\ndescription: デプロイするときに使う\n---\n\nANTHROPIC_API_KEY=${token}\n`,
    };
    const github = `ghp_${'x1Y2'.repeat(9)}`;
    const mcp: BringFile = {
      path: '.mcp.json',
      text: JSON.stringify({ mcpServers: { gh: { command: 'gh-mcp', env: { GITHUB_TOKEN: github } } } }),
    };
    const result = readBring([...fixture.filter((f) => f.path !== '.mcp.json'), leaky, mcp]);
    expect(result.cards.some((c) => c.name === 'deploy' || c.category === 'mcp')).toBe(false);
    expect(result.skipped).toContainEqual({ path: leaky.path, reason: 'secret', detail: 'anthropic' });
    expect(result.skipped).toContainEqual({ path: '.mcp.json', reason: 'secret', detail: 'github' });
    const saved = JSON.stringify(result);
    expect(saved).not.toContain(token);
    expect(saved).not.toContain(github);
  });

  it('壊れた JSON は読めないファイルとして飛ばす', () => {
    const { cards, skipped } = readBring([{ path: '.claude/settings.json', text: '{ broken' }]);
    expect(cards).toEqual([]);
    expect(skipped).toEqual([{ path: '.claude/settings.json', reason: 'unreadable' }]);
  });

  it('カードの id から Harness 部品を再生成でき、性能（点・効く仕事・タイミング）が id に入っている', () => {
    for (const card of readBring(fixture).cards) {
      expect(isBroughtPartId(card.id)).toBe(true);
      const part = getHarnessPart(card.id);
      expect(part).toEqual(broughtPart(card.id));
      expect(part.category).toBe(card.category);
      expect(part.name).toBe(card.name.slice(0, 24));
      expect(part.appliesTo).toEqual(expect.arrayContaining([...card.kinds]));
      expect(part.timing).toBe(card.timing);
      expect(part.origin).toBe('brought');
    }
    expect(broughtPart('x~nope~-~1~1~0~a~b')).toBeUndefined();
    expect(broughtPart('x~skillFrontend~-~999~1~0~a~b')).toBeUndefined();
  });

  it('結果コードに入れる要約は、カテゴリと点だけ', () => {
    const cards = readBring(fixture).cards;
    expect(bringSummary(['skillFrontend', ...cards.slice(0, 2).map((c) => c.id)])).toEqual([
      { category: 'subagent', score: 100 },
      { category: 'rules', score: 100 },
    ]);
  });

  it('zip（無圧縮）にしても、読み戻すと同じカードになる', async () => {
    const encoder = new TextEncoder();
    const zip = createZip(fixture.map((f) => ({ path: `my-project/${f.path}`, data: encoder.encode(f.text) })));
    const decoder = new TextDecoder();
    const files = (await readZip(zip)).map((e) => ({
      path: e.path.replace(/^my-project\//, ''),
      text: decoder.decode(e.data),
    }));
    expect(readBring(files)).toEqual(readBring(fixture));
  });

  it('frontmatter の値と並びを読む', () => {
    const { fields, body } = frontmatter('---\nname: "a"\npaths:\n  - "src/**"\n  - tests/**\n---\nbody');
    expect(fields).toEqual({ name: 'a', paths: ['src/**', 'tests/**'] });
    expect(body).toBe('body');
  });
});
