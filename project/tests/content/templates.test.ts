import { describe, expect, it } from 'vitest';
import { content } from '../../src/content/index';
import { projectTemplates } from '../../src/content/projectTemplates';
import { founders, staff } from '../../src/content/staff';
import type { ProjectTemplateDef } from '../../src/content/types';
import { validateContent, validateTemplates } from '../../src/content/validate';

/*
 * 案件の型と創業メンバー（以前のキャンペーンの定義のテストを、案件の型で表し直したもの）。
 * 固定の7案件のうちチュートリアル以外の6件は案件の型になり、型の id のまま引くと標準の案件になる。
 */

const ec = projectTemplates.find((t) => t.id === 'ecRenewal') as ProjectTemplateDef;

describe('案件の型（content/projectTemplates.ts）', () => {
  it('型・業種・複製する Task・省く Task の参照先が存在し、創業メンバーがいる', () => {
    expect(validateTemplates(projectTemplates)).toEqual([]);
    expect(validateContent(content)).toEqual([]);
  });

  it('チュートリアル以外の以前の6案件が型になり、固定の案件は型の標準の案件とチュートリアルだけ', () => {
    expect(projectTemplates.map((t) => t.id)).toEqual([
      'ecRenewal',
      'paymentFix',
      'corporateSite',
      'saasFeature',
      'internalTool',
      'promoLp',
    ]);
    expect(content.projects.map((p) => p.id).sort()).toEqual(
      [...projectTemplates.map((t) => t.id), 'tutorialLp'].sort(),
    );
  });

  it('創業メンバーは固定の社員の全員（ほかの社員は採用市場で増やす）', () => {
    expect([...founders].sort()).toEqual(staff.map((h) => h.id).sort());
  });

  it('未定義の Task・業種のない型・省くと何も残らない型・創業メンバーの誤りを検出する', () => {
    const errors = (t: ProjectTemplateDef) => validateTemplates([t]).join('\n');
    expect(errors({ ...ec, scales: ['nope'] })).toContain('未定義の Task nope');
    expect(errors({ ...ec, industries: [] })).toContain('業種がない');
    expect(errors({ ...ec, optional: ec.tasks.map((t) => t.id) })).toContain('Task が残らない');
    expect(errors({ ...ec, optional: ['implementation'] })).toContain('複製する Task を省こうとしている');
    expect(validateTemplates([ec, ec]).join('\n')).toContain('ID ecRenewal が重複している');
    expect(validateContent(content, projectTemplates, ['sato', 'nobody']).join('\n')).toContain('未定義の社員 nobody');
    expect(validateContent(content, projectTemplates, ['sato', 'sato']).join('\n')).toContain('ID sato が重複している');
  });
});
