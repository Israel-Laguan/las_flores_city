# Akool Image CLI Tutorial

This guide covers AKOOL image and video generation through the CLI, the direct API and the MCP. Sections were tested on different dates: CLI and early API numbers are from **2026-07-01**; MCP, direct API, video and share-link findings are from **2026-10-09**. Dated figures are the last measurement, not a current price.

## Prerequisites

1. Install the CLI:
   ```bash
   curl -fsSL https://static.website-files.org/raw-cli/cli/install.sh | bash
   ```

2. Authenticate (choose one):
   ```bash
   # Environment variables (recommended for automation)
   export AKOOL_CLIENT_ID="your-client-id"
   export AKOOL_CLIENT_SECRET="your-client-secret"

   # Or interactive login
   akool-cli login
   ```

3. Verify credentials and check balance:
   ```bash
   akool-cli credit
   ```

   Example output (2026-07-01):
   ```
   ┌──────┬─────────┐
   │ Code │ Credits │
   ├──────┼─────────┤
   │ 1000 │ 898     │
   └──────┴─────────┘
   ```

> **Gotcha (2026-10-09):** `akool-cli` works from a clean environment, but fails with `Failed to get token: Unknown error` when the project `.env` is loaded into the shell (it sets `AKOOL_CLIENT_ID` and `AKOOL_API_KEY`, and the CLI reads different names). Run the CLI in a clean env (`env -i HOME=$HOME PATH=$PATH akool-cli ...`) or check the balance through the API instead.

## Quick Start

### Text-to-Image

Generate an image from a text prompt:

```bash
akool-cli --json image generate \
  --prompt "Cyberpunk street level view of Las Flores at dusk, neon, rain slick streets, cinematic" \
  --scale 16:9 \
  --wait
```

**Flags explained:**
| Flag | Purpose |
|------|---------|
| `--json` | Output raw JSON for scripting |
| `--prompt` | Your image description |
| `--scale` | Aspect ratio (`1:1`, `4:3`, `16:9`, etc.) |
| `--wait` | Block until generation completes |

**Sample JSON response:**
```json
{
  "code": 1000,
  "msg": "OK",
  "data": {
    "_id": "6a459ebcc190cf8757f2bdd5",
    "task_id": "e7dee1c365fb40e18a3e3440259fadf3",
    "model_name": "wavespeed-ai/flux-krea-dev-lora",
    "deduction_credit": 8,
    "upscaled_urls": [
      "https://d2qf6ukcym4kn9.cloudfront.net/1782947550751-4a47aba9-071b-45c3-884a-44eb933e80c7-1894.jpeg"
    ],
    "image_status": 3
  }
}
```

Key fields:
- `_id` / `task_id` — Use these to poll for results
- `upscaled_urls[0]` — The generated image URL
- `deduction_credit` — Credits consumed

### Image-to-Image

Transform an existing image:

```bash
akool-cli --json image generate \
  --prompt "Style transfer: convert to restored 1950s Kodachrome photograph, warm tones, grain, vintage" \
  --source-image "https://d2qf6ukcym4kn9.cloudfront.net/1782947550751-4a47aba9-071b-45c3-884a-44eb933e80c7-1894.jpeg" \
  --scale 1:1 \
  --wait
```

The `--source-image` URL comes from the text-to-image result above.

## Polling (Without `--wait`)

If you need non-blocking operation:

```bash
akool-cli --json image result --id "6a459ebcc190cf8757f2bdd5"
```

`image_status` values:
- `1` = queued
- `2` = processing
- `3` = completed
- `4` = failed

## Credit Tracking

Check balance before and after:
```bash
akool-cli credit
```

**Live test results (2026-07-01):**
- Starting credits: 898
- After 2 CLI generations: 882 (8 credits each)
- After 1 direct API call: 878 (4 credits)
- Cost per generation via CLI: 8 credits
- Cost per generation via direct API: 4 credits

> **Note:** The API docs show `deduction_credit: 1` as an example, but actual costs vary (see Pricing Notes). There is no CLI command to check pricing before generating. The 8-credit CLI figure is from 2026-07-01 and has not been re-measured since.

## Environment Options

Switch between environments:
```bash
akool-cli -e test credit      # Test environment (may be unavailable)
akool-cli -e dev credit       # Development environment
```

> **Note:** The test environment may fail with "Failed to get token: Unknown error". Use `prod` (default) if this occurs.

## Production Images

