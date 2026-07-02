---
name: akool-image-cli
description: "Test and operate AKOOL text-to-image and image-to-image generation via akool-cli. Use this for quick image generation, prompt engineering, batch runs, and capturing actual CLI output for tutorials or debugging."
---

# Akool Image CLI Skill

End-to-end workflow for generating images with `akool-cli image generate`, covering text-to-image and image-to-image pipelines, credit tracking, result polling, and documentation of real CLI output.

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
   ```

### Phase 4: Async patterns

6. **Polling fallback**
   If `--wait` is unavailable or interrupted, poll manually:
   ```bash
   akool-cli image result --id "6a459f0131cbea71ffa0f682"
   akool-cli --json image result --id "6a459f0131cbea71ffa0f682"
   ```

7. **Webhook callback**
   For CI or long jobs, add:
   ```bash
   akool-cli image generate ... --webhook "https://your-server.com/webhook"
   ```

### Phase 5: Verify cost and archive

8. **Confirm credit delta**
   ```bash
   akool-cli credit
   ```
   Expected pattern: baseline minus `8 x generations` = final. Confirm before documenting.

9. **Archive assets and metadata**
    Save generated image URLs, `_id` values, model names, timestamps, and raw JSON to `docs/lore/assets/akool-test/` or a research log for tutorial reference.

## Gotchas

- **Credit cost is per generation.** Live tests show:
  - **CLI (`akool-cli --wait`):** 8 credits
  - **Direct API (curl/Python):** 4 credits
  - API docs show `deduction_credit: 1` as an example — actual costs may vary by model, region, or pricing tier.
- **No pre-flight pricing check.** The CLI does not expose a command to list costs before generating. Check `akool-cli credit` before and after to measure actual spend.
- **`--wait` is blocking.** For CI, prefer `--webhook` or `image result --id` polling.
- **Model depends on mode.** Text-to-image uses `wavespeed-ai/flux-krea-dev-lora`. Image-to-image uses `wavespeed-ai/flux-kontext-dev`.
- **URLs expire.** CDN links are stable but should be downloaded or re-uploaded immediately if they must persist.
- **`--json` is mandatory for scripting.** Raw JSON output is required to extract `_id`, `task_id`, and URLs programmatically.
- **`image_status` values:** `1` = queued, `2` = processing, `3` = completed. Check `image_sub_status` for finer state.
- **`--scale` validation:** Only the documented ratios are accepted. Wrong ratios return validation errors.
- **Test environment may be unavailable.** `akool-cli -e test credit` can fail with "Failed to get token: Unknown error" — falls back to `prod`.

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

# Poll result
akool-cli --json image result --id "<job_id>"

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

## Pricing Notes

- **No pre-flight pricing check.** The API docs show `deduction_credit: 1` as an example, but live tests show actual costs differ by method:
  - **CLI (`akool-cli --wait`):** 8 credits per generation
  - **Direct API (curl/Python):** 4 credits per generation
- **Model selection:** Text-to-image uses `wavespeed-ai/flux-krea-dev-lora`, image-to-image uses `wavespeed-ai/flux-kontext-dev`.
- **Resolution:** Both `1080p` and `4k` cost the same per image.
- **Batch:** Set `batch_quantity` (1-4) to generate multiple images in one request. Each image deducts credits separately.

## Reading Credentials from .env

Store your API key:
```bash
# .env file
AKOOL_API_KEY=your-client-id
AKOOL_API_SECRET=your-client-secret
```

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
