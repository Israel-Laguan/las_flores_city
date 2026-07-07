# Biometric Asset Pipeline — Next Steps

> **Purpose:** Roadmap for downstream tasks after the biometric isolation registries and prompt generator are in place.
> **Status:** Backend/Docs side complete — see below for Phaser, HTML, and LoRA phases.

---

## Phase A: Complete the Backend Scripting

These scripts automate the gap between prompt generation and final asset delivery.

### A.1 `scripts/generate-character-assets.mjs`

**Purpose:** Reads a character YAML + registries → generates all biometric/expression/outfit prompts in batch.

**Input:**
- `content/characters/char_{slug}.yaml` (with `metadata.ethnicity`, `metadata.personality`, `metadata.physical_description`)
- Registry files in `docs/lore/assets/registries/`

**Logic:**
1. Read character YAML for `name`, `age`, `gender`, `ethnicity`, `personality`, `physical_description`
2. Look up `ethnicity` in `ethnicities.yaml` → get `phenotype_description`
3. Look up `body_shape` in `body_shapes.yaml` → get `skeletal_description`
4. Look up `personality` in `personality_poses.yaml` → get `default_pose`, `signature_poses`, `expressions`
5. Generate:
   - 1 `biometric` prompt (3 sheets)
   - 1 `expression` prompt (expression strip)
   - N `outfit-pose` prompts (one per outfit × pose combination)
6. Write all `.prompt.md` files to the correct output directories

**Output:** `docs/lore/assets/biometric/{slug}/`, `docs/lore/assets/expressions/{slug}/`, `docs/lore/assets/outfits/{slug}/`

### A.2 `docs/lore/assets/scripts/compose-sprite.mjs`

**Purpose:** Layers body + face strip + hair → final composited sprite.

**Input:**
- Body+outfit image (from `outfit-pose` generation)
- Face expression strip (from `expression` generation)
- Hair front/back layers (from character asset manifest)
- Expression index to crop from strip

**Logic:**
1. Load body+outfit image as base layer
2. Load expression strip, crop to the correct expression panel (pre-defined panel widths)
3. Overlay face at the biometric anchor point coordinates
4. Overlay hair front layer
5. Export as single PNG

**Output:** Final pre-baked sprite for HTML/Phone overlay consumption.

**Dependencies:** Requires `sharp` or `canvas` npm package.

### A.3 `docs/lore/assets/scripts/validate-biometric.mjs`

**Purpose:** Validates that generated biometric images have correct dimensions and anchor point visibility.

**Checks:**
- `horizontal_face.png`: 5-panel strip, each panel equal width
- `vertical_face.png`: 5-panel strip, each panel equal height
- `body_sheet.png`: 3-panel orthographic (front, side, rear)
- Face anchor point is present at expected coordinates (if marker cross is detectable)
- No compression artifacts or style drift from the style prefix

---

## Phase B: Phaser Runtime Compositing

### B.1 Update `client/src/scenes/location/npc-renderer.ts`

**Current state:** Supports single portrait images + sprite atlas animations.

**Needed change:** Add layered compositing when `asset_manifest` is present in the NPC payload.

**Implementation sketch:**
```typescript
interface LayerData {
  type: 'body' | 'face_strip' | 'hair_front' | 'hair_back';
  url: string;
  anchorX?: number;  // percent of container width
  anchorY?: number;  // percent of container height
  cropWidth?: number;  // for face strips — width of one expression panel
  expressionIndex?: number;  // which expression to show
}

function createLayeredNPC(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  layers: LayerData[],
  height: number
): void {
  // 1. Load each layer image
  // 2. Position at anchor points relative to container
  // 3. For face strip: set crop rect to show current expression
  // 4. Set depth ordering: hair_back → body → face → hair_front
  // 5. Add interaction hit area on the full composited area
}
```

### B.2 Extend ScenePayloadSchema

Add `asset_manifest` to the NPC payload so the Phaser client knows which layers to load:

```typescript
// In shared/src/index.ts, extend the NPC object in ScenePayloadSchema
asset_manifest: z.object({
  body_shape: z.string(),
  ethnicity: z.string(),
  face_base_url: z.string().optional(),
  hair_front_url: z.string().optional(),
  hair_back_url: z.string().optional(),
  outfits: z.array(z.object({
    id: z.string(),
    label: z.string(),
    pose_urls: z.record(z.string(), z.string()),
  })).optional(),
  expression_strip_url: z.string().optional(),
}).optional(),
```

### B.3 Expression Switching at Runtime

When dialogue changes mood:
1. Get the new expression ID from dialogue state
2. Update the face strip's crop rectangle to the new expression
3. Add a quick blink transition (scale Y to 0.1 and back) for visual feedback

```typescript
function setExpression(npcContainer: Phaser.GameObjects.Container, expressionIndex: number): void {
  const faceStrip = npcContainer.getByName('face_strip') as Phaser.GameObjects.Image;
  const panelWidth = faceStrip.width / NUM_EXPRESSIONS;
  faceStrip.setCrop(expressionIndex * panelWidth, 0, panelWidth, faceStrip.height);
  
  // Blink tween
  scene.tweens.add({
    targets: faceStrip,
    scaleY: 0.1,
    duration: 50,
    yoyo: true,
    ease: 'Quad.easeInOut',
  });
}
```

---

## Phase C: HTML Phone Overlay Pre-Baked Sprites

### C.1 Pre-Bake Pipeline

For the HTML/Phone overlay, generate one PNG per (pose × expression) combination using the compositing script (A.2).

**Naming convention:**
```
minio:9000/las-flores/portraits/{slug}/{outfit_id}/{pose_id}_{expression_id}.png
```

**Example references in character YAML:**
```yaml
portrait_urls:
  - url: "http://minio:9000/las-flores/portraits/diego_huaman/everyday/neutral_stand_happy.png"
    label: "Everyday, neutral stand, happy"
    expression: "happy"
  - url: "http://minio:9000/las-flores/portraits/diego_huaman/everyday/neutral_stand_thoughtful.png"
    label: "Everyday, neutral stand, thoughtful"
    expression: "thoughtful"
```

### C.2 Generation Budget

For a single character across the MVP scope:
- 3 poses × 6 expressions × 2 outfits = **36 total sprites**
- At ~$0.02-0.05 per generation (Flux refine) = ~$1-2 per character

---

## Phase D: LoRA Training Pipeline

### D.1 When to Train LoRAs

LoRAs become valuable when:
- You need **perfect consistency** across all poses/expressions for a main character
- You have **10-20+ refined images** of the character (all biometric sheets + outfit poses)
- You plan to generate **many scenes** with the same character

### D.2 Dataset Requirements

| Image Type | Count | Purpose |
|---|---|---|
| Horizontal face arc | 1 strip (5 panels) | Face structure |
| Vertical face arc | 1 strip (5 panels) | Face structure |
| Expression strip | 1 strip (5-7 expressions) | Expression variation |
| Outfit poses | 6-10 images | Body + outfit consistency |
| **Total** | **10-20 images** | **Minimum viable dataset** |

### D.3 Training Tools

| Tool | Platform | Cost |
|---|---|---|
| Stable Diffusion LoRA | Local (ComfyUI) | Free (GPU required) |
| Flux LoRA | Local (ComfyUI) | Free (GPU required) |
| Replicate LoRA training | Cloud | Pay per training run |
| CivitAI LoRA training | Cloud | Pay per training run |
| Hugging Face Diffusers | Cloud | Pay per compute time |

### D.4 Training Workflow

1. **Curate dataset:** Select 10-20 best images from refined generation stage
2. **Caption images:** Write descriptive captions for each (e.g., "diego huaman male andean 19 years old wearing casual student outfit front view")
3. **Train LoRA:** Use ComfyUI workflow or Replicate training API
4. **Validate:** Generate test images across all poses/expressions and check consistency
5. **Iterate:** If consistency is poor, add more training images or adjust training parameters

---

## Phase F: Non-Character Asset Generation

Once the character pipeline is validated, generate all non-character assets using the registries and updated prompt types.

### F.1 Terrain Tiles (17 assets)

Use the `tile` prompt type with the `tiles.yaml` registry:

```bash
# Generate all tile prompts
for tile in docs/lore/assets/registries/tiles.yaml; do
  # Manual: use the tile template with registry data
  # Or create a batch generator script
done
```

**Output:** `docs/lore/assets/tiles/<tile_id>.prompt.md`
**MinIO:** `las-flores/tiles/<tile_id>.png`

### F.2 Landmark Overlays (15 assets)

Use the `overlay` prompt type with the `landmarks.yaml` registry:

**Output:** `docs/lore/assets/overlays/<lm_id>.prompt.md`
**MinIO:** `las-flores/overlays/<lm_id>.png`

### F.3 Scene Backgrounds (8 assets)

Use the `background` prompt type with the `backgrounds.yaml` registry:

**Output:** `docs/lore/assets/backgrounds/<bg_id>.prompt.md`
**MinIO:** `las-flores/backgrounds/<bg_id>.jpg`

### F.4 Phone Assets (9 assets)

Use the `phone-wallpaper` and `app-icon` prompt types with their registries:

**Output:** `docs/lore/assets/phone/<asset_id>.prompt.md`
**MinIO:** `las-flores/phone/<asset_id>.png`

### F.5 Legacy Asset Regeneration

The old assets in `docs/lore/assets/references/` can be regenerated with the new style:

1. Review the old `.prompt.md` files in `references/ui-concepts/`
2. Use the new registries + `generate-prompt.mjs` to create new prompts
3. Generate with NIM/Flux pipeline
4. Compare quality with old draft PNGs
5. Upload to MinIO and update content YAMLs

---

## Phase E: Batch Migration of Characters

Once the MVP (Diego Huamán) is validated, migrate the remaining priority characters:

### Priority 1 — Main Cast (10 characters)
Characters most frequently appearing in dialogue scenes:
1. Diego Huamán (MVP — already done)
2. Daiyu Liu (east_asian, f_slim, intelligent_ambitious_arrogant)
3. Alberto Santiago (latino_mestizo, m_average, outgoing_charming)
4. Chief Inspector Adeyemi (african, m_heavy, reformist_police_chief)
5. Fatima El-Kholi (arab_north_african, f_curvy, confident_assertive_appreciative_of_luxury)
6. Ana Kim (east_asian, f_slim, analytical_thinker)
7. Carlos Konibo (indigenous_amazon, m_slim, ambitious_curious_resilient)
8. Isabella Vargas (latino_mestizo, f_curvy, bubbly_socialite)
9. Kusi (indigenous_andes, elderly, loyal_companion)
10. Alexander van der Meer (european, m_athletic, confident_leader)

### Priority 2 — Supporting Cast (20 characters)
Less frequent but still important for Act 1 scenes.

### Priority 3 — Background NPCs
Generate using the `independent_npc` fallback personality and a generic ethnic face base.

---

## Implementation Order Summary

| Phase | What | Dependencies |
|---|---|---|
| **A.1** | `generate-character-assets.mjs` script | Registries done ✓ |
| **A.2** | `compose-sprite.mjs` script | Generated biometric + outfit images |
| **A.3** | `validate-biometric.mjs` script | Generated biometric images |
| **B.1** | Phaser layered compositing | A.2 script + generated layer images |
| **B.2** | ScenePayloadSchema extension | B.1 implementation |
| **B.3** | Expression switching at runtime | B.1 implementation |
| **C.1** | HTML pre-bake pipeline | A.2 script |
| **D.1-D.4** | LoRA training | 10-20 refined images per character |
| **E** | Batch character migration | All above phases complete |

---

## Estimated Timeline

| Phase | Effort | Can parallelize? |
|---|---|---|
| A.1 (Batch generator script) | 1-2 days | No (scripting) |
| A.2 (Compositing script) | 1-2 days | No (scripting) |
| A.3 (Validation script) | 0.5 days | After A.2 |
| B (Phaser compositing) | 2-3 days | After A.2 |
| C (HTML pre-bake) | 0.5 days | After A.2 |
| D (LoRA) | 3-5 days per character | After refined images exist |
| E (Batch migration) | 1-2 hours per character | Yes (if scripting is done) |