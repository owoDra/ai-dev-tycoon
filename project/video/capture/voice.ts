/**
 * ナレーション（src/narration.ts）を VOICEVOX で読み上げ、public/voice/<場面>.wav と長さの一覧（durations.json）を作る。
 * VOICEVOX エンジンを先に起動しておく（例：docker run --rm -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest）。
 * エンジンの場所は VOICEVOX_URL で変えられる
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { narration, VOICE_SPEAKER } from '../src/narration';
import type { SceneId, VoiceDurations } from '../src/timeline';

const engine = process.env.VOICEVOX_URL ?? 'http://127.0.0.1:50021';
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/voice');
mkdirSync(out, { recursive: true });

/** WAV（PCM）の長さ（秒）。fmt と data のチャンクを読む */
function wavSeconds(wav: Buffer): number {
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === 'fmt ') byteRate = wav.readUInt32LE(offset + 16);
    if (id === 'data') return size / byteRate;
    offset += 8 + size;
  }
  throw new Error('WAV の data チャンクがない');
}

const durations: VoiceDurations = {};
for (const [scene, { text }] of Object.entries(narration) as [SceneId, { text: string }][]) {
  const params = new URLSearchParams({ text, speaker: String(VOICE_SPEAKER) });
  const query = await (await fetch(`${engine}/audio_query?${params}`, { method: 'POST' })).json();
  // 動画のテンポに合わせて少し速く・明るく
  query.speedScale = 1.12;
  query.pitchScale = 0.02;
  query.intonationScale = 1.15;
  query.prePhonemeLength = 0.05;
  query.postPhonemeLength = 0.1;
  query.outputSamplingRate = 48000;
  const res = await fetch(`${engine}/synthesis?speaker=${VOICE_SPEAKER}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!res.ok) throw new Error(`synthesis failed: ${scene} ${res.status}`);
  const wav = Buffer.from(await res.arrayBuffer());
  writeFileSync(resolve(out, `${scene}.wav`), wav);
  durations[scene] = Math.round(wavSeconds(wav) * 1000) / 1000;
  console.log(scene, durations[scene]);
}
writeFileSync(resolve(out, 'durations.json'), `${JSON.stringify(durations, null, 2)}\n`);
