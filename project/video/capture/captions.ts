/**
 * サイトの紹介動画の字幕（WebVTT）を ../public/intro.vtt に書く。ナレーション（src/narration.ts）の caption を、
 * 動画と同じ場面の並び（src/timeline.ts の layout）と、ナレーションの長さ（public/voice/durations.json）で置く
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { narration } from '../src/narration';
import { layout, type VoiceDurations } from '../src/timeline';

const here = dirname(fileURLToPath(import.meta.url));
const voice: VoiceDurations = JSON.parse(readFileSync(resolve(here, '../public/voice/durations.json'), 'utf8'));

/** 秒を WebVTT の時刻（00:00:00.000）にする */
const stamp = (seconds: number) => new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23);

const cues = layout(voice, (id) => narration[id].delay).flatMap((scene) => {
  const length = voice[scene.id];
  if (length === undefined) return [];
  const { text, caption, delay } = narration[scene.id];
  const from = scene.start + delay;
  return [`${stamp(from)} --> ${stamp(from + length)}\n${caption ?? text}`];
});
writeFileSync(resolve(here, '../../public/intro.vtt'), `WEBVTT\n\n${cues.join('\n\n')}\n`);
console.log(`intro.vtt: ${cues.length} 件`);
