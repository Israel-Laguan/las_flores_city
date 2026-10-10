#!/usr/bin/env bash
# AKOOL image generation for content/districts/<district>/locations/<slug>/ backgrounds.
#   base      text-to-image  -> assets/<slug>__default.png   (Krea, 1080p, 3 credits)
#   variants  image-to-image -> assets/<slug>__<variant>.png (Kontext relight of the base, 1080p, 3 credits each)
#   all       base + variants for EVERY location (or one district), resumable
#
# usage:
#   scripts/akool-location-i2i.sh [opts] base     <district> <slug>
#   scripts/akool-location-i2i.sh [opts] variants <district> <slug> <source> <variant>...
#   scripts/akool-location-i2i.sh [opts] all [<district>]
#     <source>   akool.com/share/<code> link, bare share code, public image URL, or `last`
#     <variant>  night | rain | sunset | dawn | overcast
# options (anywhere):
#   --variants a,b,c  variants for `all` (default night,rain,sunset)
#   --scale R         aspect ratio (default 16:9)
#   --similar N       0-1 fidelity to the source for variants (default 0.6)
#   --resolution      1080p (default, cheapest) | 4k (costs more)
#   --until-empty     with `all`: run until credits are gone (checks the balance before every image,
#                     stops when it would drop below --reserve N, default 6)
#   --yes             REQUIRED for `all` to spend credits (without it `all` only prints the plan)
#   --dry-run         print requests, spend nothing
#
# NEVER overwrites: if the target exists the new image is saved as <name>__akool.png,
# then __akool-2.png, ... Existing files are never touched.
# `all` is resumable: finished items are recorded in $AKOOL_BATCH_STATE
# (default ${TMPDIR:-/tmp}/akool-location-batch.done) and skipped on re-run.
# Reads AKOOL_API_KEY from .env (never printed). Writes FILES ONLY (no YAML/DB changes).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCALE="16:9"; SIMILAR="0.6"; RES="1080p"; DRY=0; YES=0; VARS="night,rain,sunset"; UNTIL_EMPTY=0; RESERVE=6; POS=()
DONE_FILE="${AKOOL_BATCH_STATE:-${TMPDIR:-/tmp}/akool-location-batch.done}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scale) SCALE="$2"; shift 2;; --similar) SIMILAR="$2"; shift 2;; --resolution) RES="$2"; shift 2;;
    --variants) VARS="$2"; shift 2;; --yes) YES=1; shift;; --until-empty) UNTIL_EMPTY=1; shift;; --reserve) RESERVE="$2"; shift 2;; --dry-run) DRY=1; shift;;
    --*) echo "unknown option $1" >&2; exit 2;; *) POS+=("$1"); shift;;
  esac
done
set -- "${POS[@]}"
[[ $# -ge 1 ]] || { sed -n '2,28p' "$0"; exit 2; }
MODE="$1"; shift
set -a; . "$ROOT/.env" >/dev/null 2>&1 || true; set +a
[[ -n "${AKOOL_API_KEY:-}" ]] || { echo "AKOOL_API_KEY not set in .env" >&2; exit 1; }
API=https://openapi.akool.com/api/open
DISTRICT=""; SLUG=""; PF=""; ASSETS=""; STATE=""

use_location() { # district slug
  DISTRICT="$1"; SLUG="$2"
  local DIR="$ROOT/content/districts/$DISTRICT/locations/$SLUG"
  PF="$DIR/$SLUG.prompt.md"; ASSETS="$DIR/assets"; STATE="${TMPDIR:-/tmp}/akool-location-$SLUG.url"
  [[ -f "$PF" ]] || { echo "missing $PF" >&2; return 1; }
  [[ -d "$ASSETS" ]] || { echo "missing $ASSETS" >&2; return 1; }
}

variant_text() { # Kontext edits: relight only, keep composition
  local common="Keep the exact same scene, composition, buildings, camera angle and framing. Keep the same art style, linework and painterly soft shading. No people, no text, no logos. Change only the lighting and weather:"
  case "$1" in
    night)    echo "$common night scene with a dark blue sky, but every building stays clearly visible and lit: warm yellow light in the house and shop windows, street lamps and sodium-orange streetlights along the road, a few lit signs and car headlights, visible light spill on the pavement and facades. Lights on in the buildings nearby, not a pitch-black image. Keep the scene readable.";;
    rain)     echo "$common steady rain, overcast diffused grey light, wet reflective streets with puddles, rain streaks, muted desaturated palette.";;
    sunset)   echo "$common golden hour sunset, low warm orange sun, long soft shadows, warm amber glow on facades, peach and violet sky.";;
    dawn)     echo "$common early dawn, pale pink and blue sky, soft cool light, faint mist, quiet empty streets.";;
    overcast) echo "$common flat overcast daylight, soft grey sky, no harsh shadows, muted palette.";;
    *) return 1;;
  esac
}

