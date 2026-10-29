import { describe, expect, it } from 'vitest';
import { glossary } from '../../src/content/glossary';
import { content, getProject } from '../../src/content/index';
import { uiLayout } from '../../src/content/look/layout';
import { tutorialScript } from '../../src/content/tutorial';
import type { Condition, FeatureId } from '../../src/content/types';
import { allFeatures, dockFeature, modeFeature, unlockDefs } from '../../src/content/unlocks';
import { ja } from '../../src/i18n/ja';

/** 条件が参照している案件・Task・モード・機能がすべて存在するかを調べ、問題を文言で返す */
function conditionErrors(where: string, c: Condition): string[] {
  const errors: string[] = [];
  const modes = new Set(content.assignModes.map((m) => m.id));
  const features = new Set<string>(allFeatures);
  if ('mode' in c && c.mode !== undefined && !modes.has(c.mode)) errors.push(`${where}: 未定義のモード ${c.mode}`);
  if (c.type === 'unlocked' && !features.has(c.feature)) errors.push(`${where}: 未定義の機能 ${c.feature}`);
  if ('projectId' in c) {
    const project = content.projects.find((p) => p.id === c.projectId);
    if (!project) errors.push(`${where}: 未定義の案件 ${c.projectId}`);
    if ('taskId' in c && !project?.tasks.some((t) => t.id === c.taskId))
      errors.push(`${where}: 未定義の Task ${c.taskId}`);
  }
  if ('count' in c && !(c.count >= 1)) errors.push(`${where}: count が1未満`);
  return errors;
}

describe('機能の解放（content/unlocks.ts）', () => {
  it('ID と対象の機能が重複せず、全担当モードに解放の定義がある', () => {
    expect(new Set(unlockDefs.map((u) => u.id)).size).toBe(unlockDefs.length);
    expect(new Set(unlockDefs.map((u) => u.feature)).size).toBe(unlockDefs.length);
    for (const m of content.assignModes) expect(allFeatures).toContain(modeFeature(m.id));
  });

  it('全解放の条件の参照先が存在し、解放時の文言がある', () => {
    const errors = unlockDefs.flatMap((u) => conditionErrors(`解放 ${u.id}`, u.when));
    expect(errors).toEqual([]);
    for (const u of unlockDefs) expect(ja.unlocks[u.message], u.id).not.toBe('');
  });

  it('解放の条件が循環しない（他の解放を条件にする連鎖が start に行き着く）', () => {
    const byFeature = new Map(unlockDefs.map((u) => [u.feature, u]));
    for (const u of unlockDefs) {
      const seen = new Set<FeatureId>();
      let c: Condition = u.when;
      while (c.type === 'unlocked') {
        expect(seen.has(c.feature), `${u.id} の条件が循環している`).toBe(false);
        seen.add(c.feature);
        const next = byFeature.get(c.feature);
        if (!next) break;
        c = next.when;
      }
    }
  });

  it('ドックの項目に対応する機能はすべて定義されていて、ドックの項目（か「詳細」）も存在する', () => {
    for (const [item, feature] of Object.entries(dockFeature)) {
      expect(allFeatures).toContain(feature);
      expect([...uiLayout.wide.dock.items, ...uiLayout.wide.dock.details] as readonly string[]).toContain(item);
    }
  });

  it('最初から解放されているのは「人間」と「AI」の2つだけ（企画書50章）', () => {
    expect(unlockDefs.filter((u) => u.when.type === 'start').map((u) => u.feature)).toEqual(['mode:human', 'mode:ai']);
  });
});

describe('用語（content/glossary.ts）', () => {
  it('3つ以上あり、明かす条件の参照先が存在し、名前と平易な説明がある', () => {
    expect(glossary.length).toBeGreaterThanOrEqual(3);
    expect(glossary.flatMap((g) => conditionErrors(`用語 ${g.id}`, g.reveal))).toEqual([]);
    for (const g of glossary) {
      expect(ja.glossary[g.id].term).not.toBe('');
      expect(ja.glossary[g.id].plain).not.toBe('');
    }
  });

  it('どの用語も最初からは明かさない（体験 → 用語の順。企画書34章）', () => {
    for (const g of glossary) expect(g.reveal.type, g.id).not.toBe('start');
  });
});

describe('チュートリアルの台本（content/tutorial.ts）', () => {
  const project = getProject(tutorialScript.projectId);
  const taskIds = new Set(project.tasks.map((t) => t.id));

  it('ステップの ID が重複せず、条件・照らす場所・許す操作の参照先が存在する', () => {
    expect(new Set(tutorialScript.steps.map((s) => s.id)).size).toBe(tutorialScript.steps.length);
    expect(tutorialScript.steps[0]?.when).toEqual({ type: 'start' });
    const errors = [
      ...tutorialScript.steps.flatMap((s) => [
        ...conditionErrors(`ステップ ${s.id}`, s.when),
        ...(typeof s.say === 'string' ? [] : conditionErrors(`ステップ ${s.id} の文言`, s.say.if)),
      ]),
      ...conditionErrors('completeWhen', tutorialScript.completeWhen),
    ];
    expect(errors).toEqual([]);
    for (const s of tutorialScript.steps) {
      if (s.highlight?.kind === 'task') expect(taskIds.has(s.highlight.taskId), s.id).toBe(true);
      for (const a of s.allow) expect(taskIds.has(a.taskId), s.id).toBe(true);
    }
    for (const id of Object.keys(tutorialScript.forcedAiOutcomes)) expect(taskIds.has(id), id).toBe(true);
  });

  it('全ステップの文言がある', () => {
    for (const s of tutorialScript.steps) {
      const ids = typeof s.say === 'string' ? [s.say] : [s.say.yes, s.say.no];
      for (const id of ids) expect(ja.tutorial.say[id], s.id).not.toBe('');
    }
  });

  it('照らすカードと許すモードは、そのステップの時点で解放される機能だけ', () => {
    const initial = new Set(unlockDefs.filter((u) => u.when.type === 'start').map((u) => u.feature));
    const first = tutorialScript.steps[0];
    for (const a of first?.allow ?? []) for (const m of a.modes) expect(initial.has(modeFeature(m))).toBe(true);
  });
});
