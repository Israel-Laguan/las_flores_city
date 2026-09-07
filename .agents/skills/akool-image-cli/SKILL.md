---
name: akool-image-cli
description: "Test and operate AKOOL text-to-image and image-to-image generation via akool-cli. Use this for quick image generation, prompt engineering, batch runs, and capturing actual CLI output for tutorials or debugging."
---

# Akool Image CLI Skill

End-to-end workflow for generating images and videos with `akool-cli image generate` and `akool-cli image2video`, covering text-to-image, image-to-image, image-to-video pipelines, credit tracking, result polling, and documentation of real CLI output.

## When to use

- Generating images from text prompts.
- Running image-to-image style transfer or refinement.
- Documenting actual CLI output for tutorials or reproducible prompts.
- Batch testing prompts against models and costs.

## Prerequisites

- `akool-cli` installed (binary at `~/.local/bin/akool-cli`).
- API credentials configured:
  ```bash
  export AKOOL_CLIENT_ID="your-client-id"
  export AKOOL_CLIENT_SECRET="your-client-secret"
  ```
  or via `akool-cli login`.
- Sufficient credits (each generation costs 8 credits, based on live run on 2026-07-01).
- Network access to AKOOL API and CDN.

## Steps

### Phase 1: Establish baseline

1. **Check credit balance**
   ```bash
   akool-cli credit
   ```
   Example output:
   ```
   ┌──────┬─────────┐
   │ Code │ Credits │
   ├──────┼─────────┤
   │ 1000 │ 898     │
   └──────┴─────────┘
   ```

### Phase 2: Text-to-image

