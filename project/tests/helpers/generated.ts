import { getProject } from '../../src/content/index';
import { projectTemplates } from '../../src/content/projectTemplates';
import type { ProjectSize } from '../../src/content/types';
import { generatedProjectId } from '../../src/core/projectGen';

/*
 * 固定 seed で生成した代表的な案件（バランステストで、以前の固定の案件の代わりに使う）。
 * 型と規模を指定すると、seed `rep:<型>:<番号>` を順に試して、その型になった最初の案件を返す（決定論的）。
 */

const cache = new Map<string, string>();

export function representativeProject(templateId: string, size: ProjectSize = 'M'): string {
  const key = `${templateId}~${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  for (let n = 0; n < 1000; n++) {
    const id = generatedProjectId(`rep:${templateId}:${n}`, size);
    if (getProject(id).brief?.templateId === templateId) {
      cache.set(key, id);
      return id;
    }
  }
  throw new Error(`型 ${templateId} の案件が生成できない`);
}

/** 型ごとに1件ずつの代表的な案件（規模 M。型の並び順） */
export const representativeProjects = (size: ProjectSize = 'M') =>
  projectTemplates.map((t) => representativeProject(t.id, size));
