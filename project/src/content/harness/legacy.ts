/**
 * Phase 26 で id を変えた部品の読み替え（セーブ・Workflow の共有コード・実務モードのコード）。
 * null はなくなった部品（READ は Claude Code では常に許可、Human Gate は既定の「毎回確認」と同じ）
 */
export const legacyPartIds: Readonly<Record<string, string | null>> = {
  toolFiles: 'mcpFilesystem',
  toolGit: 'mcpGit',
  toolBrowser: 'mcpBrowser',
  toolDatabase: 'mcpDatabase',
  toolAnalytics: 'mcpAnalytics',
  toolCommunication: 'mcpChat',
  permRead: null,
  permWrite: 'permAcceptEdits',
  permExecute: 'permAuto',
  permDeploy: 'permAuto',
  humanGate: null,
};

/** 部品の id を今の id に読み替える（なくなった部品は null。知らない id はそのまま返す） */
export const migratePartId = (id: string): string | null => (id in legacyPartIds ? (legacyPartIds[id] ?? null) : id);

/**
 * 部品の id の並びを今の id に読み替える。なくなった部品は外し、同じ id になったもの（権限モードなど同じ group）は
 * 後のものを残す
 */
export function migratePartIds(ids: readonly string[], groupOf: (id: string) => string | undefined): string[] {
  const out: string[] = [];
  for (const old of ids) {
    const id = migratePartId(old);
    if (id === null) continue;
    const group = groupOf(id);
    const kept = out.filter((x) => x !== id && (group === undefined || groupOf(x) !== group));
    out.length = 0;
    out.push(...kept, id);
  }
  return out;
}