2. **Generate from prompt**
   ```bash
   akool-cli --json image generate \
     --prompt "Cyberpunk street level view of Las Flores at dusk, neon, rain slick streets, cinematic" \
     --scale 16:9 \
     --wait
   ```
   Flags:
   - `--prompt "<text>"` — main image description.
   - `--scale <ratio>` — aspect ratio. Valid: `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `3:2`, `2:3`. Default: `1:1`.
   - `--wait` — block until completion with Fibonacci backoff (2s, 3s, 5s, 8s, 13s, 21s...).
   - `--json` — emit raw JSON for scripting.
   - `-e <env>` — switch environment (`prod`, `test`, `dev`).

3. **Capture the job identifiers from JSON**
   ```json
   {
     "code": 1000,
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
   - Use `_id` or `task_id` for polling.
   - `image_status: 3` = completed.
   - `upscaled_urls[0]` holds the asset URL.
   - `deduction_credit` shows cost per job.

### Phase 3: Image-to-image

4. **Generate from source image**
   ```bash
   akool-cli --json image generate \
     --prompt "Style transfer: convert to restored 1950s Kodachrome photograph, warm tones, grain, vintage" \
     --source-image "https://d2qf6ukcym4kn9.cloudfront.net/1782947550751-4a47aba9-071b-45c3-884a-44eb933e80c7-1894.jpeg" \
     --scale 1:1 \
     --wait
   ```
   Flags:
   - `--source-image <url>` — required for image-to-image.
   - Remaining flags same as text-to-image.

5. **Capture image-to-image identifiers from JSON**
   ```json
   {
     "code": 1000,
     "data": {
       "_id": "6a459f0131cbea71ffa0f682",
       "task_id": "0d3745fc5ad047fc8d0477d5d6a084ea",
       "model_name": "wavespeed-ai/flux-kontext-dev",
       "deduction_credit": 8,
       "source_image": "https://d2qf6ukcym4kn9.cloudfront.net/1782947550751-4a47aba9-071b-45c3-884a-44eb933e80c7-1894.jpeg",
       "upscaled_urls": [
         "https://d2qf6ukcym4kn9.cloudfront.net/1782947640903-086eee14-b5ff-46e0-bddf-189c946efa70-7221.jpeg"
       ],
       "image_status": 3
    }
  }
}

### Phase 4: Image-to-video

5. **List available models**
    ```bash
    akool-cli models --json
    ```
    Image-to-video models (type 1501) include:
    - `AkoolImage2VideoFastV1` — Akool Basic, cost-efficient
    - `AkoolImage2VideoHDV1` — Akool Premium, studio quality
    - `MiniMax-Hailuo-2.3/image-to-video` — fluid motion, photorealistic
    - `MiniMax-Hailuo-2.3-Fast/image-to-video` — instant, cinematic
    - `seedance-1-0-lite-i2v-250428` — Seedance Lite, cost-efficient
    - `seedance-1-0-pro-250528` — Seedance Pro, cinematic
    - `seedance/seedance-1-0-pro-fast-251015/image-to-video` — Seedance Pro Fast
    - `openai/sora-2-pro/image-to-video` — Sora 2 Pro
    - `akool/sora-2/image-to-video` — Sora 2
    - `kwaivgi/kling-video-o3-pro/image-to-video` — Kling 3.0 Omni

    **PixVerse 6 is NOT available** in AKOOL's image-to-video model list.

6. **Create video from image**
    ```bash
    akool-cli --json image2video create \
      --image "https://example.com/portrait.png" \
      --prompt "Subtle gentle motion, soft lighting, cinematic" \
      --resolution 720p \
      --video-length 5 \
      --audio-type 3
    ```
    Flags:
    - `--image <url>` — source portrait/image URL.
    - `--prompt <text>` — motion description.
    - `--negative-prompt <text>` — what to avoid.
    - `--resolution <res>` — `720p`, `1080p`, `4k`. Default: `720p`.
    - `--video-length <secs>` — `5` or `10`. Default: `5`.
    - `--audio-type <type>` — `1` = AI generated, `2` = upload via `--audio-url`, `3` = none. Default: `3`.
    - `--premium` — use premium HD model (`AkoolImage2VideoHDV1`).
    - `--extend-prompt` — let algorithm extend the prompt.
    - `--webhook <url>` — callback on completion.

    **⚠️ HIGH CREDIT COST WARNING:**
    - **5s 720p video:** ~100 credits deduction per video
    - **10s video:** ~300 credits deduction per video
    - This is dramatically more expensive than alternatives: PixVerse 6 charges ~3 tokens for audio-off 360p video.
    - **No pre-flight pricing check** — actual cost only appears in `deduction_credit` after generation.

7. **Capture creation response**
    ```json
    {
      "code": 1000,
      "msg": "OK",
      "data": {
        "_id": "6a9f2780d8f85dab98695520",
        "create_time": 1788815232296,
        "video_duration": 5,
        "resolution": "720p",
        "deduction_credit": 100,
        "status": 1
      }
    }
    ```
    - `_id` is the job identifier for polling.
    - `deduction_credit` shows actual cost — expect 100+ for 5s video.
    - `status`: `1` = queued, `2` = processing, `3` = completed, `4` = failed.

    **CLI limitation:** `akool-cli image2video results` currently returns `"Failed to get results"` for video jobs. Use the direct API instead (see step 8).

8. **Poll results via direct API**
    The working endpoint is:
    ```bash
    curl -s "https://openapi.akool.com/api/open/v4/image2Video/resultsByIds" -X POST \
      -H "x-api-key: $AKOOL_CLIENT_SECRET" \
      -H "Content-Type: application/json" \
      -d '{"_ids": "6a9f2780d8f85dab98695520"}'
    ```
    Notes:
    - Body parameter is `_ids` (string of comma-separated IDs), not `ids`.
    - Use `clientSecret` as `x-api-key`. `clientId` returns "account does not exist".
    - Response includes `video_url` when `status: 3`.

### Phase 5: Polling fallback

9. **Polling fallback**
   If `--wait` is unavailable or interrupted, poll manually via direct API:
   ```bash
   curl -s "https://openapi.akool.com/api/open/v4/image2Video/resultsByIds" -X POST \
     -H "x-api-key: $AKOOL_CLIENT_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"_ids": "6a9f2780d8f85dab98695520"}'
   ```
   Or for images:
   ```bash
   akool-cli --json image result --id "6a459f0131cbea71ffa0f682"
   ```

10. **Webhook callback**
    For CI or long jobs, add:
    ```bash
    akool-cli image generate ... --webhook "https://your-server.com/webhook"
    ```

### Phase 6: Verify cost and archive

11. **Confirm credit delta**
    ```bash
    akool-cli credit
    ```
    Expected pattern: baseline minus generation cost = final. Image generations are ~8 credits via CLI, ~4 via direct API. Video generations are ~100 credits for 5s 720p, ~300 for 10s. Confirm before documenting.

12. **Archive assets and metadata**
    Save generated image/video URLs, `_id` values, model names, timestamps, and raw JSON to `docs/lore/assets/akool-test/` or a research log for tutorial reference. Download videos immediately — CDN links may expire.

## Gotchas

- **Credit cost is per generation.** Live tests show:
  - **CLI (`akool-cli --wait`):** 8 credits per image
  - **Direct API (curl/Python):** 4 credits per image
  - **Image-to-video:** 100 credits for 5s 720p, 300 credits for 10s video
  - API docs show `deduction_credit: 1` as an example — actual costs vary wildly by task type.
- **⚠️ Image-to-video is extremely expensive.** 100 credits per 5s video is ~33x more than PixVerse 6 (~3 tokens). Always check `akool-cli credit` before and after. Consider alternatives like PixVerse for video tasks.
- **No pre-flight pricing check.** The CLI does not expose a command to list costs before generating. Check `akool-cli credit` before and after to measure actual spend.
- **`--wait` is blocking.** For CI, prefer `--webhook` or direct API polling.
- **Model depends on mode.** Text-to-image uses `wavespeed-ai/flux-krea-dev-lora`. Image-to-image uses `wavespeed-ai/flux-kontext-dev`.
- **URLs expire.** CDN links are stable but should be downloaded or re-uploaded immediately if they must persist.
- **`--json` is mandatory for scripting.** Raw JSON output is required to extract `_id`, `task_id`, and URLs programmatically.
- **`image_status` values:** `1` = queued, `2` = processing, `3` = completed. Check `image_sub_status` for finer state.
- **`--scale` validation:** Only the documented ratios are accepted. Wrong ratios return validation errors.
- **Test environment may be unavailable.** `akool-cli -e test credit` can fail with "Failed to get token: Unknown error" — falls back to `prod`.
- **PixVerse 6 is not available.** AKOOL's image-to-video models do not include PixVerse. Available providers: Akool, OpenAI, Minimax, Seedance, Kling.
- **Video results polling via CLI is broken.** `akool-cli image2video results --ids` returns "Failed to get results". Use the direct API endpoint `POST /api/open/v4/image2Video/resultsByIds` with `_ids` body parameter instead.
- **Use clientSecret for API auth.** `x-api-key: <clientSecret>` works for direct API calls. `clientId` returns account errors.

## Quick Reference Commands

```bash
# Balance
akool-cli credit

# Text-to-image
akool-cli --json image generate \
  --prompt "<text>" \
  --scale 16:9 \
  --wait

# Image-to-image
akool-cli --json image generate \
  --prompt "<text>" \
  --source-image "<url>" \
  --scale 1:1 \
  --wait

# Image-to-video (CLI create)
akool-cli --json image2video create \
  --image "<url>" \
  --prompt "<motion>" \
  --resolution 720p \
  --video-length 5 \
  --audio-type 3

# Poll image result
akool-cli --json image result --id "<job_id>"

# Poll video result (direct API)
curl -s "https://openapi.akool.com/api/open/v4/image2Video/resultsByIds" -X POST \
  -H "x-api-key: "$AKOOL_CLIENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"_ids": "<job_id>"}'