# variants that would be pointless because the location's own prompt already states that time/weather
skip_tags() { python3 -I - "$PF" <<'EOF'
import sys,re
t=open(sys.argv[1]).read()
p=re.search(r'^## Prompt(?![^\n]*\(Draft\))[^\n]*\n+(.+?)\n\s*\n## ',t,re.S|re.M)
s=(p.group(1) if p else '').lower()
out=[]
if re.search(r'\bnight\b',s): out.append('night')
if re.search(r'\bdawn\b',s): out.append('dawn')
if re.search(r'\b(sunset|dusk|golden hour)\b',s): out.append('sunset')
if re.search(r'\brain',s): out.append('rain')
print(' '.join(out))
EOF
}

build_body() { # variant-text source-url
  python3 -I - "$PF" "$MODE_KIND" "$SCALE" "$RES" "$SIMILAR" "${1:-}" "${2:-}" <<'EOF'
import sys,re,json
pf,mode,scale,res,sim,vtext,src=sys.argv[1:8]
t=open(pf).read()
neg=re.search(r'## Negative Prompt[ \t]*\n+(.+?)\n\s*\n## ',t,re.S)
neg=re.sub(r'^--no\s*','',neg.group(1).strip()) if neg else ''
if mode=='base':
    p=re.search(r'^## Prompt(?![^\n]*\(Draft\))[^\n]*\n+(.+?)\n\s*\n## ',t,re.S|re.M)  # accepts '## Prompt — Base/Refined', skips '(Draft)'
    if not p: sys.exit('no "## Prompt" section in '+pf)
    b={"prompt":p.group(1).strip(),"scale":scale,"resolution":res,"batch_quantity":1}
else:
    b={"prompt":vtext,"source_images":[src],"scale":scale,"resolution":res,"similar":float(sim),"batch_quantity":1}
if neg: b["negative_prompt"]=neg
print(json.dumps(b))
EOF
}

free_path() { # never overwrite: foo.png -> foo__akool.png -> foo__akool-2.png ...
  local out="$1" base="${1%.png}" n=2
  [[ ! -e "$out" ]] && { echo "$out"; return; }
  out="${base}__akool.png"
  while [[ -e "$out" ]]; do out="${base}__akool-$n.png"; n=$((n+1)); done
  echo "$out"
}

