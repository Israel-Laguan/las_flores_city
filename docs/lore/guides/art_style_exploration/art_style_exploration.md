# Art Style Exploration Guide for Las Flores 2077

## Goal
Generate test assets to explore different visual styles for the game. Focus on:
1. **Character portrait** (main character)
2. **Environment asset** (key location)
3. **UI element** (dialogue box or icon)

## Explored Styles

### 1. Modern American Comic + Realistic Backgrounds
- **Character:** Bold lines, dynamic pose, comic book coloring
- **Background:** Hyperrealistic locations (photo-bashing or reference)
- **Inspo:** "Spider-Verse" meets "Great Visual Novels" (e.g., Steins;Gate, Clannad)

### 2. Anime / Manga
- **Character:** Large eyes, detailed hair, expressive
- **Background:** Atmospheric, detailed environments
- **Inspo:** Studio Ghibli backgrounds + visual novel character art

### 3. Pixel Art (8-bit/16-bit)
- **Character:** Sprite sheets, limited palette
- **Background:** Tile-based, parallax layers
- **Inspo:** Retro JRPGs (Chrono Trigger, Final Fantasy VI)

### 4. Watercolor Illustration
- **Character:** Soft edges, painted texture
- **Background:** Loose brushwork, atmospheric
- **Inspo:** "The Art of Studio Ghibli" book style

### 5. Cyberpunk Neon Noir
- **Character:** Reflective surfaces, neon highlights
- **Background:** Rain-slick streets, volumetric lighting
- **Inspo:** Blade Runner 2049, Cyberpunk 2077

### 6. Isometric 3D Render
- **Character:** Low-poly or stylized 3D
- **Background:** Isometric game view
- **Inspo:** Disco Elysium, Paper Mario

## Test Prompts

### Character Template
```
[STYLE] portrait of [CHARACTER], [POSE/ACTION], [BACKGROUND DETAILS], [LIGHTING], [STYLE SPECIFICS], 8k, hyper-detailed
```

### Environment Template
```
[STYLE] view of [LOCATION], [DETAILS], [LIGHTING], [ATMOSPHERE], [STYLE SPECIFICS], 8k, ultra-detailed
```

### UI Template
```
[STYLE] UI element, [TYPE], [COLOR SCHEME], [DETAILS], [STYLE SPECIFICS], 8k
```

## Pollinations Commands

```bash
# Using image.pollinations.ai (free)
curl -s "https://image.pollinations.ai/prompt/[PROMPT]?width=512&height=512" -o output.jpg

# Using gen.pollinations.ai (requires key)
curl -s "https://gen.pollinations.ai/image/[PROMPT]?model=flux&width=512&height=512&key=$POLLINATIONS_API_KEY" -o output.jpg
```

## Output Structure
Save to `docs/lore/assets/style-exploration/[style-name]/`:
- `character.png`
- `environment.png`  
- `ui-preview.png`
- `notes.md` (what worked, what didn't)

## Decision Criteria
- **Performance:** Can the style be rendered in real-time?
- **Consistency:** Do characters match environments?
- **Pipeline:** How hard is it to iterate?
- **Las Flores fit:** Does it match the narrative tone?