# Switch environment
akool-cli -e test credit
```

## Observed Run Data (2026-07-01)

- Credit baseline: 898
- After 2 CLI generations: 882 (8 credits each)
- After 1 direct API call: 878 (4 credits)
- Text-to-image model: `wavespeed-ai/flux-krea-dev-lora`
- Image-to-image model: `wavespeed-ai/flux-kontext-dev`
- Avg completion with `--wait`: ~30–50s on `prod`

## Observed Image-to-Video Data (2026-09-07)

- **5s 720p video:** 100 credits deducted per video (Akool Basic, Akool Premium, Seedance Lite)
- **10s 1080P video:** 300 credits deducted (Minimax Hailuo 2.3)
- **Generation time:** ~30–50s for 5s videos, ~60–90s for 10s videos
- **Output:** h264, 720×960 portrait, ~1.5 Mbps, 5.17s actual duration
- **PixVerse 6 equivalent:** ~3 tokens for audio-off 360p video (not available in AKOOL)
- **Video URLs:** CDN links at `https://d2qf6ukcym4kn9.cloudfront.net/...` — download immediately, they may expire

## Pricing Notes

- **Image generation:** No pre-flight pricing check. The API docs show `deduction_credit: 1` as an example, but live tests show actual costs differ by method:
  - **CLI (`akool-cli --wait`):** 8 credits per image
  - **Direct API (curl/Python):** 4 credits per image
