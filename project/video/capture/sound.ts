/**
 * 紹介動画の BGM と効果音を書き出す。ゲームの Vite 開発サーバーで capture/sound.html を開き、
 * public/audio/sfx/<id>.wav（src/sound.ts の効果音）と public/audio/bgm.wav（場面に合わせて勢いを変えた BGM）を作る。
 * BGM は場面の長さに合わせるので、先に `npm run capture:voice` でナレーションを作っておく。
 * Chromium は CHROMIUM_PATH で指定する（省略すると playwright-core の既定）
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { narration } from '../src/narration';
import { sfxIds } from '../src/sound';
import { layout, totalSeconds, type VoiceDurations } from '../src/timeline';

const here = dirname(fileURLToPath(import.meta.url));
const game = resolve(here, '../..');
const out = resolve(here, '../public/audio');
mkdirSync(resolve(out, 'sfx'), { recursive: true });

const durationsFile = resolve(here, '../public/voice/durations.json');
const voice: VoiceDurations = existsSync(durationsFile) ? JSON.parse(readFileSync(durationsFile, 'utf8')) : {};
const placed = layout(voice, (id) => narration[id].delay);
const cues = placed.map((s) => ({ at: s.start, momentum: s.momentum, streak: s.streak ?? false }));
// 終わりのフェードアウトの分だけ長めに録る
const seconds = totalSeconds(placed) + 1;

/** capture/sound-page.ts が window に置く関数 */
interface SoundPage {
  renderSfx(id: string): Promise<string>;
  recordBgm(c: typeof cues, s: number): Promise<string>;
}

const PORT = 5199;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: game, stdio: 'pipe' });
await new Promise<void>((ready, fail) => {
  server.stdout.on('data', (d: Buffer) => d.toString().includes('Local:') && ready());
  server.on('exit', (code) => fail(new Error(`vite exited: ${code}`)));
});

try {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(`http://localhost:${PORT}/video/capture/sound.html`);
  await page.waitForFunction(() => 'renderSfx' in window);

  for (const id of sfxIds) {
    const wav = await page.evaluate((id) => (window as unknown as SoundPage).renderSfx(id), id);
    writeFileSync(resolve(out, 'sfx', `${id}.wav`), Buffer.from(wav, 'base64'));
    console.log('sfx', id);
  }

  console.log(`bgm: ${seconds.toFixed(1)} 秒を録音する`);
  const webm = await page.evaluate(([cues, seconds]) => (window as unknown as SoundPage).recordBgm(cues, seconds), [
    cues,
    seconds,
  ] as const);
  writeFileSync(resolve(out, 'bgm.webm'), Buffer.from(webm, 'base64'));
  await browser.close();
} finally {
  server.kill();
}

// Remotion で扱いやすい WAV にする（Remotion に同梱の ffmpeg を使う）
await new Promise<void>((done, fail) => {
  const ff = spawn(
    'npx',
    ['remotion', 'ffmpeg', '-loglevel', 'error', '-y', '-i', 'bgm.webm', '-ar', '48000', 'bgm.wav'],
    {
      cwd: out,
      stdio: 'inherit',
    },
  );
  ff.on('exit', (code) => (code === 0 ? done() : fail(new Error(`ffmpeg exited: ${code}`))));
});
console.log('bgm.wav');
