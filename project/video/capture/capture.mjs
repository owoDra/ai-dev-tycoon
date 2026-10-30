/**
 * 紹介動画の素材にするゲーム画面を撮る。ビルド済みの dist/index.html を Chromium で開き、操作しながらスクリーンショットを保存する。
 * 先に project/ で `npm run build` を実行しておく。Chromium は CHROMIUM_PATH で指定する（省略すると playwright-core の既定）。
 * 出力は public/screens/（コミットしない）。--frames を付けると進行中の画面を連番で残す（使うコマを選ぶため）。
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../../dist/index.html');
const out = resolve(here, '../public/screens');
const sampleConfig = resolve(here, 'sample-config');
const dumpFrames = process.argv.includes('--frames');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.5 });
page.on('pageerror', (e) => console.error('pageerror:', e.message));

const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  console.log('saved', name);
};
const click = async (text, ms = 1000) => {
  await page.locator('button:visible', { hasText: text }).first().click();
  await wait(ms);
};

await page.goto(pathToFileURL(dist).href);
await wait(2500);
await shot('title');

// 持ち込み：サンプルの Claude Code 設定を読み込んで、カードにする
await click('持ち込み');
await page.locator('input[type=file]').first().setInputFiles(sampleConfig);
await wait(2000);
await shot('bring');

// 持ち寄りバトル：全機能が解放された状態で案件を始める
await page.locator('input:not([type=file])').fill('PARTY-2026');
await click('バトルを始める', 3500);
await click('あとで').catch(() => {});
await shot('floor');

// 担当を決めるシート
const assignments = [
  ['不具合の再現', 'AI → 人間レビュー'],
  ['決済仕様の確認', '人間'],
  ['決済画面の修正', 'AI → 自動テスト'],
  ['テスト追加', 'AI に任せる'],
  ['リリース', 'AI → 人間レビュー'],
];
for (const [i, [task, mode]] of assignments.entries()) {
  await click(task, 1200);
  if (i === 0) await shot('assign');
  await page.locator('button:visible', { hasText: mode }).first().click();
  await wait(800);
  if (i === 0) await shot('assign-picked');
  await page
    .getByRole('button', { name: '閉じる' })
    .first()
    .click()
    .catch(() => {});
  await wait(600);
}
await shot('assigned');

// Harness Builder：おすすめの組み合わせを付ける
await click('AI の仕組み');
await click('Harness', 1500);
await shot('harness-empty');
await click('まず安全に', 1500);
await shot('harness');
await page
  .getByRole('button', { name: '閉じる' })
  .first()
  .click()
  .catch(() => {});
await wait(800);

// 進行：まとめて進め、事件やボトルネックが出たところを撮る（時間で進むので、コマは --frames で確かめて選ぶ）
await click('まとめて進める', 500);
for (let i = 0; i < 12; i++) {
  await wait(1000);
  if (dumpFrames) await shot(`run-${String(i).padStart(2, '0')}`);
  if (i === 0) await shot('trouble');
}

// 納品と振り返り：チュートリアルの案件は1日で納品まで進む
await page.goto(pathToFileURL(dist).href);
await page.evaluate(() => localStorage.clear());
await page.reload();
await wait(2500);
await click('はじめる', 2500);
await click('スキップ', 800);
for (const [i, task] of ['構成案', 'ページ実装', '問い合わせフォーム', 'スマホ対応'].entries()) {
  await click(task, 1000);
  await page
    .locator('button:visible', { hasText: i % 2 === 0 ? /^人間/ : /^AI/ })
    .first()
    .click();
  await wait(600);
  await page
    .getByRole('button', { name: '閉じる' })
    .first()
    .click()
    .catch(() => {});
  await wait(600);
}
await click('次の日へ', 500);
await page.locator('button:visible', { hasText: '振り返りを見る' }).first().waitFor({ timeout: 60_000 });
await wait(1500);
await shot('delivered');
await click('振り返りを見る', 3000);
await shot('result');

await browser.close();
