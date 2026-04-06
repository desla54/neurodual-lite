#!/usr/bin/env bash
set -euo pipefail

INPUT="${1:?usage: scripts/make_promo_video.sh <input-video> [output-video]}"
OUTPUT="${2:-output/promo/neurodual-promo-draft.mp4}"
FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

mkdir -p "$(dirname "$OUTPUT")"

ffmpeg -y \
  -ss 0.8 -t 3.8 -i "$INPUT" \
  -ss 7.6 -t 4.2 -i "$INPUT" \
  -ss 18.0 -t 5.0 -i "$INPUT" \
  -ss 47.8 -t 4.2 -i "$INPUT" \
  -ss 89.0 -t 5.4 -i "$INPUT" \
  -filter_complex "\
[0:v]crop=1080:1920:0:(ih-1920)/2,fps=30,setsar=1,\
drawbox=x=56:y=1358:w=968:h=260:color=white@0.62:t=fill,\
drawtext=fontfile=${FONT}:text='NeuroDual':x=78:y=1412:fontsize=62:fontcolor=black,\
drawtext=fontfile=${FONT}:text='Brain training':x=82:y=1488:fontsize=34:fontcolor=0x444444,\
fade=t=in:st=0:d=0.35,fade=t=out:st=3.45:d=0.35[v0];\
[1:v]crop=1080:1920:0:(ih-1920)/2,fps=30,setsar=1,\
drawbox=x=56:y=1460:w=968:h=122:color=white@0.56:t=fill,\
drawtext=fontfile=${FONT}:text='Start a session in seconds':x=82:y=1503:fontsize=36:fontcolor=black,\
fade=t=in:st=0:d=0.35,fade=t=out:st=3.85:d=0.35[v1];\
[2:v]crop=1080:1920:0:(ih-1920)/2,fps=30,setsar=1,\
drawbox=x=56:y=1460:w=968:h=122:color=white@0.54:t=fill,\
drawtext=fontfile=${FONT}:text='Stay with the cues':x=82:y=1503:fontsize=36:fontcolor=black,\
fade=t=in:st=0:d=0.35,fade=t=out:st=4.65:d=0.35[v2];\
[3:v]crop=1080:1920:0:(ih-1920)/2,fps=30,setsar=1,\
drawbox=x=56:y=1460:w=968:h=122:color=white@0.54:t=fill,\
drawtext=fontfile=${FONT}:text='Visual and audio modes':x=82:y=1503:fontsize=36:fontcolor=black,\
fade=t=in:st=0:d=0.35,fade=t=out:st=3.85:d=0.35[v3];\
[4:v]crop=1080:1920:0:(ih-1920)/2,fps=30,setsar=1,\
drawbox=x=56:y=1460:w=968:h=122:color=white@0.58:t=fill,\
drawtext=fontfile=${FONT}:text='Track progress instantly':x=82:y=1503:fontsize=36:fontcolor=black,\
fade=t=in:st=0:d=0.35,fade=t=out:st=5.05:d=0.35[v4];\
[v0][v1]xfade=transition=fade:duration=0.35:offset=3.45[x1];\
[x1][v2]xfade=transition=fade:duration=0.35:offset=7.30[x2];\
[x2][v3]xfade=transition=fade:duration=0.35:offset=11.95[x3];\
[x3][v4]xfade=transition=fade:duration=0.35:offset=15.80,format=yuv420p[v]" \
  -map "[v]" \
  -an \
  -c:v libx264 \
  -crf 18 \
  -preset medium \
  -movflags +faststart \
  "$OUTPUT"
