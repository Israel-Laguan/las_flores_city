# Akool Image CLI Tutorial

This guide walks through using `akool-cli` for text-to-image and image-to-image generation, based on a live test run on 2026-07-01.

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

   Example output:
   ```
   ┌──────┬─────────┐
   │ Code │ Credits │
   ├──────┼─────────┤
   │ 1000 │ 898     │
   └──────┴─────────┘
   ```

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

> **Note:** The API docs show `deduction_credit: 1` as an example, but actual costs may vary by model, region, or pricing tier. There is no CLI command to check pricing before generating.

## Environment Options

Switch between environments:
```bash
akool-cli -e test credit      # Test environment (may be unavailable)
akool-cli -e dev credit       # Development environment
```

> **Note:** The test environment may fail with "Failed to get token: Unknown error". Use `prod` (default) if this occurs.

## Production Images

The test images generated on 2026-07-01 are saved in `content/lore/shared/akool-test/` (or the per-folder `assets/` directory where they were migrated):
- `text2image-cyberpunk-las-flores.jpeg` — Las Vegas cyberpunk street scene
- `img2image-kodachrome.jpeg` — Kodachrome-style transformation

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

The project's `docs/lore/guides/prompt_library.md` contains ready-made prompts. To adapt for Pollinations:

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

## Pricing Notes

- **No pre-flight pricing check.** The API docs show `deduction_credit: 1` as an example, but live tests show different costs depending on method:
  - CLI (`akool-cli --wait`): 8 credits per generation
  - Direct API (curl/Python): 4 credits per generation
- **Model selection:** Text-to-image uses `wavespeed-ai/flux-krea-dev-lora`, image-to-image uses `wavespeed-ai/flux-kontext-dev`.
- **Resolution:** Both `1080p` and `4k` cost the same per image.
- **Batch:** Set `batch_quantity` (1-4) to generate multiple images in one request. Each image deducts credits separately.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `exit code 56` from host curl | Server is healthy; use in-container `wget` instead of host `curl` |
| Low credits | Run `akool-cli credit` first; each generation costs ~8 credits |
| JSON parse error | Ensure `--json` flag is included |
| `image_status: 4` | Generation failed; check prompt or try a different scale |

## Next Steps

- Try different `--scale` ratios: `1:1`, `4:3`, `16:9`, `9:16`
- Use `--webhook <url>` for async notifications
- Combine with `akool-cli voice tts` to add narration to generated videos