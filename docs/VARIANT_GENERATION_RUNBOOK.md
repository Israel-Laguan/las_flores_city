# Scene Variant Generation Runbook — Manual Authoring Path

> Status: **2026-08-05** — automated image-to-image (i2i) variant generation is
> **hard-deadlocked**; variants must be authored **manually**. This runbook
> exists so a human (or future agent) can execute the remaining scene variant
> work without needing a working i2i provider.
>
> Generated from the live scene ".prompt.md" files via `parseVariants()`.

## Why automated i2i is deadlocked (do not re-investigate)

Both automated i2i providers fail on local base images:

### NIM hosted `flux.2-klein-4b` (`ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b`)
- Native genai endpoint accepts the `image` field **only** as an
  `example_id:<assetId>` asset reference. Base64 data-URLs and HTTP URLs are
  rejected:
  - `image: "data:image/png;base64,..."` → `422 Expected: example_id, got: base64`
  - `image: "https://…"` → `422 Expected: example_id, got: url`
  - `image: "example_id:<uuid>"` → `422 Image has been provided in the invalid form`
- The companion NVCF asset-upload API
  (`POST https://api.nvcf.nvidia.com/v2/nvcf/assets`) returns **415 Unsupported
  Media Type** for `application/octet-stream`, `image/png`, and
  `multipart/form-data`, so we cannot mint a valid `example_id`.
- OpenAI-compatible `/v1/images/edits` is **404** on the hosted
  `integrate.api.nvidia.com` and `ai.api.nvidia.com/v1/genai/…/images/edits`
  paths (that endpoint exists only on self-hosted NIM, e.g. `http://localhost:8000/v1/images/edits`).
- Practical impact: NIM **text-to-image** still works (all 19 existing
  `__default.png` bases were made this way). Only i2i is blocked.

### akool (`akool-cli image generate --source-image <url>`)
- `--source-image` must be a **public URL** akool's servers can fetch
  (live test used a CloudFront URL from a previous akool text-to-image run:
  `docs/tutorials/akool-image-cli.md:87`).
- `akool-cli` is a bundled binary with **no local-file upload path** —
  the source is sent as a string to `openapi.akool.com`.
- Our bases live only in `content/**/assets/` and local MinIO
  (`localhost:9000`), neither reachable by akool's infrastructure.
- Practical impact: akool **text-to-image** works (returns a public
  CloudFront URL, `8 credits/image`); akool **i2i on local bases** is blocked.

### What still works (automated)
`generate-drafts-unified.mjs` (NIM T2I + Pollinations fallback) generates
standalone **text-to-image** drafts and saves locally — that is how every
`__default.png` base in the repo was produced. Pollinations (free, no auth)
is available as the final fallback.

## Manual authoring contract

Each variant must be saved **locally** into the scene's flat assets folder:

```text
content/scenes/<slug>/assets/<slug>__<variant>.png
```

Use the **edit prompt** verbatim (from the Variants section of the scene
".prompt.md") as the i2i instruction against the scene's
`<slug>__default.png` base. Keep `no people, no text, no logos` and the
"same layout, same graphic novel style" constraints.

### akool i2i template (once a public base URL exists)
```bash
akool-cli --json image generate \
  --prompt "<EDIT_PROMPT>" \
  --source-image "<PUBLIC_URL_TO_<slug>__default.png>" \
  --scale 16:9 \
  --wait
# download <slug>__<variant>.png from response data.upscaled_urls[0]
```

### akool T2I fallback (fully automated, no source URL needed)
If i2iing the base is impractical, generate each variant standalone via
akool/NIM **text-to-image** using the base "## Prompt" of the scene plus the
variant's lighting change, then save to the contract filename. Layout fidelity
is lower but the game resolves any variant in the pool regardless of how it
was produced.

## Manifest

