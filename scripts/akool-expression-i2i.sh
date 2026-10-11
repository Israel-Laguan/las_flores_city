#!/usr/bin/env bash
# Generate expression variants of a character portrait with the cheapest AKOOL
# image-to-image path (direct API, Flux Kontext, 1080p, 1 image = 3 credits).
#
# usage: scripts/akool-expression-i2i.sh [options] <character_slug> <source> <expression>...
#   <source>      akool.com/share/<code> link, bare share code, or a public image URL
#   <expression>  a name from the `**`__<name>.png`**` bullets in the character's .prompt.md
# options:
#   --scale R     aspect ratio (default: taken from the share link, else 3:4)
#   --similar N   0-1 fidelity to the source (default 0.6)
#   --resolution  1080p (default, cheapest) | 4k (costs more)
#   --force       overwrite an existing assets/<slug>__<expression>.png (old file is copied to $TMPDIR first)
#   --dry-run     print what would be sent; spends no credits
#
# Reads AKOOL_API_KEY from .env (never printed). Saves PNGs to
# content/characters/<slug>/assets/<slug>__<expression>.png
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCALE=""; SIMILAR="0.6"; RES="1080p"; FORCE=0; DRY=0
POS=()
while [[ $# -gt 0 ]]; do   # options may appear anywhere
  case "$1" in
    --scale) SCALE="$2"; shift 2;;
    --similar) SIMILAR="$2"; shift 2;;
    --resolution) RES="$2"; shift 2;;
    --force) FORCE=1; shift;;
    --dry-run) DRY=1; shift;;
    --*) echo "unknown option $1" >&2; exit 2;;
    *) POS+=("$1"); shift;;
  esac
done
set -- "${POS[@]}"
[[ $# -ge 3 ]] || { sed -n '2,17p' "$0"; exit 2; }
SLUG="$1"; SRC="$2"; shift 2
DIR="$ROOT/content/characters/$SLUG"; PF="$DIR/$SLUG.prompt.md"; ASSETS="$DIR/assets"
[[ -f "$PF" ]] || { echo "missing $PF" >&2; exit 1; }
[[ -d "$ASSETS" ]] || { echo "missing $ASSETS" >&2; exit 1; }

set -a; . "$ROOT/.env" >/dev/null 2>&1 || true; set +a
[[ -n "${AKOOL_API_KEY:-}" ]] || { echo "AKOOL_API_KEY not set in .env" >&2; exit 1; }
API=https://openapi.akool.com/api/open

# Resolve the source image URL (share link/code -> public CloudFront PNG)
CODE=""
if [[ "$SRC" =~ akool\.com/share/([A-Za-z0-9]+) ]]; then CODE="${BASH_REMATCH[1]}"
elif [[ "$SRC" =~ ^[A-Za-z0-9]{8,16}$ ]]; then CODE="$SRC"; fi
if [[ -n "$CODE" ]]; then
  J=$(curl -sS -m 30 "https://akool.com/interface/content-api/api/v6/content/share/check?code=$CODE")
  IMG=$(python3 -I -c 'import sys,json;print(json.load(sys.stdin)["data"]["temp_url"])' <<<"$J")
  [[ -n "$SCALE" ]] || SCALE=$(python3 -I -c 'import sys,json;d=json.load(sys.stdin)["data"];print(json.loads(d["source_data"]).get("scale",""))' <<<"$J" 2>/dev/null || true)
else IMG="$SRC"; fi
SCALE="${SCALE:-3:4}"
echo "source: $IMG  scale: $SCALE  resolution: $RES  similar: $SIMILAR"

for EXPR in "$@"; do
  EXPR="${EXPR#__}"; OUT="$ASSETS/${SLUG}__${EXPR}.png"
  BODY=$(python3 -I - "$PF" "$EXPR" "$IMG" "$SCALE" "$RES" "$SIMILAR" <<'EOF'
import sys,re,json
pf,expr,img,scale,res,sim=sys.argv[1:7]
t=open(pf).read()
m=re.search(r'^- \*\*`__'+re.escape(expr)+r'\.png`\*\*: (.+)$',t,re.M)
if not m: sys.exit("expression '%s' not found in %s" % (expr,pf))
n=re.search(r'## Negative Prompt\n\n(.+?)\n\n## ',t,re.S)
neg=re.sub(r'^--no\s*','',n.group(1).strip()) if n else ''
b={"prompt":m.group(1).strip(),"source_images":[img],"scale":scale,"resolution":res,"similar":float(sim),"batch_quantity":1}
if neg: b["negative_prompt"]=neg
print(json.dumps(b))
EOF
  ) || exit 1
  echo "== $EXPR -> $OUT"
  if [[ $DRY -eq 1 ]]; then python3 -I -c 'import sys,json;d=json.load(sys.stdin);print("[dry-run] prompt:",d["prompt"]);print("[dry-run] negative:",d.get("negative_prompt","")[:80],"...")' <<<"$BODY"; continue; fi
  if [[ -e "$OUT" && $FORCE -ne 1 ]]; then echo "exists, skipping (use --force)"; continue; fi
  R=$(curl -sS -m 60 -X POST "$API/v4/content/image/createBySourcePrompt" -H "x-api-key: $AKOOL_API_KEY" -H 'Content-Type: application/json' -d "$BODY")
  ID=$(python3 -I -c 'import sys,json;d=json.load(sys.stdin);x=d.get("data");print(x["_id"] if isinstance(x,dict) else "")' <<<"$R" 2>/dev/null || true)
  [[ -n "$ID" ]] || { echo "rejected: $R" | cut -c1-300; continue; }
  echo "job $ID (reported credits: $(python3 -I -c 'import sys,json;print(json.load(sys.stdin)["data"].get("deduction_credit"))' <<<"$R"))"
  for _ in $(seq 1 60); do
    sleep 5
    I=$(curl -sS -m 30 -H "x-api-key: $AKOOL_API_KEY" "$API/v3/content/image/infobymodelid?image_model_id=$ID")
    S=$(python3 -I -c 'import sys,json;print(json.load(sys.stdin)["data"].get("image_status"))' <<<"$I")
    if [[ "$S" == 3 ]]; then
      URL=$(python3 -I -c 'import sys,json;print(json.load(sys.stdin)["data"]["image"])' <<<"$I")
      TMP="$(mktemp --suffix=.jpg)"; curl -sS -m 90 -o "$TMP" "$URL"
      if [[ -e "$OUT" ]]; then mkdir -p "${TMPDIR:-/tmp}/akool-backups"; cp "$OUT" "${TMPDIR:-/tmp}/akool-backups/$(basename "$OUT").$(date +%s)"; fi
      python3 -I -c 'import sys;from PIL import Image;Image.open(sys.argv[1]).save(sys.argv[2])' "$TMP" "$OUT" 2>/dev/null \
        || { command -v magick >/dev/null && magick "$TMP" "$OUT"; } || { command -v convert >/dev/null && convert "$TMP" "$OUT"; }
      if [[ -f "$OUT" ]]; then rm -f "$TMP"; echo "saved $OUT"; else echo "conversion failed; raw download kept at $TMP" >&2; fi; break
    fi
    [[ "$S" == 4 ]] && { echo "generation failed (job $ID)"; break; }
  done
done
echo "reminder: check the result by eye; poses often drift. Balance: akool-cli credit"