- **Image-to-video: EXTREMELY EXPENSIVE.** Live tests on 2026-09-07:
  - **5s 720p video:** 100 credits deduction per video
  - **10s 1080P video:** 300 credits deduction per video
  - This is ~33x more expensive than PixVerse 6 (~3 tokens for 360p audio-off video)
  - **No pre-flight pricing check** — actual cost only appears in `deduction_credit` after generation
  - **PixVerse 6 is NOT available** in AKOOL's model list
- **Model selection:** Text-to-image uses `wavespeed-ai/flux-krea-dev-lora`, image-to-image uses `wavespeed-ai/flux-kontext-dev`.
- **Resolution:** Both `1080p` and `4k` cost the same per image.
- **Batch:** Set `batch_quantity` (1-4) to generate multiple images in one request. Each image deducts credits separately.

## Auth Notes

- **API key for direct API calls:** Use `clientSecret` as the `x-api-key` header value. `clientId` returns "account does not exist" errors.
- **Token auth:** The `/api/open/v4/image2Video/resultsByIds` endpoint accepts `Authorization: Bearer <token>` but the CLI-generated token may return "invalid authorization". Using `clientSecret` as `x-api-key` is more reliable.
- **Results endpoint:** Body parameter is `_ids` (string of comma-separated IDs), not `ids`. The CLI `akool-cli image2video results --ids` command currently fails with "Failed to get results" — use the direct API instead.

## Reading Credentials from .env

Store your API key:
```bash
# .env file
AKOOL_CLIENT_ID=your-client-id
AKOOL_CLIENT_SECRET=your-client-secret
```

**Important:** For direct API calls, use `AKOOL_CLIENT_SECRET` as the `x-api-key` header value. `AKOOL_CLIENT_ID` returns "account does not exist" errors.

**Bash + curl (simplest):**
```bash
source .env && curl --location 'https://openapi.akool.com/api/open/v4/content/image/createBySourcePrompt' \
  --header "x-api-key: $AKOOL_CLIENT_SECRET" \
  --header 'Content-Type: application/json' \
  --data '{"prompt": "A serene mountain lake", "scale": "16:9"}'
```

**Python (with python-dotenv):**
```python
from dotenv import load_dotenv; import os, requests
load_dotenv()
requests.post('https://openapi.akool.com/api/open/v4/content/image/createBySourcePrompt',
  headers={'x-api-key': os.getenv('AKOOL_CLIENT_SECRET'), 'Content-Type': 'application/json'},
  json={'prompt': 'A serene mountain lake', 'scale': '16:9'})
```

## Free Alternative: Pollinations AI

For prototyping or unlimited usage, Pollinations provides a free image generation API.

**Legacy API (still free):**
```bash
# No auth required
curl -s "https://image.pollinations.ai/prompt/Cyberpunk%20city?model=flux&width=512&height=512" -o image.jpg
```

**New API (gen.pollinations.ai):**
```bash
# Requires API key from [enter.pollinations.ai](https://enter.pollinations.ai)
curl -s "https://gen.pollinations.ai/image/Cyberpunk%20city?model=flux&width=512&height=512&key=YOUR_KEY" -o image.jpg
```

**Available models:** `flux`, `gptimage`, `gptimage-large`, `gpt-image-2`, `zimage`, `wan-image`, `wan-image-pro`, `qwen-image`, `p-image`, `p-image-edit`

**Get API key:** [enter.pollinations.ai](https://enter.pollinations.ai)

## Adapting Las Flores Prompts for Pollinations

The project's `docs/lore/guides/prompt_library.md` contains ready-made prompts for Las Flores 2077. To use with Pollinations:

1. Remove the trailing `--no` negative prompts (Pollinations handles them differently)
2. Use `--style raw` for photorealistic outputs
3. Add model parameter: `?model=flux` (recommended for photorealism)

**Example adaptation:**
```bash
# Original (AKOOL):
# "Cyberpunk street... --no androids, no robots"

# Pollinations:
curl -s "https://gen.pollinations.ai/image/Cyberpunk%20street%2C%20futuristic%20game%20asset?model=flux&width=512&height=512" -o image.jpg
```

**Prompt tips:**
- Keep the descriptive nouns and adjectives
- Drop the `--no` directives; use Pollinations' safety filters instead
- Add `photorealistic, 8k, hyper-detailed` for better quality