| # | Scene | Base | Variants (target files) |
|---|---|---|---|
| 1 | `acuario` | ✅ | `acuario__night.png`, `acuario__sunset.png` |
| 2 | `aeropuerto` | ✅ | `aeropuerto__night.png`, `aeropuerto__sunset.png` |
| 3 | `apartment` | ✅ | `apartment__night.png`, `apartment__sunset.png`, `apartment__day.png` |
| 4 | `cafe` | ✅ | `cafe__night.png`, `cafe__sunset.png` |
| 5 | `central_plaza` | ✅ | `central_plaza__night.png`, `central_plaza__sunset.png` |
| 6 | `estacion_central` | ✅ | `estacion_central__night.png`, `estacion_central__sunset.png` |
| 7 | `far_south` | ✅ | `far_south__night.png`, `far_south__sunset.png` |
| 8 | `industrial` | ✅ | `industrial__night.png`, `industrial__sunset.png` |
| 9 | `la_casa_de_la_musica` | ⚠️ **MISSING** | `la_casa_de_la_musica__night.png`, `la_casa_de_la_musica__sunset.png` |
| 10 | `los_andes` | ✅ | `los_andes__night.png`, `los_andes__sunset.png` |
| 11 | `north` | ✅ | `north__night.png`, `north__sunset.png` |
| 12 | `northeast` | ✅ | `northeast__night.png`, `northeast__sunset.png` |
| 13 | `old_town_cafe` | ⚠️ **MISSING** | `old_town_cafe__night.png`, `old_town_cafe__sunset.png` |
| 14 | `pacific` | ✅ | `pacific__night.png`, `pacific__sunset.png` |
| 15 | `parque_atracciones` | ✅ | `parque_atracciones__night.png`, `parque_atracciones__sunset.png` |
| 16 | `rainy_street_motorcycle` | ✅ | `rainy_street_motorcycle__night.png`, `rainy_street_motorcycle__sunset.png`, `rainy_street_motorcycle__day.png` |
| 17 | `school_classroom` | ✅ | `school_classroom__night.png`, `school_classroom__sunset.png`, `school_classroom__day.png` |
| 18 | `secondary_city_sunset` | ✅ | `secondary_city_sunset__night.png`, `secondary_city_sunset__day.png` |
| 19 | `southeast` | ✅ | `southeast__night.png`, `southeast__sunset.png` |
| 20 | `the_apartment` | ✅ | `the_apartment__night.png`, `the_apartment__sunset.png`, `the_apartment__day.png` |
| 21 | `welcome_center` | ✅ | `welcome_center__night.png`, `welcome_center__sunset.png`, `welcome_center__day.png` |

**Totals:** 21 scenes · 21 with prompts · **47 variants to author** ·
19 bases present · 2 base(s) missing: `la_casa_de_la_musica`, `old_town_cafe`.

## Per-scene edit prompts

### `acuario`
- **`night`** `16:9` → `acuario__night.png`
  `Re-light the aquarium as a near-dark night gallery: dim the overheads, brighten the bioluminescent teal and blue tank glow, deepen the shadows between the glass, stronger wet-floor reflections. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `acuario__sunset.png`
  `Re-light the aquarium with warm golden-hour light spilling in from the gallery windows: amber highlights on the glass tanks, softer teal, warm reflections on the walkway. Same layout, same graphic novel style, no people.`

### `aeropuerto`
- **`night`** `16:9` → `aeropuerto__night.png`
  `Re-light the terminal as a night scene: darken the concourse, brighten the holographic departures board and neon accents, glass walls glow with runway lights and distant city lights, cooler blue palette. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `aeropuerto__sunset.png`
  `Re-light the terminal with warm golden-hour sun pouring through the glass walls: amber highlights on the floor and kiosks, softer cool ceiling light, long sunbeams across the concourse. Same layout, same graphic novel style, no people.`

### `apartment`
- **`night`** `16:9` → `apartment__night.png`
  `Re-light the apartment as a deep night scene: the room darker, neon street glow brighter through the rain-streaked window, cooler blue palette, warm lamp the only interior light. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `apartment__sunset.png`
  `Re-light the apartment with warm golden-hour light through the window: amber tones across the walls and floor, softer interior, the rain on the glass catching golden light. Same layout, same graphic novel style, no people.`
- **`day`** `16:9` → `apartment__day.png`
  `Re-light the apartment as a clear dry day: bright natural daylight floods through the window, no rain on the glass, muted cool interior, crisp shadows. Same layout, same graphic novel style, no people.`

### `cafe`
- **`night`** `16:9` → `cafe__night.png`
  `Re-light the café as an evening scene: dim the room, warm golden overhead lamps, neon streetlight glowing through the front window, deeper shadows on the brick. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `cafe__sunset.png`
  `Re-light the café with golden-hour sun through the window: warm amber washes over the brick and counter, soft highlights on the espresso machine. Same layout, same graphic novel style, no people.`

### `central_plaza`
- **`night`** `16:9` → `central_plaza__night.png`
  `Re-light the plaza as a night scene: the fountain glowing, neon signs and holographic billboards blazing brighter, colonial façades in shadow, wet reflective pavement, cooler blue and magenta palette. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `central_plaza__sunset.png`
  `Re-light the plaza with golden-hour sun: long warm shadows across the square, amber rays between the buildings, the fountain catching warm light, neon just beginning to glow. Same layout, same graphic novel style, no people.`

### `estacion_central`
- **`night`** `16:9` → `estacion_central__night.png`
  `Re-light the platform as a late-night scene: the station dimmer, tunnel mouths glowing, neon signage brighter, track lights streaking in the dark, cooler blue palette. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `estacion_central__sunset.png`
  `Re-light the platform with warm golden-hour light slanting in from the street entrances: amber shafts across the platform, softer ceiling light, warm reflections on the rails. Same layout, same graphic novel style, no people.`

