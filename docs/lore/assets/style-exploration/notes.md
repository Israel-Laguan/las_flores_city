# Art Style Exploration — Las Flores 2077

**Date:** 2026-07-01
**Tool:** Pollinations.ai (free tier, 512×512)
**Prompt Library:** `docs/lore/assets/style-exploration/[style-name]/`

---

## 1. Modern American Comic + Realistic Backgrounds

**File:** `modern-american-comic/01-comic-portrait.png`

### What worked
- Strong line-weight separation between foreground character and background.
- Ben-Day halftone texture read clearly at thumbnail scale.
- Alex Garcia’s features translated well: bold shapes kept likeness recognizable even with stylization.

### What didn't
- At 512×512, heavy outlines lost small details; hair strands and facial features blur.
- “Photorealistic downtown background” prompt fought the comic foreground — the AI blended them into a muddy cross-style instead of clean separation.

### Performance implications
- Cell-shaded comic style is very GPU-friendly in real-time engines: fewer unique materials, strong color bands, no per-pixel AO.
- However, high-contrast outlines require post-process edge detection or wireframe passes if done in-engine.
- Transmission/tweet-scale assets can downscale cleanly; close-ups will need higher-res source.

### Las Flores fit
- **High.** The grit, punchy readability, and pop-culture familiarity match Alex’s student-hero tone.
- Backgrounds should be either fully painted realist or fully inked comic — never mixed mid-scene.

---

## 2. Anime / Visual Novel

**File:** `anime-visual-novel/02-anime-portrait.png`

### What worked
- Large eyes and simplified facial features read instantly; emotional expressiveness is baked into the template.
- Soft Ghibli-inspired lighting created readable silhouettes.
- Hair detail clustered into recognizable shapes rather than individual strands.

### What didn't
- Facial proportions felt “imported” — the generated character didn’t feel Latino unless prompt was explicit; even then, AI anime defaults lean toward East Asian phenotypes.
- Background style was generic anime landscape, not grounded in Las Flores visual language.

### Performance implications
- Anime VN style is extremely light: palette-swapped base meshes, baked textures, few shader permutations.
- Real-time translucency effects (eye shine, hair sheen) are cheap.
- Consistency across characters is copy-paste friendly if base template is locked.

### Las Flores fit
- **Medium.** Great for dialogue-heavy scenes and emotional beats, but risks washing out the grounded, noir-tinged tone unless backgrounds and UI are heavily re-skinned.
- Best kept as a secondary “memory/dream” mode rather than the primary world style.

---

## 3. Pixel Art (16-bit)

**File:** `pixel-art-16bit/03-pixel-art-sprite.png`

### What worked
- Readable silhouette at any scale; the “low resolution” constraint forced clean shapes.
- 16-bit color palette felt intentional rather than broken.

### What didn't
- “8k upscale” in the same prompt created confusion: the AI rendered pixel clusters then smoothed them into a blurry mid-way texture.
- Limbs and hands on a 512×512 upscaled sprite are ambiguous — pixel art needs fixed resolutions, not fluid ones.

### Performance implications
- Best-in-class for runtime: tiny texture memory, no overdraw, easy batching.
- Consistency is manual but fast to iterate once a palette + grid size are locked.
- UI and menus are trivial; character sprites require pose-by-pose work.

### Las Flores fit
- **Medium.** Retro vibe is charming and fits a street-game vibe, but the Las Flores 2077 lore involves modern/neon noir that pixel art tends to flatten.
- Good for flashback sequences or overworld exploration; avoid for cinematics.

---

## 4. Watercolor Illustration

**File:** `watercolor/04-watercolor-illustration.png`

### What worked
- Soft bleed edges created an organic, hand-made feel.
- Color layering gave the impression of mood without photorealistic detail.

### What didn't
- At 512×512, granular texture dissolved into noise — watercolor needs larger canvas or procedural normal-map export.
- Figure-ground separation was weak: the character blended into the atmospheric wash.