# submit + poll + download. args: body wanted-path. Sets LAST_OK=1 on success and writes $STATE.
run_job() {
  local BODY="$1" WANT="$2" OUT R ID I S URL TMP
  LAST_OK=0
  [[ -n "$BODY" ]] || { echo "empty request body, skipping" >&2; return 0; }
  if [[ $DRY -eq 1 ]]; then python3 -I -c 'import sys,json;d=json.load(sys.stdin);print("   [dry-run]", "image-to-image (Kontext)" if d.get("source_images") else "text-to-image (Krea)", "|", d["scale"], d["resolution"], "| negative:", len(d.get("negative_prompt","")), "chars");print("   [dry-run] prompt:", d["prompt"][:300])' <<<"$BODY"; return 0; fi
  OUT="$(free_path "$WANT")"; [[ "$OUT" == "$WANT" ]] || echo "   $(basename "$WANT") exists -> new image will be saved as $(basename "$OUT")"
  R=$(curl -sS -m 60 -X POST "$API/v4/content/image/createBySourcePrompt" -H "x-api-key: $AKOOL_API_KEY" -H 'Content-Type: application/json' -d "$BODY")
  ID=$(python3 -I -c 'import sys,json;d=json.load(sys.stdin);x=d.get("data");print(x["_id"] if isinstance(x,dict) else "")' <<<"$R" 2>/dev/null || true)
  [[ -n "$ID" ]] || { echo "   rejected: $R" | cut -c1-300; return 0; }
  echo "   job $ID (reported credits: $(python3 -I -c 'import sys,json;print(json.load(sys.stdin)["data"].get("deduction_credit"))' <<<"$R"))"
  for _ in $(seq 1 60); do
    sleep 5
    I=$(curl -sS -m 30 -H "x-api-key: $AKOOL_API_KEY" "$API/v3/content/image/infobymodelid?image_model_id=$ID")
    S=$(python3 -I -c 'import sys,json;print(json.load(sys.stdin)["data"].get("image_status"))' <<<"$I")
    if [[ "$S" == 3 ]]; then
      URL=$(python3 -I -c 'import sys,json;print(json.load(sys.stdin)["data"]["image"])' <<<"$I")
      TMP="$(mktemp --suffix=.jpg)"; curl -sS -m 90 -o "$TMP" "$URL"
      OUT="$(free_path "$WANT")"   # re-check: never clobber anything created while we waited
      python3 -I -c 'import sys;from PIL import Image;Image.open(sys.argv[1]).save(sys.argv[2])' "$TMP" "$OUT" 2>/dev/null \
        || { command -v magick >/dev/null && magick "$TMP" "$OUT"; } || { command -v convert >/dev/null && convert "$TMP" "$OUT"; }
      rm -f "$TMP"; echo "   saved $OUT"; echo "$URL" > "$STATE"; LAST_OK=1; return 0
    fi
    [[ "$S" == 4 ]] && { echo "   generation failed (job $ID)"; return 0; }
  done
  echo "   timed out waiting for job $ID"
}

balance() { curl -sS -m 20 -H "x-api-key: $AKOOL_API_KEY" "$API/v3/faceswap/quota/info" | python3 -I -c 'import sys,json;print(json.load(sys.stdin)["data"]["credit"])' 2>/dev/null || echo ""; }
out_of_credits() { # true when --until-empty and balance < 3 + reserve (or unknown)
  [[ $UNTIL_EMPTY -eq 1 ]] || return 1
  local b; b="$(balance)"; [[ -n "$b" ]] || { echo "!! cannot read balance, stopping" >&2; return 0; }
  [[ "$b" -lt $((3+RESERVE)) ]] && { echo "== stopping: balance $b is below the reserve" >&2; return 0; }
  return 1
}

resolve_source() { # -> IMG
  local SRC="$1" CODE=""
  if [[ "$SRC" == last ]]; then [[ -f "$STATE" ]] || { echo "no saved URL for $SLUG; run base first or pass a source" >&2; return 1; }; IMG="$(cat "$STATE")"; return 0
  elif [[ "$SRC" =~ akool\.com/share/([A-Za-z0-9]+) ]]; then CODE="${BASH_REMATCH[1]}"
  elif [[ "$SRC" =~ ^[A-Za-z0-9]{8,16}$ ]]; then CODE="$SRC"; else IMG="$SRC"; return 0; fi
  IMG=$(curl -sS -m 30 "https://akool.com/interface/content-api/api/v6/content/share/check?code=$CODE" | python3 -I -c 'import sys,json;print(json.load(sys.stdin)["data"]["temp_url"])')
}

do_base()    { MODE_KIND=base; echo " base -> ${SLUG}__default.png (text-to-image)"; run_job "$(build_body)" "$ASSETS/${SLUG}__default.png"; }
do_variant() { MODE_KIND=variant; local v="$1" vt; vt="$(variant_text "$v")" || { echo "unknown variant '$v'" >&2; return 1; }
               echo " $v -> ${SLUG}__${v}.png (image-to-image)"; run_job "$(build_body "$vt" "$IMG")" "$ASSETS/${SLUG}__${v}.png"; }

