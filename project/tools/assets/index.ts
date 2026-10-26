import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { generatedFiles, type ModelId, modelAssets } from '../../src/assets/catalog';
import { visual } from '../../src/content/look/visual';
import { renderTokensCss } from '../../src/styles/tokens';
import { GENERATED_DIR, PROJECT_DIR, TOKENS_CSS } from './config';
import { buildManifest, MANIFEST_PATH } from './manifest';
import { exportGlb } from './models/build';
import { modelBuilders } from './models/index';
import { rasterizeAll } from './raster';

/** `npm run assets`：トークンの CSS・WebP・glb をすべて生成し、manifest.json を書き出す */

const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;

async function main(): Promise<void> {
  mkdirSync(GENERATED_DIR, { recursive: true });
  // カタログから消えた古い生成物を残さない
  const keep = new Set([...generatedFiles(), 'manifest.json']);
  for (const file of readdirSync(GENERATED_DIR)) {
    if (!keep.has(file)) rmSync(join(GENERATED_DIR, file));
  }

  writeFileSync(TOKENS_CSS, renderTokensCss(visual));
  const written = [relative(PROJECT_DIR, TOKENS_CSS)];

  for (const file of await rasterizeAll(visual)) written.push(relative(PROJECT_DIR, join(GENERATED_DIR, file)));

  for (const [id, build] of Object.entries(modelBuilders) as [ModelId, (typeof modelBuilders)[ModelId]][]) {
    const path = join(GENERATED_DIR, modelAssets[id].file);
    writeFileSync(path, await exportGlb(build(visual)));
    written.push(relative(PROJECT_DIR, path));
  }

  writeFileSync(MANIFEST_PATH, `${JSON.stringify(buildManifest(), null, 2)}\n`);

  for (const path of written)
    console.log(`  ${path.padEnd(42)} ${kib(statSync(join(PROJECT_DIR, path)).size).padStart(10)}`);
  console.log(`✓ assets: ${written.length} ファイルを生成し、manifest.json を更新した`);
}

await main();