### Performance implications
- Tricky in real-time: watercolor needs per-stroke normal maps, paper-texture albedo, and edge-darkening post-process to feel physical.
- Filter response varies wildly with mipmaps; texture bleeding is a common bug.
- Iteration speed is slow — every change propagates through multiple texture channels.

### Las Flores fit
- **Low.** Ethereal tone clashes with the neon-drenched, murder-mystery pressure of the narrative.
- Could work for specific “memory / horror of the sea” flashback, but not as a system-wide style.

---

## 5. Cyberpunk Neon Noir

**File:** `cyberpunk-neon-noir/05-cyberpunk-noir.png`

### What worked
- Atmospheric depth from volumetric lighting and wet-street reflections was immediate and readable.
- Pops of saturated neon against deep blacks strengthened mood without losing foreground-background separation.
- Blade Runner aesthetic aligned with Las Flores’ noir-tech premise almost verbatim.

### What didn't
- 512×512 compressed detail in light bloom and reflection caustics.
- Prompt bias toward pure cyberpunk (distant cityscape) rather than localized Las Flores street life.

### Performance implications
- Most demanding of the set: real-time bloom, SSAO, reflection probes, and emissive material cost are high.
- VRAM usage scales with number of light volumes and HDR targets.
- Still feasible on modern mobile if you bake the majority of lighting and reserve real-time lights for key neon sources.

### Las Flores fit
- **Very High.** The style name is almost the game’s tone spelled out.
- Wet pavement mirrors, saturated evidence neon, and inky shadows map directly to mystery cinematography.
- Recommended as primary candidate.

---

## 6. Isometric 3D Render

**File:** `isometric-3d/06-isometric-render.png`

### What worked
- Clean geometric shapes read instantly in UI/browser contexts.
- Low-poly silhouette was unambiguous even in the small preview.
- Game-asset style suggests clear interactivity.

### What didn’t
- Isometric projection flattened emotional expression — the character looked like a pawn, not a person.
- “Soft lighting” and “low-poly” are somewhat contradictory; the result was a slightly muddy, unlit mid-tone blob.

### Performance implications
- Excellent runtime: low poly counts = low fill rate and triangle counts.
- Isometric rendering is trivial to optimize (fixed camera, no dynamic shadow cascades needed).
- Great for map/tile view, inventory, social map, but bad for close-ups or conversations.

### Las Flores fit
- **High for UI / Low for narrative.** This should be the side-panel / map viewport style, not the story-telling portrait mode.

---

## Decision Matrix

| Style                  | Performance | Consistency | Pipeline | Narrative | **Total** |
|------------------------|-------------|-------------|----------|-----------|-----------|
| Modern American Comic  | 4           | 3           | 4        | 5         | **16**    |
| Anime / VN             | 5           | 3           | 5        | 3         | **16**    |
| Pixel Art (16-bit)     | 5           | 5           | 5        | 3         | **18**    |
| Watercolor             | 2           | 2           | 2        | 2         | **8**     |
| Cyberpunk Neon Noir    | 2           | 4           | 3        | 5         | **14**    |
| Isometric 3D           | 5           | 4           | 5        | 4         | **18**    |

*Scoring: 1 = worst, 5 = best*


## Recommendation

1. **Primary narrative style:** Modern American Comic + Realistic Backgrounds — highest narrative and performance score for character-driven scenes.
2. **Secondary UI style:** Isometric 3D Render — clean, performant, and system-ready for maps and menus.
3. **Special scene mode:** Pixel Art (16-bit) — keep in back pocket for memory/flashback or overworld.
4. **Supporting tone:** Cyberpunk Neon Noir — use as environmental lighting and BGM visual language rather than full character rendering.
5. **Avoid system-wide:** Watercolor and Anime VN are mismatch with Las Flores mortality-and-neon theme; reserve them for excercise/stretch scenes only.