### `far_south`
- **`night`** `16:9` → `far_south__night.png`
  `Re-light the farmland as a night scene: dark fields under a wide starry sky, the city's glow on the horizon, homestead windows and a single security light dotting the dark. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `far_south__sunset.png`
  `Re-light the farmland with golden-hour sun: long warm shadows across the crops, amber sky, solar panels catching the last light. Same layout, same graphic novel style, no people.`

### `industrial`
- **`night`** `16:9` → `industrial__night.png`
  `Re-light the district as a night scene: dark sky, smokestacks silhouetted, warm industrial lamps and neon yard lights glowing, steam lit from below, cooler blue-black palette. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `industrial__sunset.png`
  `Re-light the district with a golden-orange sunset: the haze glowing amber around the smokestacks, long shadows across the loading bays, warm light on the wet pavement. Same layout, same graphic novel style, no people.`

### `la_casa_de_la_musica`
- **`night`** `16:9` → `la_casa_de_la_musica__night.png`
  `Re-light the venue as an active night club: the holographic light rig blazing with volumetric beams, deep shadows in the rafters, pulsing neon accent lights, richer color contrast. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `la_casa_de_la_musica__sunset.png`
  `Re-light the venue with warm golden-hour light through the warehouse windows: amber washes across the floor and rafters, the light rig softly glowing, dust in the sunbeams. Same layout, same graphic novel style, no people.`

### `los_andes`
- **`night`** `16:9` → `los_andes__night.png`
  `Re-light the heights as a night scene: the residential terraces softly lit, the entire city below glittering with neon and streetlights, a wide starry mountain sky above. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `los_andes__sunset.png`
  `Re-light the heights with a golden-hour sunset: warm amber washing over the modernist residences and the valley below, long mountain shadows, the city catching the last light. Same layout, same graphic novel style, no people.`

### `north`
- **`night`** `16:9` → `north__night.png`
  `Re-light the avenue as an evening scene: storefront windows glowing warm, neat streetlights, a few neon accents, the residential windows lit, calm night palette. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `north__sunset.png`
  `Re-light the avenue with golden-hour sun: long warm shadows, amber light on the building façades, the street glowing in the last daylight. Same layout, same graphic novel style, no people.`

### `northeast`
- **`night`** `16:9` → `northeast__night.png`
  `Re-light the quarter as a night scene: cranes silhouetted against a dark sky, work-site floodlights and glowing new façades, the older buildings in shadow, cooler blue palette. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `northeast__sunset.png`
  `Re-light the quarter with a golden sunset: amber light reflecting off the new glass towers, long shadows from the scaffolding, warm glow on the raw concrete. Same layout, same graphic novel style, no people.`

### `old_town_cafe`
- **`night`** `16:9` → `old_town_cafe__night.png`
  `Re-light the cafe as an evening scene: the room warmer and dimmer, amber lamps glowing, the vinyl player highlighted, neon streetlight glimpsed through the door window, deeper shadows. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `old_town_cafe__sunset.png`
  `Re-light the cafe with golden-hour sunlight through the window: warm amber washing over the wooden tables and counter, soft highlights on the vinyl player. Same layout, same graphic novel style, no people.`

### `pacific`
- **`night`** `16:9` → `pacific__night.png`
  `Re-light the coast as a night scene: the harbour lit by mooring lamps and neon from the market stalls, reflections shimmering on the dark water, the fishing fleet at rest. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `pacific__sunset.png`
  `Re-light the coast with a golden-hour sunset: warm amber over the water and boat hulls, long shadows on the docks, the market stalls catching the last light. Same layout, same graphic novel style, no people.`

### `parque_atracciones`
- **`night`** `16:9` → `parque_atracciones__night.png`
  `Re-light the midway as a night scene: carnival lights and holographic projections blazing bright against a dark sky, saturated neon, the ride frames glowing, deep shadows between stalls. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `parque_atracciones__sunset.png`
  `Re-light the midway with a warm dusk sky: golden light mixing with the first neon, soft amber over the stalls and projections, long evening shadows. Same layout, same graphic novel style, no people.`

### `rainy_street_motorcycle`
- **`night`** `16:9` → `rainy_street_motorcycle__night.png`
  `Re-light the scene as a deeper night: neon bleeding brighter, wet-asphalt reflections stronger, darker sky, the motorcycle's underglow more electric, cooler blue-magenta palette. Same motorcycle, same street, same graphic novel style, no people.`