case "$MODE" in
  base)
    [[ $# -ge 2 ]] || { echo "usage: base <district> <slug>" >&2; exit 2; }
    use_location "$1" "$2"; do_base;;
  variants)
    [[ $# -ge 4 ]] || { echo "usage: variants <district> <slug> <source> <variant>..." >&2; exit 2; }
    use_location "$1" "$2"; resolve_source "$3"; shift 3
    echo "source: $IMG  scale: $SCALE  resolution: $RES  similar: $SIMILAR"
    for v in "$@"; do do_variant "$v"; done;;
  all)
    ONLY="${1:-}"; IFS=',' read -ra VLIST <<<"$VARS"
    ITEMS=(); PLAN=0
    for pf in "$ROOT"/content/districts/${ONLY:-*}/locations/*/*.prompt.md; do
      [[ -f "$pf" ]] || continue
      slug="$(basename "$pf" .prompt.md)"; dist="$(basename "$(dirname "$(dirname "$(dirname "$pf")")")")"
      ITEMS+=("$dist/$slug")
    done
    [[ ${#ITEMS[@]} -gt 0 ]] || { echo "no locations found${ONLY:+ in district $ONLY}" >&2; exit 1; }
    touch "$DONE_FILE" 2>/dev/null || true
    echo "== plan: ${#ITEMS[@]} locations, variants: ${VLIST[*]}, resumable state: $DONE_FILE"
    for it in "${ITEMS[@]}"; do
      use_location "${it%%/*}" "${it##*/}" || continue
      sk=" $(skip_tags) "; n=0; skipped=""
      grep -qxF "$it base" "$DONE_FILE" 2>/dev/null || n=$((n+1))
      for v in "${VLIST[@]}"; do
        if [[ "$sk" == *" $v "* ]]; then skipped+="$v "; continue; fi
        grep -qxF "$it $v" "$DONE_FILE" 2>/dev/null || n=$((n+1))
      done
      PLAN=$((PLAN+n)); echo "   $it: $n image(s)${skipped:+  (skipping variants already in its prompt: $skipped)}"
    done
    echo "== TOTAL: $PLAN images ~ $((PLAN*3)) credits at 1080p (3 each; reported cost can understate the balance by a few credits)"
    BAL="$(curl -sS -m 20 -H "x-api-key: $AKOOL_API_KEY" "$API/v3/faceswap/quota/info" | python3 -I -c 'import sys,json;print(json.load(sys.stdin)["data"]["credit"])' 2>/dev/null || true)"; echo "== current balance: ${BAL:-unknown}"
    if [[ -n "${BAL:-}" && $((PLAN*3)) -gt "$BAL" ]]; then echo "!! plan exceeds the balance; narrow it with <district> or --variants" >&2; [[ $YES -eq 1 && $DRY -eq 0 && $UNTIL_EMPTY -eq 0 ]] && exit 1; fi
    if [[ $DRY -eq 1 || $YES -ne 1 ]]; then echo "(nothing spent: pass --yes to run for real)"; exit 0; fi
    for it in "${ITEMS[@]}"; do
      use_location "${it%%/*}" "${it##*/}" || continue
      out_of_credits && break
      echo "### $it"; sk=" $(skip_tags) "; IMG=""
      if grep -qxF "$it base" "$DONE_FILE" 2>/dev/null; then [[ -f "$STATE" ]] && IMG="$(cat "$STATE")"
      else out_of_credits && break; do_base; if [[ $LAST_OK -eq 1 ]]; then echo "$it base" >> "$DONE_FILE"; IMG="$(cat "$STATE")"; fi; fi
      [[ -n "$IMG" ]] || { echo " no base URL for $it: variants skipped (re-run to retry)"; continue; }
      for v in "${VLIST[@]}"; do
        [[ "$sk" == *" $v "* ]] && continue
        grep -qxF "$it $v" "$DONE_FILE" 2>/dev/null && continue
        out_of_credits && break 2
        do_variant "$v"; [[ $LAST_OK -eq 1 ]] && echo "$it $v" >> "$DONE_FILE"
      done
    done
    echo "== done. Balance: GET /api/open/v3/faceswap/quota/info (the CLI fails when .env is loaded)";;
  *) echo "mode must be base|variants|all" >&2; exit 2;;
esac
echo "reminder: view every result; add variants to background_urls[] via the asset publish workflow. Balance: GET /api/open/v3/faceswap/quota/info (the CLI fails when .env is loaded)"