The 2026-07-01 test images are **no longer in the repo** (`content/lore/shared/akool-test/` does not exist). The 2026-10-09 test outputs are in the scratchpad only; keep the job `_id`s if you need one again.

## Reading Credentials from .env

The project `.env` (gitignored) currently defines:
```bash
# .env file (names only; never print the values)
AKOOL_CLIENT_ID=...
AKOOL_API_KEY=...
```
The direct API authenticates with the `x-api-key` header from `AKOOL_API_KEY`. The MCP and the CLI use `AKOOL_CLIENT_ID` / `AKOOL_CLIENT_SECRET`. There is no `AKOOL_API_SECRET`, and `.env` has no client secret, so use the API key for scripts.

**Bash + curl (simplest):**
```bash
source .env && curl --location 'https://openapi.akool.com/api/open/v4/content/image/createBySourcePrompt' \
  --header "x-api-key: $AKOOL_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"prompt": "A serene mountain lake", "scale": "16:9"}'
```

**Python (with python-dotenv):**
```python
from dotenv import load_dotenv; import os, requests
load_dotenv()
requests.post('https://openapi.akool.com/api/open/v4/content/image/createBySourcePrompt',
  headers={'x-api-key': os.getenv('AKOOL_API_KEY'), 'Content-Type': 'application/json'},
  json={'prompt': 'A serene mountain lake', 'scale': '16:9'})
```

## Free Alternative: Pollinations AI

> **Not re-tested** since the original 2026-07-01 writeup. Check the endpoints before relying on them.

For prototyping or unlimited usage, use Pollinations AI:

**Legacy API (free, no auth):**
```bash
curl -s "https://image.pollinations.ai/prompt/Cyberpunk%20city?model=flux&width=512&height=512" -o image.jpg
```

**New API (requires key):**
```bash
curl -s "https://gen.pollinations.ai/image/Cyberpunk%20city?model=flux&width=512&height=512&key=YOUR_KEY" -o image.jpg
```

