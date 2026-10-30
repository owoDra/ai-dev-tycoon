#!/usr/bin/env bash
set -euo pipefail

# Replaces the final hosted-play CTA after 55.8 s with a URL-free title card.
# The new card retains the VOICEVOX credit even when the video is shared alone.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
video="${INTRO_VIDEO:-$repo_root/project/public/intro.mp4}"
cut="${INTRO_CUT_SECONDS:-55.8}"
slate="${INTRO_SLATE_SECONDS:-3.0}"
font="$(fc-match -f '%{file}\n' 'Noto Sans CJK JP:lang=ja' | head -n 1)"
if [[ ! -f "$video" || ! -f "$font" ]]; then
  echo 'Missing intro video or Japanese font' >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
printf '%s\n' 'AI業務改善タイクーン' > "$tmp/title.txt"
printf '%s\n' '人とAIの仕事を、ゲームで考える。' > "$tmp/subtitle.txt"
printf '%s\n' 'VOICEVOX:ずんだもん' > "$tmp/credit.txt"

width="$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$video")"
height="$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$video")"
duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$video")"
python3 - "$duration" "$cut" <<'PY'
import sys
original, cut = map(float, sys.argv[1:])
if original < cut + 2:
    raise SystemExit(f'Unexpected video duration {original}; refusing to edit at {cut}s')
PY

ffmpeg -hide_banner -loglevel error -y -i "$video" \
  -f lavfi -i "color=c=0xfff4e8:s=${width}x${height}:r=30:d=${slate}" \
  -f lavfi -i 'anullsrc=channel_layout=stereo:sample_rate=48000' \
  -filter_complex "[0:v]trim=end=${cut},setpts=PTS-STARTPTS,fps=30,format=yuv420p[mainv];\
[0:a]atrim=end=${cut},asetpts=PTS-STARTPTS,aformat=channel_layouts=stereo:sample_rates=48000[maina];\
[1:v]drawtext=fontfile='${font}':textfile='${tmp}/title.txt':fontcolor=0x2a1b3d:fontsize=76:x=(w-text_w)/2:y=h*0.34,\
drawtext=fontfile='${font}':textfile='${tmp}/subtitle.txt':fontcolor=0x5f4d73:fontsize=42:x=(w-text_w)/2:y=h*0.52,\
drawtext=fontfile='${font}':textfile='${tmp}/credit.txt':fontcolor=0x5f4d73:fontsize=30:x=(w-text_w)/2:y=h*0.89,format=yuv420p[cardv];\
[2:a]atrim=end=${slate},asetpts=PTS-STARTPTS[carda];\
[mainv][maina][cardv][carda]concat=n=2:v=1:a=1[v][a]" \
  -map '[v]' -map '[a]' -c:v libx264 -preset veryfast -crf 24 \
  -pix_fmt yuv420p -c:a aac -b:a 160k -ar 48000 -ac 2 \
  -movflags +faststart "$tmp/intro.mp4"

ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmp/intro.mp4"
mv "$tmp/intro.mp4" "$video"