- **`sunset`** `16:9` → `rainy_street_motorcycle__sunset.png`
  `Re-light the scene as golden hour: long shadows across the wet asphalt, amber underglow and warm neon, the motorcycle chrome catching orange light, the rain still falling. Same motorcycle, same street, same graphic novel style, no people.`
- **`day`** `16:9` → `rainy_street_motorcycle__day.png`
  `Re-light the scene as a clear dry day: dry asphalt, muted neon during daytime, harsher tropical light, the parked motorcycle with chrome catching white sun. Same motorcycle, same street, same graphic novel style, no people.`

### `school_classroom`
- **`night`** `16:9` → `school_classroom__night.png`
  `Re-light the classroom as a night scene: outside darkness, corporate billboard neon through the rain-streaked windows much brighter, electric shadows deeper across the desks, cool blue palette. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `school_classroom__sunset.png`
  `Re-light the classroom with golden-hour sun through the windows: warm amber mixing with the neon streaks, long soft shadows across the scanner desks. Same layout, same graphic novel style, no people.`
- **`day`** `16:9` → `school_classroom__day.png`
  `Re-light the classroom as a clear dry day: bright natural daylight through the windows, no rain streaks, muted cooler light on the desks and holographic displays. Same layout, same graphic novel style, no people.`

### `secondary_city_sunset`
- **`night`** `16:9` → `secondary_city_sunset__night.png`
  `Re-light the scene as a night version: the sun gone, smog and dark sky, neon agribusiness signs and holographic ads blazing brighter, reflections stronger in the wet furrows, cooler palette. Same layout, same graphic novel style, no people.`
- **`day`** `16:9` → `secondary_city_sunset__day.png`
  `Re-light the scene as a clear dry day: bright flat daylight through thin smog, dry terraced fields, muted neon, harsher tropical light on the irrigation systems. Same layout, same graphic novel style, no people.`

### `southeast`
- **`night`** `16:9` → `southeast__night.png`
  `Re-light the barrio as a night scene: warm streetlights and a few neon accents lighting the murals, the painted walls glowing in the dark, cool shadows on the street. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `southeast__sunset.png`
  `Re-light the barrio with a golden sunset: warm amber light raking across the murals, long shadows, the painted colors deepened and glowing. Same layout, same graphic novel style, no people.`

### `the_apartment`
- **`night`** `16:9` → `the_apartment__night.png`
  `Re-light the apartment as a deep night scene: the room darker, neon streetlight through the rain-streaked window much brighter and cooler, sharp shadows on the white walls. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `the_apartment__sunset.png`
  `Re-light the apartment with golden-hour light through the window: warm amber washes across the white walls and minimal furniture, the rain catching afternoon light. Same layout, same graphic novel style, no people.`
- **`day`** `16:9` → `the_apartment__day.png`
  `Re-light the apartment as a clear dry day: bright natural daylight through the window, no rain on the glass, muted white interior with crisp shadows. Same layout, same graphic novel style, no people.`

### `welcome_center`
- **`night`** `16:9` → `welcome_center__night.png`
  `Re-light the hall as a night scene: the glass walls dark, the holographic map and monorail lights brighter, rain streaks glowing with city neon, cooler palette. Same layout, same graphic novel style, no people.`
- **`sunset`** `16:9` → `welcome_center__sunset.png`
  `Re-light the hall with golden-hour light through the glass walls: warm amber over the floor and kiosks, the holographic map catching soft light, long reflections. Same layout, same graphic novel style, no people.`
- **`day`** `16:9` → `welcome_center__day.png`
  `Re-light the hall as a clear dry day: bright daylight through the glass, no rain streaks, crisp clean light on the desks and map. Same layout, same graphic novel style, no people.`

---

## After authoring (downstream steps, still automatable)

1. **Publish** bases + variants via `AssetPublishService` (`POST /admin/content/assets/promote-staging` or a direct
   `uploadToMinio` script) so `verify-assets.mjs` passes.
2. **Wire `background_urls[]`** into each scene YAML with `expression` tags
   (`night`, `sunset`, `day`), then remove the legacy `background_url`.
3. **Verify:** `node scripts/asset-pipeline/scripts/verify-assets.mjs`,
   `npm run content:audit`, and server health
   `podman exec las-flores-server wget -qO- http://localhost:3000/health`.
4. After server-code changes, rebuild:
   `docker compose build server && docker compose up -d server` (or podman equivalent).