**Get API key:** [enter.pollinations.ai](https://enter.pollinations.ai)

## Using Las Flores Prompts

The project's `docs/lore/guides/prompt_library/prompt_library.md` contains ready-made prompts. To adapt for Pollinations:

1. Remove trailing `--no` negative prompts
2. Use `model=flux` for photorealistic outputs
3. Add `photorealistic, 8k` for quality

**Quick adaptation:**
```bash
# From prompt library
prompt="Cyberpunk street level view of Las Flores at dusk..."

# Pollinations URL
curl -s "https://gen.pollinations.ai/image/$(echo "$prompt" | jq -sRr @uri)?model=flux&width=512&height=512" -o image.jpg
```

## AKOOL MCP (cheapest path tested)

AKOOL also exposes an MCP server (`https://openapi.akool.com/mcp/v1`, auth via `x-client-id` / `x-client-secret` headers — same credentials as the CLI). Add it to Claude Code with:

```bash
claude mcp add akool-mcp https://openapi.akool.com/mcp/v1 \
  --header "x-client-id: $AKOOL_CLIENT_ID" \
  --header "x-client-secret: $AKOOL_CLIENT_SECRET"
```

Image tools: `account_credit`, `image_create`, `image_info`, `image_upscale`.

**Live test (2026-10-09):**
- Text-to-image (`image_create`, `scale: 3:4`): 3 credits, model `wavespeed-ai/flux-krea-dev-lora`.
- Image-to-image (`image_create` + `source_image`): 3 credits, model `wavespeed-ai/flux-kontext-dev`.
- Balance went 940 → 937 after the first generation.

**Gotchas:**
- `image_create` has **no model parameter** — the server picks the model. `account_models` only lists video (1501/1502) and character-swap (2101) models, so the "Akool Basic, `requiresPay: false`" tier cannot be tested for images through the MCP.
- No negative-prompt field; fold the `--no ...` terms into the prompt text.
- `source_image` must be a **public URL** the AKOOL servers can fetch (local files and `s3://` / `minio:9000` paths do not work). Use the CloudFront URL AKOOL returns from an earlier result, or upload the file somewhere temporary.
- `image_create` returns immediately with `image_status: 1`. A job takes ~40 s: poll `image_info` until `image_status: 3`. The URL only appears then, in `image` / `upscaled_urls[0]`. Status `2` (processing) has **no URL yet** — do not conclude the MCP hides it.
- The result is a JPEG (864x1152 for `3:4`), not a PNG; convert before saving as `.png`.

**Quality note (image-to-image, `carlos_lacan__vulnerable__akool.png`):** identity, art style and backdrop carried over well from `carlos_lacan__default.png`, but the poses/expressions in the `.prompt.md` "Expression Variants" were not followed (broad grin instead of a faltering smile; hands on hip instead of rubbing the arm). The "Use the base portrait as reference ... 3/4 take" wording is written for reference-image models and does not steer Kontext; lead with the emotion and pose in plain terms instead. The source portrait itself must match canon, otherwise every variant inherits its clothing.

## Video via MCP: `requiresPay: false` is NOT free (cost warning)

`account_models` marks "Akool Basic" (`AkoolImage2VideoFastV1`, `is_premium_model: false`) with `requiresPay: false`. That flag does **not** mean zero credits. Live test (2026-10-09), `video_image2video_create` with `is_premium_model: false`, `720p`, `video_length: 5`, `audio_type: 3` (none):

- `deduction_credit: 100` in the create response; balance 934 → 834.
- That is ~33x the cost of a still image via the MCP (3 credits).
- The AKOOL **web UI charged 1 credit** for a comparable video, so the API/MCP path is ~100x more expensive for video. Generate loops in the web UI unless you need automation.
- The job itself **succeeds** (~30 s, `status: 3`, 5.18 s, 720x1080 H.264 + AAC), but the MCP tool `video_image2video_results` and `akool-cli image2video results --ids` both fail with `API error: Failed to get results` — even for a made-up ID. This is a **request-shape bug in the MCP/CLI**, not a missing job. The video is retrievable by calling the API directly (see below).
- **MCP-generated content does not appear in the web UI** (no history entry, link or preview) — only the credit debit shows up in the account page. The only way to get the file is the API response URL.

> **Practical consequence:** for video, use the web UI (1 credit, visible history, downloadable). If you must use the MCP/CLI, retrieve the file with the direct API call below. The 100-credit cost remains.

**Working direct-API retrieval (video):**

```bash
# `_ids` must be a comma-separated STRING. An array ({"_ids":["..."]}) or {"ids": "..."} returns "Failed to get results".
curl -sS -X POST 'https://openapi.akool.com/api/open/v4/image2Video/resultsByIds' \
  -H "x-api-key: $AKOOL_API_KEY" -H 'Content-Type: application/json' \
  -d '{"_ids":"<_id from create>"}'
# -> data.result[0].video_url, status 3 = done (1 queued, 2 processing, 4 failed)
```

Legacy alternative: `GET /api/open/v3/content/video/infobymodelid?video_model_id=<_id>` returns `data.video`. Results expire after 7 days, so download promptly.

Note: `x-api-key` auth works with `AKOOL_API_KEY` from `.env`; the Postman collection ("Akool Official APIs") only documents the V3 API and has no image-to-video endpoints, so use docs.akool.com for v4.

**Rule:** there is no pre-flight price check. Confirm the balance before and after the first call of any new model/resolution/duration, and never batch video jobs through the MCP until the per-call cost is known.

## Web UI models, share links and image-to-image (2026-10-09)

- **The web UI uses models the API does not list.** A web-UI job (`source_data` of a share link) used `model_name: openai/gpt-image-2.5-sunburst/edit` with `resolution: 1k`, `quality: medium`, `similar: 0.6`. The public API only accepts the two Wavespeed Flux models for images (`model_name` allow-list) and `resolution` of `1080p`|`4k`. The 1K/2K quality tiers shown in the web UI do not exist in the API.
- **Extract an image from an `akool.com/share/<code>` link** (public, no login): `GET https://akool.com/interface/content-api/api/v6/content/share/check?code=<code>` → `data.temp_url` is the full-size PNG (a public CloudFront URL, valid as `source_images`), `data.source_data` holds the prompt/model/params the web UI used. This is an undocumented web-app endpoint and may change.
- **Image-to-image via the API (Flux Kontext) follows the reference style well** when the source is a good portrait: the `carlos_konibo` `__happy` prompt from the `.prompt.md` (4k, `similar: 0.6`, 4 credits) kept face, clothing, backdrop and linework, and produced the smile and the hand on the chest. It missed the second pose element (the "lifted open hand" became a hand on the belly). Image-to-image is the reliable way to keep a consistent art style across a cast; text-to-image (Krea) drifted in style for child/young subjects.

## Listing past generations (2026-10-09)

There is **no documented "list my generations" endpoint**, and the CLI and MCP have none either (their only `list` commands are voices and models). Web-UI creations cannot be listed through the API.

- **Undocumented, works:** `GET https://openapi.akool.com/api/open/v3/content/video/list?page=1&size=50` (`x-api-key`). It returns only **image-to-video jobs created through the API/CLI/MCP** (`type: 15`, every row has a `credentialId`; `video`/`external_video` URLs for finished jobs, `video_status` 3 = done, 4 = failed). No other `type` value returns anything, and `sub_type` is rejected. Web-UI-created videos do not appear.
- **Images:** every guessed list path (`/v3|v4/content/image/list`, `.../resource/list`, `.../content/list`) returns 404. Image jobs can only be fetched by `_id` (`infobymodelid`). Keep the `_id` from each create response, or record it in the asset's YAML, because it cannot be rediscovered.
- **Web-UI content from a share link** can be fetched via the share endpoint above, but there is no way to enumerate it.
- Result URLs expire (docs: 7 days) — download immediately.

## Pricing Notes

- **No pre-flight pricing check.** The API docs show `deduction_credit: 1` as an example, but live tests show different costs depending on method (same models in every case):

  | Method | Credits / generation |
  |--------|----------------------|
  | CLI (`akool-cli --wait`) | 8 |
  | Direct API, 4k (default) | 4 |
  | Direct API, 1080p | 3 |
  | MCP (`image_create`, always 1080p) | 3 |

- **Model selection:** Text-to-image uses `wavespeed-ai/flux-krea-dev-lora`, image-to-image uses `wavespeed-ai/flux-kontext-dev`.
- **Resolution (direct API, tested 2026-10-09):** `1080p` = 3 credits (864x1152 at `3:4`), `4k` = 4 credits (1152x1536 at `3:4`). The docs claim "1 credit per image at either resolution" — wrong on both counts. The API default is `4k`; the MCP/CLI always send `1080p`. The docs list no 1K/2K option.
- **Direct API is the only surface with the full image options** (`POST /api/open/v4/content/image/createBySourcePrompt`): `negative_prompt` (no `--no` prefix — strip it from `.prompt.md`), `resolution` (`1080p`|`4k`), `batch_quantity` (1-4), `similar` (0-1, img2img only), `model_name`, `source_images`, `webhookurl`. `negative_prompt` is stored on the job and applied. Poll `GET /api/open/v3/content/image/infobymodelid?image_model_id=<_id>` until `image_status: 3`, then download `data.image` (JPEG).
- **Image model choice is effectively fixed:** `model_name` is validated against an allow-list. Only `wavespeed-ai/flux-krea-dev-lora` (text-to-image) and `wavespeed-ai/flux-kontext-dev` (image-to-image) are accepted; anything else → `1003 parameter validate error`. Kontext without `source_images` → `1003 source_images is required for image-to-image model`. There is no model-list endpoint for images (`aigModel/list` only has types 1501/1502/2101).
- **Model lists (video/character swap) are identical** between the API, CLI and MCP.
- **Batch:** Set `batch_quantity` (1-4) to generate multiple images in one request. Each image deducts credits separately.
- **Balance readings can jump.** On 2026-10-09 the balance rose ~1,200 credits mid-run with no matching charge (probably a top-up). Compare the balance with the summed `deduction_credit` of your jobs before trusting a 'balance after' figure.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `exit code 56` from host curl | Server is healthy; use in-container `wget` instead of host `curl` |
| Low credits | Run `akool-cli credit` first; each CLI generation costs ~8 credits (MCP: 3) |
| MCP `image_info` shows no URL | Job still processing (`image_status: 2`); poll again until `3` |
| MCP `video_image2video_results` / CLI `image2video results` → `Failed to get results` | Tool bug (sends the IDs in the wrong shape). Call `POST /api/open/v4/image2Video/resultsByIds` directly with `{"_ids":"<id>"}` (string, not array) |
| MCP job debited but not in web UI history | Expected: MCP jobs are not listed in the web UI; retrieve images via `image_info` and videos via the direct API call above |
| `Failed to get token: Unknown error` from `akool-cli` | The project `.env` is loaded in the shell. Run the CLI with a clean env (`env -i HOME=$HOME PATH=$PATH akool-cli ...`) |
| JSON parse error | Ensure `--json` flag is included |
| `image_status: 4` | Generation failed; check prompt or try a different scale |

## Next Steps

- Try different `--scale` ratios: `1:1`, `4:3`, `16:9`, `9:16`
- Use `--webhook <url>` for async notifications
- Combine with `akool-cli voice tts` to add narration to generated videos