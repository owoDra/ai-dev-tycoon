import { balance } from '../content/balance';
import { type BringFile, type BringSkip, screenPath } from '../core/bring';
import { readZip } from '../lib/zip';

/*
 * 持ち込みのファイルの読み取り（ブラウザの中だけ）。入口はフォルダの選択・ドラッグ&ドロップ・zip・単一のファイルの4つ。
 * 中身を読む前に、パスと大きさで読むファイルを絞る（core/bring.ts の screenPath）。対象でないファイルは開かない。
 * 読んだ中身はテキストとして返すだけで、評価は core/bring.ts の readBring が受け持つ。
 */

export interface ReadFiles {
  readonly files: BringFile[];
  /** 中身を読む前に断ったもの（秘密が入っていそうな名前・大きすぎる） */
  readonly skipped: BringSkip[];
}

const isZip = (name: string) => name.toLowerCase().endsWith('.zip');

/** File の並び（input の選択・ドロップ）を読む。zip は展開して中のファイルを読む。path は選んだフォルダからの相対パス */
export async function readFileList(entries: readonly { file: File; path: string }[]): Promise<ReadFiles> {
  const files: BringFile[] = [];
  const skipped: BringSkip[] = [];
  for (const { file, path } of entries) {
    if (isZip(file.name)) {
      const zip = await readZipFile(file);
      files.push(...zip.files);
      skipped.push(...zip.skipped);
      continue;
    }
    const reason = screenPath(path, file.size);
    if (reason === 'notTarget') continue;
    if (reason) skipped.push({ path, reason });
    else files.push({ path, text: await file.text() });
  }
  return { files, skipped };
}

/** zip を展開する（目次で読むファイルを絞ってから展開する）。zip そのものが大きすぎれば読まない */
async function readZipFile(file: File): Promise<ReadFiles> {
  if (file.size > balance.bring.limits.zipBytes) {
    return { files: [], skipped: [{ path: file.name, reason: 'tooLarge' }] };
  }
  const skipped: BringSkip[] = [];
  const entries = await readZip(new Uint8Array(await file.arrayBuffer()), (path, size) => {
    const reason = screenPath(path, size);
    if (reason && reason !== 'notTarget') skipped.push({ path, reason });
    return reason === null;
  });
  const decoder = new TextDecoder();
  return { files: entries.map((e) => ({ path: e.path, text: decoder.decode(e.data) })), skipped };
}

/** input[type=file] の選択（フォルダの選択なら webkitRelativePath が選んだフォルダからのパス） */
export function fromInput(list: FileList | null): { file: File; path: string }[] {
  return [...(list ?? [])].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}

/** ドロップしたもの。フォルダは中をたどってファイルを集める（FileSystemEntry に対応していなければファイルだけ） */
export async function fromDrop(data: DataTransfer): Promise<{ file: File; path: string }[]> {
  const items = [...data.items].filter((i) => i.kind === 'file');
  const roots = items.map((i) => i.webkitGetAsEntry?.() ?? null);
  if (roots.some((r) => r === null)) return fromInput(data.files);
  const out: { file: File; path: string }[] = [];
  for (const root of roots) if (root) await walk(root, out);
  return out;
}

async function walk(entry: FileSystemEntry, out: { file: File; path: string }[]): Promise<void> {
  const path = entry.fullPath.replace(/^\//, '');
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    out.push({ file, path });
    return;
  }
  if (path.split('/').some((seg) => seg === 'node_modules' || seg === '.git')) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries は一度に全部を返さないので、空になるまで読む
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    for (const child of batch) await walk(child, out);
  }
}
