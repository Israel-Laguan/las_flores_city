# Character Image & Video Regeneration Queue

Generated from the updated `*.prompt.md` / `*.video-prompt.md` files. Tick `[x]` when the asset is generated and saved.
Order: for each character generate the base image first, then variants (reference = the new base), then videos (input = the variant PNG, model Seedance 1.5 Pro).
Characters marked **KEEP BASE** already have an acceptable base PNG; skip the base item and use the existing file as reference.
Video extension assumed `.mp4`; adjust if your pipeline differs.

## Peter van der Meer Jr. (`peter_van_der_meer_jr`)

### Images

- [ ] **peter_van_der_meer_jr-default**
  - Reference image: none (text-to-image)
  - Save to: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__default.png`
  - Prompt:
    ```
    Premium contemporary graphic novel realism, refined editorial line art illustration, waist-up portrait of a Dutch-Latina mixed boy of about 14. Slim adolescent build with narrow shoulders and a long neck, smooth beardless olive-fair skin with soft youthful cheeks. Angular face with high cheekbones and a youthful, not yet fully defined jaw, wavy dark-blonde hair worn slightly tousled, straight nose, round warm brown eyes, thick brows with the right one sitting a fraction higher, full lips, and a small scar near the right ear. Small sport non-in-ear earbud clipped to one earlobe. Light casual collared shirt with sleeves rolled to the forearm and a small rainbow-enamel pin on the chest. Neutral relaxed resting expression with the mouth closed and relaxed, brows unfurrowed, eyes looking straight at the camera, facing front with level shoulders and arms hanging relaxed at the sides. Plain flat neutral light-grey background. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette, zero conventional beauty templates, grounded human anatomy with natural asymmetry, 8k.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, stubble, facial hair, muscular, adult, East Asian features`

- [ ] **peter_van_der_meer_jr-determined**
  - Reference image: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__default.png`
  - Save to: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__determined.png`
  - Prompt:
    ```
    Use the base portrait as reference. Round eyes steady, brows drawn slightly together, lips pressed in a firm line, looking at the camera, 3/4 take. Chin lifted a little, shoulders squared, one hand curled into a loose fist at chest height. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, stubble, facial hair, muscular, adult, East Asian features`

- [ ] **peter_van_der_meer_jr-happy**
  - Reference image: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__default.png`
  - Save to: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__happy.png`
  - Prompt:
    ```
    Use the base portrait as reference. Genuine warm smile, eyes crinkling, brows relaxed and lifted, looking at the camera, 3/4 take. Shoulders loose and slightly raised, one hand lifted in a small open wave. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, stubble, facial hair, muscular, adult, East Asian features`

- [ ] **peter_van_der_meer_jr-vulnerable**
  - Reference image: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__default.png`
  - Save to: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__vulnerable.png`
  - Prompt:
    ```
    Use the base portrait as reference. Soft guarded openness, one brow lifted, lips slightly parted, looking at the camera, 3/4 take. Shoulders drawn in a little, one hand holding the opposite forearm. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, stubble, facial hair, muscular, adult, East Asian features`

- [ ] **peter_van_der_meer_jr-angry**
  - Reference image: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__default.png`
  - Save to: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__angry.png`
  - Prompt:
    ```
    Use the base portrait as reference. Eyes narrowed, brows low and hard, lips tight, looking at the camera, 3/4 take. Shoulders squared and rigid, both hands clenched into fists at his sides. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, stubble, facial hair, muscular, adult, East Asian features`

- [ ] **peter_van_der_meer_jr-sad**
  - Reference image: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__default.png`
  - Save to: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__sad.png`
  - Prompt:
    ```
    Use the base portrait as reference. Eyes downcast and glossy, inner brows tilted up, mouth turned down, looking at the camera, 3/4 take. Shoulders slumped, head bowed slightly, arms limp with hands loosely together at the waist. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, stubble, facial hair, muscular, adult, East Asian features`

### Videos

- [ ] **peter_van_der_meer_jr-default-video**
  - Input image: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__default.png`
  - Save to: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__default.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The boy on the reference image shows a neutral composed resting expression, looking at the camera with steady presence. Subtle idle animation only: gentle breathing in the chest and shoulders, a micro-shift in weight, a barely perceptible blink cycle. Dutch-Latina mixed boy of about 14, slim adolescent build, smooth beardless olive-fair skin, wavy dark-blonde hair, round warm brown eyes, thick brows, small scar near the right ear, light collared shirt with a small rainbow-enamel pin. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **peter_van_der_meer_jr-determined-video**
  - Input image: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__determined.png`
  - Save to: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__determined.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The boy on the reference image shows a resolved, firm expression with steady unflinching eyes and a set mouth. Subtle idle animation only: deep controlled breathing in the chest and shoulders, a slight firming of the jaw, a slow unwavering blink cycle. Dutch-Latina mixed boy of about 14, slim adolescent build, smooth beardless olive-fair skin, wavy dark-blonde hair, round warm brown eyes, thick brows, small scar near the right ear, light collared shirt with a small rainbow-enamel pin. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **peter_van_der_meer_jr-happy-video**
  - Input image: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__happy.png`
  - Save to: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__happy.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The boy on the reference image shows a warm genuine smile with brightening eyes and lifted cheeks. Subtle idle animation only: buoyant breathing lifting the chest and shoulders, a soft crinkling around the eyes, a warm natural blink cycle. Dutch-Latina mixed boy of about 14, slim adolescent build, smooth beardless olive-fair skin, wavy dark-blonde hair, round warm brown eyes, thick brows, small scar near the right ear, light collared shirt with a small rainbow-enamel pin. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **peter_van_der_meer_jr-vulnerable-video**
  - Input image: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__vulnerable.png`
  - Save to: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__vulnerable.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The boy on the reference image shows a quietly vulnerable expression with open honest eyes and softened features. Subtle idle animation only: soft shallow breathing, a slow easing of tension in the shoulders, a slow tender blink. Dutch-Latina mixed boy of about 14, slim adolescent build, smooth beardless olive-fair skin, wavy dark-blonde hair, round warm brown eyes, thick brows, small scar near the right ear, light collared shirt with a small rainbow-enamel pin. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **peter_van_der_meer_jr-angry-video**
  - Input image: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__angry.png`
  - Save to: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__angry.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The boy on the reference image shows sharp anger with narrowed eyes, low brows and tight lips. Subtle idle animation only: tight breathing with visible rise and fall in the chest, a micro-clench in the jaw, a curt blink cycle. Dutch-Latina mixed boy of about 14, slim adolescent build, smooth beardless olive-fair skin, wavy dark-blonde hair, round warm brown eyes, thick brows, small scar near the right ear, light collared shirt with a small rainbow-enamel pin. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **peter_van_der_meer_jr-sad-video**
  - Input image: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__sad.png`
  - Save to: `content/characters/peter_van_der_meer_jr/assets/peter_van_der_meer_jr__sad.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The boy on the reference image shows a heavy quiet sadness with lowered glistening eyes and a downturned mouth. Subtle idle animation only: slow heavy breathing, a slight sinking of the shoulders, a slow blink with a faint lip tremor. Dutch-Latina mixed boy of about 14, slim adolescent build, smooth beardless olive-fair skin, wavy dark-blonde hair, round warm brown eyes, thick brows, small scar near the right ear, light collared shirt with a small rainbow-enamel pin. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

## Valentina Rojas (`valentina_rojas`)

### Images

- [ ] **valentina_rojas-default**
  - Reference image: none (text-to-image)
  - Save to: `content/characters/valentina_rojas/assets/valentina_rojas__default.png`
  - Prompt:
    ```
    Premium contemporary graphic novel realism, refined editorial line art illustration, waist-up portrait of an 11-year-old Latina girl from a mountain village. Small, sturdy child's frame with a round youthful face, smooth skin and un-idealized natural asymmetry. Sparkling dark brown eyes and a straight nose. Wavy black hair worn in two ponytails tied with red bands. Modest, well-kept patterned knit cardigan in warm reds, ochres and greens over a plain cream tee. She holds a small sketchbook against her chest, a pencil in one hand, its page showing a pencil drawing of mountains and a little house. Neutral relaxed resting expression with the mouth closed and relaxed, brows unfurrowed, eyes looking straight at the camera, facing front with level shoulders and arms hanging relaxed at the sides. Plain flat neutral light-grey background. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette, zero conventional beauty templates, grounded human anatomy with natural asymmetry, 8k.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, adult features, makeup, East Asian features`

- [ ] **valentina_rojas-focused**
  - Reference image: `content/characters/valentina_rojas/assets/valentina_rojas__default.png`
  - Save to: `content/characters/valentina_rojas/assets/valentina_rojas__focused.png`
  - Prompt:
    ```
    Use the base portrait as reference. Eyes intent on the page, brows knit, lips pressed in concentration, looking at the camera, 3/4 take. Head bowed slightly, sketchbook in one hand, pencil moving in the other. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, adult features, makeup, East Asian features`

- [ ] **valentina_rojas-contemplative**
  - Reference image: `content/characters/valentina_rojas/assets/valentina_rojas__default.png`
  - Save to: `content/characters/valentina_rojas/assets/valentina_rojas__contemplative.png`
  - Prompt:
    ```
    Use the base portrait as reference. Eyes softening into the middle distance, lips relaxed, head tilted, proud and a little homesick, looking at the camera, 3/4 take. Holding the open sketchbook out in front of her with both hands, shoulders relaxed. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, adult features, makeup, East Asian features`

- [ ] **valentina_rojas-happy**
  - Reference image: `content/characters/valentina_rojas/assets/valentina_rojas__default.png`
  - Save to: `content/characters/valentina_rojas/assets/valentina_rojas__happy.png`
  - Prompt:
    ```
    Use the base portrait as reference. Wide delighted smile, cheeks lifted, eyes bright, looking at the camera, 3/4 take. Shoulders bouncing up, sketchbook raised in one hand, the other hand open. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, adult features, makeup, East Asian features`

- [ ] **valentina_rojas-determined**
  - Reference image: `content/characters/valentina_rojas/assets/valentina_rojas__default.png`
  - Save to: `content/characters/valentina_rojas/assets/valentina_rojas__determined.png`
  - Prompt:
    ```
    Use the base portrait as reference. Eyes fixed, chin lifted, mouth set earnestly, looking at the camera, 3/4 take. Back straight, sketchbook clamped under one arm, free hand curled into a small fist. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, adult features, makeup, East Asian features`

- [ ] **valentina_rojas-surprised**
  - Reference image: `content/characters/valentina_rojas/assets/valentina_rojas__default.png`
  - Save to: `content/characters/valentina_rojas/assets/valentina_rojas__surprised.png`
  - Prompt:
    ```
    Use the base portrait as reference. Wide eyes, raised brows, mouth open in a small "oh", looking at the camera, 3/4 take. Shoulders lifted, sketchbook pressed to her chest, one hand rising to her cheek. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, adult features, makeup, East Asian features`

### Videos

- [ ] **valentina_rojas-default-video**
  - Input image: `content/characters/valentina_rojas/assets/valentina_rojas__default.png`
  - Save to: `content/characters/valentina_rojas/assets/valentina_rojas__default.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The girl on the reference image shows a neutral composed resting expression, looking at the camera with steady presence. Subtle idle animation only: gentle breathing in the chest and shoulders, a micro-shift in weight, a barely perceptible blink cycle. 11-year-old Latina girl with a round youthful face, sparkling dark brown eyes, wavy black hair in two ponytails with red bands, patterned knit cardigan over a cream tee, holding a small sketchbook. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **valentina_rojas-focused-video**
  - Input image: `content/characters/valentina_rojas/assets/valentina_rojas__focused.png`
  - Save to: `content/characters/valentina_rojas/assets/valentina_rojas__focused.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The girl on the reference image shows absorbed concentration with intent eyes and knit brows. Subtle idle animation only: slow controlled breathing, a subtle narrowing of the eyes, a deliberate blink cycle. 11-year-old Latina girl with a round youthful face, sparkling dark brown eyes, wavy black hair in two ponytails with red bands, patterned knit cardigan over a cream tee, holding a small sketchbook. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **valentina_rojas-contemplative-video**
  - Input image: `content/characters/valentina_rojas/assets/valentina_rojas__contemplative.png`
  - Save to: `content/characters/valentina_rojas/assets/valentina_rojas__contemplative.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The girl on the reference image shows a reflective pause with eyes softening into the middle distance. Subtle idle animation only: slow measured breathing, a gentle settling of the shoulders, a slow reflective blink. 11-year-old Latina girl with a round youthful face, sparkling dark brown eyes, wavy black hair in two ponytails with red bands, patterned knit cardigan over a cream tee, holding a small sketchbook. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **valentina_rojas-happy-video**
  - Input image: `content/characters/valentina_rojas/assets/valentina_rojas__happy.png`
  - Save to: `content/characters/valentina_rojas/assets/valentina_rojas__happy.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The girl on the reference image shows a warm genuine smile with brightening eyes and lifted cheeks. Subtle idle animation only: buoyant breathing lifting the chest and shoulders, a soft crinkling around the eyes, a warm natural blink cycle. 11-year-old Latina girl with a round youthful face, sparkling dark brown eyes, wavy black hair in two ponytails with red bands, patterned knit cardigan over a cream tee, holding a small sketchbook. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **valentina_rojas-determined-video**
  - Input image: `content/characters/valentina_rojas/assets/valentina_rojas__determined.png`
  - Save to: `content/characters/valentina_rojas/assets/valentina_rojas__determined.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The girl on the reference image shows a resolved, firm expression with steady unflinching eyes and a set mouth. Subtle idle animation only: deep controlled breathing in the chest and shoulders, a slight firming of the jaw, a slow unwavering blink cycle. 11-year-old Latina girl with a round youthful face, sparkling dark brown eyes, wavy black hair in two ponytails with red bands, patterned knit cardigan over a cream tee, holding a small sketchbook. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **valentina_rojas-surprised-video**
  - Input image: `content/characters/valentina_rojas/assets/valentina_rojas__surprised.png`
  - Save to: `content/characters/valentina_rojas/assets/valentina_rojas__surprised.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The girl on the reference image shows wide-eyed surprise with raised brows and parted lips. Subtle idle animation only: a quick small intake of breath lifting the shoulders, then a slow settle, one wide blink. 11-year-old Latina girl with a round youthful face, sparkling dark brown eyes, wavy black hair in two ponytails with red bands, patterned knit cardigan over a cream tee, holding a small sketchbook. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

## Maria Martinez van der Meer (`maria_martinez_van_der_meer`)

### Images

- [ ] **maria_martinez_van_der_meer-default**
  - Reference image: none (text-to-image)
  - Save to: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__default.png`
  - Prompt:
    ```
    Premium contemporary graphic novel realism, refined editorial line art illustration, waist-up portrait of a Latina woman in her late 50s, medium height, slender and elegant. Smooth olive skin with fine lines at the eyes and mouth, dark expressive eyes, a straight nose and a defined jaw. Dark hair with soft silver streaks gathered in a loose low chignon. Cream silk blouse with a soft collar and small pearl earrings. Neutral relaxed resting expression with the mouth closed and relaxed, brows unfurrowed, eyes looking straight at the camera, facing front with level shoulders and arms hanging relaxed at the sides. Plain flat neutral light-grey background. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette, zero conventional beauty templates, grounded human anatomy with natural asymmetry, 8k.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **maria_martinez_van_der_meer-contemplative**
  - Reference image: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__default.png`
  - Save to: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__contemplative.png`
  - Prompt:
    ```
    Use the base portrait as reference. Eyes drifting softly into the middle distance, lips relaxed, looking at the camera, 3/4 take. Head tilted slightly, one hand resting at the base of her throat. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **maria_martinez_van_der_meer-happy**
  - Reference image: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__default.png`
  - Save to: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__happy.png`
  - Prompt:
    ```
    Use the base portrait as reference. Warm radiant smile, eyes brightening, looking at the camera, 3/4 take. Shoulders relaxed, one hand lifted open as if greeting someone. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **maria_martinez_van_der_meer-tender**
  - Reference image: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__default.png`
  - Save to: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__tender.png`
  - Prompt:
    ```
    Use the base portrait as reference. Soft loving gaze, faint smile, brows gently raised, looking at the camera, 3/4 take. Leaning slightly forward, one hand extended palm-up as if offering it to someone. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **maria_martinez_van_der_meer-vulnerable**
  - Reference image: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__default.png`
  - Save to: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__vulnerable.png`
  - Prompt:
    ```
    Use the base portrait as reference. Unfocused uncertain eyes, brows drawn together, lips slightly parted, looking at the camera, 3/4 take. Shoulders drawn in, fingers worrying at the cuff of her sleeve. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **maria_martinez_van_der_meer-sad**
  - Reference image: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__default.png`
  - Save to: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__sad.png`
  - Prompt:
    ```
    Use the base portrait as reference. Eyes lowered and glistening, mouth drawn down at the corners, looking at the camera, 3/4 take. Shoulders sinking, head bowed, hands resting limp and loosely together. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

### Videos

- [ ] **maria_martinez_van_der_meer-default-video**
  - Input image: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__default.png`
  - Save to: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__default.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a neutral composed resting expression, looking at the camera with steady presence. Subtle idle animation only: gentle breathing in the chest and shoulders, a micro-shift in weight, a barely perceptible blink cycle. Latina woman in her late 50s, slender elegant frame, olive skin with fine lines, dark expressive eyes, dark hair with silver streaks in a loose low chignon, cream silk blouse, small pearl earrings. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **maria_martinez_van_der_meer-contemplative-video**
  - Input image: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__contemplative.png`
  - Save to: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__contemplative.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a reflective pause with eyes softening into the middle distance. Subtle idle animation only: slow measured breathing, a gentle settling of the shoulders, a slow reflective blink. Latina woman in her late 50s, slender elegant frame, olive skin with fine lines, dark expressive eyes, dark hair with silver streaks in a loose low chignon, cream silk blouse, small pearl earrings. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **maria_martinez_van_der_meer-happy-video**
  - Input image: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__happy.png`
  - Save to: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__happy.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a warm genuine smile with brightening eyes and lifted cheeks. Subtle idle animation only: buoyant breathing lifting the chest and shoulders, a soft crinkling around the eyes, a warm natural blink cycle. Latina woman in her late 50s, slender elegant frame, olive skin with fine lines, dark expressive eyes, dark hair with silver streaks in a loose low chignon, cream silk blouse, small pearl earrings. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **maria_martinez_van_der_meer-tender-video**
  - Input image: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__tender.png`
  - Save to: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__tender.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a soft open expression with a gentle gaze. Subtle idle animation only: soft easy breathing, a slow relaxing of the shoulders, a slow warm blink. Latina woman in her late 50s, slender elegant frame, olive skin with fine lines, dark expressive eyes, dark hair with silver streaks in a loose low chignon, cream silk blouse, small pearl earrings. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **maria_martinez_van_der_meer-vulnerable-video**
  - Input image: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__vulnerable.png`
  - Save to: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__vulnerable.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a quietly vulnerable expression with open honest eyes and softened features. Subtle idle animation only: soft shallow breathing, a slow easing of tension in the shoulders, a slow tender blink. Latina woman in her late 50s, slender elegant frame, olive skin with fine lines, dark expressive eyes, dark hair with silver streaks in a loose low chignon, cream silk blouse, small pearl earrings. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **maria_martinez_van_der_meer-sad-video**
  - Input image: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__sad.png`
  - Save to: `content/characters/maria_martinez_van_der_meer/assets/maria_martinez_van_der_meer__sad.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a heavy quiet sadness with lowered glistening eyes and a downturned mouth. Subtle idle animation only: slow heavy breathing, a slight sinking of the shoulders, a slow blink with a faint lip tremor. Latina woman in her late 50s, slender elegant frame, olive skin with fine lines, dark expressive eyes, dark hair with silver streaks in a loose low chignon, cream silk blouse, small pearl earrings. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

## Alejandro Garcia (`alejandro_garcia`)

### Images

- [ ] **alejandro_garcia-default**
  - Reference image: none (text-to-image)
  - Save to: `content/characters/alejandro_garcia/assets/alejandro_garcia__default.png`
  - Prompt:
    ```
    Premium contemporary graphic novel realism, refined editorial line art illustration, waist-up portrait of a Latino man of about 69. Stocky, sturdy build with heavy, slightly stooped shoulders. Sun-damaged leathery brown skin with deep lines across the forehead and around the eyes. Thick curly hair gone white-grey, a sweat-stained cap pushed back on his head. Thick brows with the left a fraction lower than the right, hooded dark eyes, square face, wide nose, pronounced cheekbones, full lips and short grey stubble. Calloused hands with faint grey-green stains. Faded work shirt with sleeves rolled to the elbows. Small sport non-in-ear earbud clipped to one earlobe. Neutral relaxed resting expression with the mouth closed and relaxed, brows unfurrowed, eyes looking straight at the camera, facing front with level shoulders and arms hanging relaxed at the sides. Plain flat neutral light-grey background. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette, zero conventional beauty templates, grounded human anatomy with natural asymmetry, 8k.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **alejandro_garcia-determined**
  - Reference image: `content/characters/alejandro_garcia/assets/alejandro_garcia__default.png`
  - Save to: `content/characters/alejandro_garcia/assets/alejandro_garcia__determined.png`
  - Prompt:
    ```
    Use the base portrait as reference. A set, resolved expression, jaw squared, brows drawn low and firm, looking at the camera, 3/4 take. Shoulders squared, one calloused hand clenched into a fist at his side. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **alejandro_garcia-sad**
  - Reference image: `content/characters/alejandro_garcia/assets/alejandro_garcia__default.png`
  - Save to: `content/characters/alejandro_garcia/assets/alejandro_garcia__sad.png`
  - Prompt:
    ```
    Use the base portrait as reference. Quiet heavy grief, eyes downcast and reddened, lips pressed flat, looking at the camera, 3/4 take. Shoulders sinking, head lowered, hands resting open and limp in front of him. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **alejandro_garcia-tender**
  - Reference image: `content/characters/alejandro_garcia/assets/alejandro_garcia__default.png`
  - Save to: `content/characters/alejandro_garcia/assets/alejandro_garcia__tender.png`
  - Prompt:
    ```
    Use the base portrait as reference. Soft worn warmth, eyes gentle, a faint weary smile, looking at the camera, 3/4 take. Shoulders easing, one hand reaching forward palm-up as if toward a child. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **alejandro_garcia-shocked**
  - Reference image: `content/characters/alejandro_garcia/assets/alejandro_garcia__default.png`
  - Save to: `content/characters/alejandro_garcia/assets/alejandro_garcia__shocked.png`
  - Prompt:
    ```
    Use the base portrait as reference. Sudden startlement, eyes wide, brows raised high, mouth slightly open, looking at the camera, 3/4 take. Shoulders lifting, body rocking back, one hand rising to push the cap up. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **alejandro_garcia-younger**
  - Reference image: `content/characters/alejandro_garcia/assets/alejandro_garcia__default.png`
  - Save to: `content/characters/alejandro_garcia/assets/alejandro_garcia__younger.png`
  - Prompt:
    ```
    Use the base portrait as reference. The same man about 25 years younger (early 40s): thick dark curly hair graying only at the temples, fewer lines, firmer jaw, steady tired eyes, looking at the camera, 3/4 take. Upright broad shoulders, arms relaxed, callused hands at his sides; same faded work shirt and cap. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

### Videos

- [ ] **alejandro_garcia-default-video**
  - Input image: `content/characters/alejandro_garcia/assets/alejandro_garcia__default.png`
  - Save to: `content/characters/alejandro_garcia/assets/alejandro_garcia__default.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows a neutral composed resting expression, looking at the camera with steady presence. Subtle idle animation only: gentle breathing in the chest and shoulders, a micro-shift in weight, a barely perceptible blink cycle. Latino man, stocky build, sun-damaged brown skin, thick curly hair under a sweat-stained cap, hooded dark eyes, square face, faded work shirt with sleeves rolled. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **alejandro_garcia-determined-video**
  - Input image: `content/characters/alejandro_garcia/assets/alejandro_garcia__determined.png`
  - Save to: `content/characters/alejandro_garcia/assets/alejandro_garcia__determined.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows a resolved, firm expression with steady unflinching eyes and a set mouth. Subtle idle animation only: deep controlled breathing in the chest and shoulders, a slight firming of the jaw, a slow unwavering blink cycle. Latino man, stocky build, sun-damaged brown skin, thick curly hair under a sweat-stained cap, hooded dark eyes, square face, faded work shirt with sleeves rolled. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **alejandro_garcia-sad-video**
  - Input image: `content/characters/alejandro_garcia/assets/alejandro_garcia__sad.png`
  - Save to: `content/characters/alejandro_garcia/assets/alejandro_garcia__sad.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows a heavy quiet sadness with lowered glistening eyes and a downturned mouth. Subtle idle animation only: slow heavy breathing, a slight sinking of the shoulders, a slow blink with a faint lip tremor. Latino man, stocky build, sun-damaged brown skin, thick curly hair under a sweat-stained cap, hooded dark eyes, square face, faded work shirt with sleeves rolled. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **alejandro_garcia-tender-video**
  - Input image: `content/characters/alejandro_garcia/assets/alejandro_garcia__tender.png`
  - Save to: `content/characters/alejandro_garcia/assets/alejandro_garcia__tender.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows a soft open expression with a gentle gaze. Subtle idle animation only: soft easy breathing, a slow relaxing of the shoulders, a slow warm blink. Latino man, stocky build, sun-damaged brown skin, thick curly hair under a sweat-stained cap, hooded dark eyes, square face, faded work shirt with sleeves rolled. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **alejandro_garcia-shocked-video**
  - Input image: `content/characters/alejandro_garcia/assets/alejandro_garcia__shocked.png`
  - Save to: `content/characters/alejandro_garcia/assets/alejandro_garcia__shocked.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows wide-eyed shock with high brows and a slightly open mouth. Subtle idle animation only: a sharp intake of breath lifting the shoulders, a held tension, a slow shaky exhale. Latino man, stocky build, sun-damaged brown skin, thick curly hair under a sweat-stained cap, hooded dark eyes, square face, faded work shirt with sleeves rolled. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **alejandro_garcia-younger-video**
  - Input image: `content/characters/alejandro_garcia/assets/alejandro_garcia__younger.png`
  - Save to: `content/characters/alejandro_garcia/assets/alejandro_garcia__younger.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows a steady, tired but upright expression, about 25 years younger than the base portrait. Subtle idle animation only: gentle breathing, a micro-shift in weight, a slow blink cycle. Latino man, stocky build, sun-damaged brown skin, thick curly hair under a sweat-stained cap, hooded dark eyes, square face, faded work shirt with sleeves rolled. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

## Nubia (`nubia`)

### Images

- [ ] **nubia-default**
  - Reference image: none (text-to-image)
  - Save to: `content/characters/nubia/assets/nubia__default.png`
  - Prompt:
    ```
    Premium contemporary graphic novel realism, refined editorial line art illustration, waist-up portrait of a Latina woman in her early 20s, average height, slender and strong. Warm brown, smooth, youthful skin and warm dark brown eyes. Thick, curly dark-brown hair worn loose in a natural style, small gold hoop earrings, and a small sport non-in-ear earbud clipped to one earlobe. Plain practical olive work shirt with sleeves pushed up. A small worn notebook is held against her side. Neutral relaxed resting expression with the mouth closed and relaxed, brows unfurrowed, eyes looking straight at the camera, facing front with level shoulders and arms hanging relaxed at the sides. Plain flat neutral light-grey background. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette, zero conventional beauty templates, grounded human anatomy with natural asymmetry, 8k.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **nubia-determined**
  - Reference image: `content/characters/nubia/assets/nubia__default.png`
  - Save to: `content/characters/nubia/assets/nubia__determined.png`
  - Prompt:
    ```
    Use the base portrait as reference. Quiet resolve, eyes fixed, jaw set, mouth firm, looking at the camera, 3/4 take. Chin lifted, shoulders squared, notebook gripped in a tightened fist. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **nubia-focused**
  - Reference image: `content/characters/nubia/assets/nubia__default.png`
  - Save to: `content/characters/nubia/assets/nubia__focused.png`
  - Prompt:
    ```
    Use the base portrait as reference. Eyes intent, brows knit, lips set in concentration, looking at the camera, 3/4 take. Head bowed slightly, notebook open in one hand, pen in the other. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **nubia-contemplative**
  - Reference image: `content/characters/nubia/assets/nubia__default.png`
  - Save to: `content/characters/nubia/assets/nubia__contemplative.png`
  - Prompt:
    ```
    Use the base portrait as reference. Eyes softening into the middle distance, lips relaxed, head tilted, looking at the camera, 3/4 take. Notebook hugged to her chest with both arms, shoulders easy. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **nubia-happy**
  - Reference image: `content/characters/nubia/assets/nubia__default.png`
  - Save to: `content/characters/nubia/assets/nubia__happy.png`
  - Prompt:
    ```
    Use the base portrait as reference. Warm genuine smile, eyes brightening, cheeks lifting, looking at the camera, 3/4 take. Shoulders loose, one hand raised open, notebook tucked under the other arm. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **nubia-sad**
  - Reference image: `content/characters/nubia/assets/nubia__default.png`
  - Save to: `content/characters/nubia/assets/nubia__sad.png`
  - Prompt:
    ```
    Use the base portrait as reference. Eyes lowered and glistening, mouth turned down, looking at the camera, 3/4 take. Shoulders slumped, head bowed, notebook hanging from one limp hand. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **nubia-afraid**
  - Reference image: `content/characters/nubia/assets/nubia__default.png`
  - Save to: `content/characters/nubia/assets/nubia__afraid.png`
  - Prompt:
    ```
    Use the base portrait as reference. Eyes wide, brows raised and drawn together, lips parted, looking at the camera, 3/4 take. Shoulders hunched up, notebook clutched to her chest, free hand pressed to her collarbone. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

### Videos

- [ ] **nubia-default-video**
  - Input image: `content/characters/nubia/assets/nubia__default.png`
  - Save to: `content/characters/nubia/assets/nubia__default.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a neutral composed resting expression, looking at the camera with steady presence. Subtle idle animation only: gentle breathing in the chest and shoulders, a micro-shift in weight, a barely perceptible blink cycle. Latina woman in her early 20s, slender and strong, warm brown skin, dark brown eyes, thick curly dark-brown hair worn loose, small gold hoop earrings, plain olive work shirt, holding a small notebook. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **nubia-determined-video**
  - Input image: `content/characters/nubia/assets/nubia__determined.png`
  - Save to: `content/characters/nubia/assets/nubia__determined.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a resolved, firm expression with steady unflinching eyes and a set mouth. Subtle idle animation only: deep controlled breathing in the chest and shoulders, a slight firming of the jaw, a slow unwavering blink cycle. Latina woman in her early 20s, slender and strong, warm brown skin, dark brown eyes, thick curly dark-brown hair worn loose, small gold hoop earrings, plain olive work shirt, holding a small notebook. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **nubia-focused-video**
  - Input image: `content/characters/nubia/assets/nubia__focused.png`
  - Save to: `content/characters/nubia/assets/nubia__focused.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows absorbed concentration with intent eyes and knit brows. Subtle idle animation only: slow controlled breathing, a subtle narrowing of the eyes, a deliberate blink cycle. Latina woman in her early 20s, slender and strong, warm brown skin, dark brown eyes, thick curly dark-brown hair worn loose, small gold hoop earrings, plain olive work shirt, holding a small notebook. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **nubia-contemplative-video**
  - Input image: `content/characters/nubia/assets/nubia__contemplative.png`
  - Save to: `content/characters/nubia/assets/nubia__contemplative.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a reflective pause with eyes softening into the middle distance. Subtle idle animation only: slow measured breathing, a gentle settling of the shoulders, a slow reflective blink. Latina woman in her early 20s, slender and strong, warm brown skin, dark brown eyes, thick curly dark-brown hair worn loose, small gold hoop earrings, plain olive work shirt, holding a small notebook. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **nubia-happy-video**
  - Input image: `content/characters/nubia/assets/nubia__happy.png`
  - Save to: `content/characters/nubia/assets/nubia__happy.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a warm genuine smile with brightening eyes and lifted cheeks. Subtle idle animation only: buoyant breathing lifting the chest and shoulders, a soft crinkling around the eyes, a warm natural blink cycle. Latina woman in her early 20s, slender and strong, warm brown skin, dark brown eyes, thick curly dark-brown hair worn loose, small gold hoop earrings, plain olive work shirt, holding a small notebook. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **nubia-sad-video**
  - Input image: `content/characters/nubia/assets/nubia__sad.png`
  - Save to: `content/characters/nubia/assets/nubia__sad.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a heavy quiet sadness with lowered glistening eyes and a downturned mouth. Subtle idle animation only: slow heavy breathing, a slight sinking of the shoulders, a slow blink with a faint lip tremor. Latina woman in her early 20s, slender and strong, warm brown skin, dark brown eyes, thick curly dark-brown hair worn loose, small gold hoop earrings, plain olive work shirt, holding a small notebook. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **nubia-afraid-video**
  - Input image: `content/characters/nubia/assets/nubia__afraid.png`
  - Save to: `content/characters/nubia/assets/nubia__afraid.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows guarded fear with widened eyes and tense features. Subtle idle animation only: quick shallow breathing, a slight tremor in the shoulders, a flinching blink cycle. Latina woman in her early 20s, slender and strong, warm brown skin, dark brown eyes, thick curly dark-brown hair worn loose, small gold hoop earrings, plain olive work shirt, holding a small notebook. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

## Natalia van der Meer (`natalia_van_der_meer`)

### Images

- [ ] **natalia_van_der_meer-default**
  - Reference image: none (text-to-image)
  - Save to: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__default.png`
  - Prompt:
    ```
    Premium contemporary graphic novel realism, refined editorial line art illustration, waist-up portrait of a Dutch artist of about 30. Lean, wiry build with a vivid presence. Clear fair skin. Heart-shaped face with a prominent jaw and high cheekbones. Pointed nose, almond eyes, arched brows, full lips. Wavy blonde undyed hair, messy-chic and unkempt, a faint smear of paint on the jaw. Paint-flecked denim overalls over a white long-sleeve tee with sleeves pushed up, paint-stained fingers and a small scar on one knuckle. Neutral relaxed resting expression with the mouth closed and relaxed, brows unfurrowed, eyes looking straight at the camera, facing front with level shoulders and arms hanging relaxed at the sides. Plain flat neutral light-grey background. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette, zero conventional beauty templates, grounded human anatomy with natural asymmetry, 8k.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **natalia_van_der_meer-happy**
  - Reference image: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__default.png`
  - Save to: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__happy.png`
  - Prompt:
    ```
    Use the base portrait as reference. Bright unguarded laugh, mouth open, eyes crinkling, brows lifted, looking at the camera, 3/4 take. Head thrown back slightly, shoulders shaking, one paint-stained hand pressed to her chest. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **natalia_van_der_meer-vulnerable**
  - Reference image: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__default.png`
  - Save to: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__vulnerable.png`
  - Prompt:
    ```
    Use the base portrait as reference. Soft open vulnerability, eyes wide and sincere, lips slightly parted, looking at the camera, 3/4 take. Shoulders curling in, both hands holding a paintbrush loosely in front of her. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **natalia_van_der_meer-calculating**
  - Reference image: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__default.png`
  - Save to: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__calculating.png`
  - Prompt:
    ```
    Use the base portrait as reference. Sharp appraising gaze, eyes narrowed, lips in a critical line, looking at the camera, 3/4 take. Chin raised, one arm across her body, the other hand lifted with a thumb measuring an unseen canvas. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **natalia_van_der_meer-afraid**
  - Reference image: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__default.png`
  - Save to: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__afraid.png`
  - Prompt:
    ```
    Use the base portrait as reference. Guarded startled tension, eyes widened, brows raised, lips parted, looking at the camera, 3/4 take. Shoulders up, one hand clutching the overall strap, the other held out defensively. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

### Videos

- [ ] **natalia_van_der_meer-default-video**
  - Input image: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__default.png`
  - Save to: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__default.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a neutral composed resting expression, looking at the camera with steady presence. Subtle idle animation only: gentle breathing in the chest and shoulders, a micro-shift in weight, a barely perceptible blink cycle. Dutch artist of about 30, lean wiry build, clear fair skin, heart-shaped face, wavy blonde messy-chic hair, paint-flecked denim overalls over a white long-sleeve tee, paint-stained fingers. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **natalia_van_der_meer-happy-video**
  - Input image: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__happy.png`
  - Save to: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__happy.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a warm genuine smile with brightening eyes and lifted cheeks. Subtle idle animation only: buoyant breathing lifting the chest and shoulders, a soft crinkling around the eyes, a warm natural blink cycle. Dutch artist of about 30, lean wiry build, clear fair skin, heart-shaped face, wavy blonde messy-chic hair, paint-flecked denim overalls over a white long-sleeve tee, paint-stained fingers. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **natalia_van_der_meer-vulnerable-video**
  - Input image: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__vulnerable.png`
  - Save to: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__vulnerable.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a quietly vulnerable expression with open honest eyes and softened features. Subtle idle animation only: soft shallow breathing, a slow easing of tension in the shoulders, a slow tender blink. Dutch artist of about 30, lean wiry build, clear fair skin, heart-shaped face, wavy blonde messy-chic hair, paint-flecked denim overalls over a white long-sleeve tee, paint-stained fingers. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **natalia_van_der_meer-calculating-video**
  - Input image: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__calculating.png`
  - Save to: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__calculating.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows sharp analytical thought with narrowed eyes and a measured mouth. Subtle idle animation only: slow measured breathing, a subtle micro-narrowing of the eyes, an infrequent deliberate blink. Dutch artist of about 30, lean wiry build, clear fair skin, heart-shaped face, wavy blonde messy-chic hair, paint-flecked denim overalls over a white long-sleeve tee, paint-stained fingers. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **natalia_van_der_meer-afraid-video**
  - Input image: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__afraid.png`
  - Save to: `content/characters/natalia_van_der_meer/assets/natalia_van_der_meer__afraid.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows guarded fear with widened eyes and tense features. Subtle idle animation only: quick shallow breathing, a slight tremor in the shoulders, a flinching blink cycle. Dutch artist of about 30, lean wiry build, clear fair skin, heart-shaped face, wavy blonde messy-chic hair, paint-flecked denim overalls over a white long-sleeve tee, paint-stained fingers. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

## Anna van der Meer (`anna_van_der_meer`)

### Images

- [ ] **anna_van_der_meer-default**
  - Reference image: none (text-to-image)
  - Save to: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__default.png`
  - Prompt:
    ```
    Premium contemporary graphic novel realism, refined editorial line art illustration, waist-up portrait of a Dutch woman of 36. Athletic, toned build. Fair skin, an oval face with an open, approachable look, and deep blue eyes. Dark brown hair shoulder-length and neatly styled behind the ears. Tailored charcoal suit jacket over a crisp white shirt. Neutral relaxed resting expression with the mouth closed and relaxed, brows unfurrowed, eyes looking straight at the camera, facing front with level shoulders and arms hanging relaxed at the sides. Plain flat neutral light-grey background. Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette, zero conventional beauty templates, grounded human anatomy with natural asymmetry, 8k.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **anna_van_der_meer-calculating**
  - Reference image: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__default.png`
  - Save to: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__calculating.png`
  - Prompt:
    ```
    Use the base portrait as reference. Sharp assessing focus, eyes narrowed, lips closed, looking at the camera, 3/4 take. Chin raised slightly, one hand lifted with fingertips resting against her jaw. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **anna_van_der_meer-focused**
  - Reference image: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__default.png`
  - Save to: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__focused.png`
  - Prompt:
    ```
    Use the base portrait as reference. Intense concentration, eyes sharp, brow slightly furrowed, looking at the camera, 3/4 take. Leaning forward a little, both hands gripping an unseen table edge. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **anna_van_der_meer-determined**
  - Reference image: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__default.png`
  - Save to: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__determined.png`
  - Prompt:
    ```
    Use the base portrait as reference. Resolute firm expression, eyes steady, jaw squared, looking at the camera, 3/4 take. Shoulders squared, one hand curled into a controlled fist at her waist. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **anna_van_der_meer-tender**
  - Reference image: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__default.png`
  - Save to: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__tender.png`
  - Prompt:
    ```
    Use the base portrait as reference. Soft open expression, eyes warm and gently lowered, looking at the camera, 3/4 take. Shoulders easing, one hand reaching forward palm-up. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **anna_van_der_meer-sad**
  - Reference image: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__default.png`
  - Save to: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__sad.png`
  - Prompt:
    ```
    Use the base portrait as reference. Eyes lowered and glistening, mouth drawn down, looking at the camera, 3/4 take. Shoulders sinking, head bowed, both hands resting limp at her waist. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

### Videos

- [ ] **anna_van_der_meer-default-video**
  - Input image: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__default.png`
  - Save to: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__default.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a neutral composed resting expression, looking at the camera with steady presence. Subtle idle animation only: gentle breathing in the chest and shoulders, a micro-shift in weight, a barely perceptible blink cycle. Dutch woman of 36, athletic toned build, fair skin, oval face, deep blue eyes, dark brown shoulder-length hair, charcoal suit jacket over a white shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **anna_van_der_meer-calculating-video**
  - Input image: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__calculating.png`
  - Save to: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__calculating.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows sharp analytical thought with narrowed eyes and a measured mouth. Subtle idle animation only: slow measured breathing, a subtle micro-narrowing of the eyes, an infrequent deliberate blink. Dutch woman of 36, athletic toned build, fair skin, oval face, deep blue eyes, dark brown shoulder-length hair, charcoal suit jacket over a white shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **anna_van_der_meer-focused-video**
  - Input image: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__focused.png`
  - Save to: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__focused.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows absorbed concentration with intent eyes and knit brows. Subtle idle animation only: slow controlled breathing, a subtle narrowing of the eyes, a deliberate blink cycle. Dutch woman of 36, athletic toned build, fair skin, oval face, deep blue eyes, dark brown shoulder-length hair, charcoal suit jacket over a white shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **anna_van_der_meer-determined-video**
  - Input image: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__determined.png`
  - Save to: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__determined.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a resolved, firm expression with steady unflinching eyes and a set mouth. Subtle idle animation only: deep controlled breathing in the chest and shoulders, a slight firming of the jaw, a slow unwavering blink cycle. Dutch woman of 36, athletic toned build, fair skin, oval face, deep blue eyes, dark brown shoulder-length hair, charcoal suit jacket over a white shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **anna_van_der_meer-tender-video**
  - Input image: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__tender.png`
  - Save to: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__tender.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a soft open expression with a gentle gaze. Subtle idle animation only: soft easy breathing, a slow relaxing of the shoulders, a slow warm blink. Dutch woman of 36, athletic toned build, fair skin, oval face, deep blue eyes, dark brown shoulder-length hair, charcoal suit jacket over a white shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **anna_van_der_meer-sad-video**
  - Input image: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__sad.png`
  - Save to: `content/characters/anna_van_der_meer/assets/anna_van_der_meer__sad.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a heavy quiet sadness with lowered glistening eyes and a downturned mouth. Subtle idle animation only: slow heavy breathing, a slight sinking of the shoulders, a slow blink with a faint lip tremor. Dutch woman of 36, athletic toned build, fair skin, oval face, deep blue eyes, dark brown shoulder-length hair, charcoal suit jacket over a white shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

## Cecilia Rodríguez (`cecilia_rodriguez`) — **KEEP BASE**

### Images

- [ ] **cecilia_rodriguez-sad**
  - Reference image: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__default.png` (existing)
  - Save to: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__sad.png`
  - Prompt:
    ```
    Use the base portrait as reference. Heavy quiet grief, eyes dim with memory, brows drooping, lips pressed, looking at the camera, 3/4 take. Shoulders sagging, head lowered, one hand pressed flat to her sternum. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **cecilia_rodriguez-determined**
  - Reference image: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__default.png` (existing)
  - Save to: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__determined.png`
  - Prompt:
    ```
    Use the base portrait as reference. Resolve to protect and help, eyes steady and alert, lips set, looking at the camera, 3/4 take. Shoulders squared, chin level, one hand raised palm-out as if steadying someone. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **cecilia_rodriguez-vulnerable**
  - Reference image: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__default.png` (existing)
  - Save to: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__vulnerable.png`
  - Prompt:
    ```
    Use the base portrait as reference. Rare raw openness, tired eyes glistening, lips parting, looking at the camera, 3/4 take. Shoulders drawn in, arms folded loosely across her middle. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **cecilia_rodriguez-shocked**
  - Reference image: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__default.png` (existing)
  - Save to: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__shocked.png`
  - Prompt:
    ```
    Use the base portrait as reference. Sudden terrible recognition, eyes widening, brows jumping, lips parting, looking at the camera, 3/4 take. Body snapping upright, both hands rising halfway toward her chest. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **cecilia_rodriguez-afraid**
  - Reference image: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__default.png` (existing)
  - Save to: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__afraid.png`
  - Prompt:
    ```
    Use the base portrait as reference. Wary dread, eyes wide and fixed, brows drawn up in the middle, lips pressed tight, looking at the camera, 3/4 take. Shoulders hunched, one arm drawn across her body, fingers gripping the opposite elbow. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **cecilia_rodriguez-outfit-scrubs**
  - Reference image: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__default.png` (existing)
  - Save to: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__outfit-scrubs.png`
  - Prompt:
    ```
    Use the base portrait as reference. Same woman, same bob, now wearing practical scrubs under a faded zip-up jacket with the strap of a well-worn medical bag across one shoulder, hair pulled back in a practical bun, neutral calm expression, shoulders level, looking at the camera, 3/4 take. Keep the same face, build and art style as reference, plain flat neutral light-grey backdrop. Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

### Videos

- [ ] **cecilia_rodriguez-default-video**
  - Input image: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__default.png`
  - Save to: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__default.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a neutral composed resting expression, looking at the camera with steady presence. Subtle idle animation only: gentle breathing in the chest and shoulders, a micro-shift in weight, a barely perceptible blink cycle. Latina woman of 47, athletic-compact build, heart-shaped face, tired empathetic dark eyes, weathered olive skin, straight black chin-length bob, fitted sleeveless slate-navy top. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **cecilia_rodriguez-sad-video**
  - Input image: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__sad.png`
  - Save to: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__sad.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a heavy quiet sadness with lowered glistening eyes and a downturned mouth. Subtle idle animation only: slow heavy breathing, a slight sinking of the shoulders, a slow blink with a faint lip tremor. Latina woman of 47, athletic-compact build, heart-shaped face, tired empathetic dark eyes, weathered olive skin, straight black chin-length bob, fitted sleeveless slate-navy top. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **cecilia_rodriguez-determined-video**
  - Input image: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__determined.png`
  - Save to: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__determined.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a resolved, firm expression with steady unflinching eyes and a set mouth. Subtle idle animation only: deep controlled breathing in the chest and shoulders, a slight firming of the jaw, a slow unwavering blink cycle. Latina woman of 47, athletic-compact build, heart-shaped face, tired empathetic dark eyes, weathered olive skin, straight black chin-length bob, fitted sleeveless slate-navy top. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **cecilia_rodriguez-vulnerable-video**
  - Input image: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__vulnerable.png`
  - Save to: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__vulnerable.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a quietly vulnerable expression with open honest eyes and softened features. Subtle idle animation only: soft shallow breathing, a slow easing of tension in the shoulders, a slow tender blink. Latina woman of 47, athletic-compact build, heart-shaped face, tired empathetic dark eyes, weathered olive skin, straight black chin-length bob, fitted sleeveless slate-navy top. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **cecilia_rodriguez-shocked-video**
  - Input image: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__shocked.png`
  - Save to: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__shocked.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows wide-eyed shock with high brows and a slightly open mouth. Subtle idle animation only: a sharp intake of breath lifting the shoulders, a held tension, a slow shaky exhale. Latina woman of 47, athletic-compact build, heart-shaped face, tired empathetic dark eyes, weathered olive skin, straight black chin-length bob, fitted sleeveless slate-navy top. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **cecilia_rodriguez-afraid-video**
  - Input image: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__afraid.png`
  - Save to: `content/characters/cecilia_rodriguez/assets/cecilia_rodriguez__afraid.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows guarded fear with widened eyes and tense features. Subtle idle animation only: quick shallow breathing, a slight tremor in the shoulders, a flinching blink cycle. Latina woman of 47, athletic-compact build, heart-shaped face, tired empathetic dark eyes, weathered olive skin, straight black chin-length bob, fitted sleeveless slate-navy top. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

## Rafaela (`rafaela`) — **KEEP BASE**

### Images

- [ ] **rafaela-smirk**
  - Reference image: `content/characters/rafaela/assets/rafaela__default.png` (existing)
  - Save to: `content/characters/rafaela/assets/rafaela__smirk.png`
  - Prompt:
    ```
    Use the base portrait as reference. Knowing faintly amused half-smile, full lips curling at one corner, one brow lifting, looking at the camera, 3/4 take. Head tilted slightly, one shoulder dropped, one hand turned palm-up in a dry shrug. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **rafaela-vulnerable**
  - Reference image: `content/characters/rafaela/assets/rafaela__default.png` (existing)
  - Save to: `content/characters/rafaela/assets/rafaela__vulnerable.png`
  - Prompt:
    ```
    Use the base portrait as reference. Soft exposed openness, eyes wide with sincerity, lips slightly parted, looking at the camera, 3/4 take. Shoulders softening inward, one hand drifting to her collarbone. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **rafaela-calculating**
  - Reference image: `content/characters/rafaela/assets/rafaela__default.png` (existing)
  - Save to: `content/characters/rafaela/assets/rafaela__calculating.png`
  - Prompt:
    ```
    Use the base portrait as reference. Careful weighing assessment, eyes narrowed, lips in a neutral press, one brow lowered, looking at the camera, 3/4 take. Chin slightly raised, arms crossed loosely, fingertips tapping one upper arm. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **rafaela-sad**
  - Reference image: `content/characters/rafaela/assets/rafaela__default.png` (existing)
  - Save to: `content/characters/rafaela/assets/rafaela__sad.png`
  - Prompt:
    ```
    Use the base portrait as reference. Quiet sorrow, eyes shadowed with lowered lids, mouth drawn down, looking at the camera, 3/4 take. Shoulders sinking, head bowed, both hands folded loosely at her waist. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

- [ ] **rafaela-outfit-socialite**
  - Reference image: `content/characters/rafaela/assets/rafaela__default.png` (existing)
  - Save to: `content/characters/rafaela/assets/rafaela__outfit-socialite.png`
  - Prompt:
    ```
    Use the base portrait as reference. Same woman, now in an elegant blouse with tasteful jewelry at the neck and ears, wavy dark hair elegantly styled with soft gray streaks, composed neutral expression, shoulders level, looking at the camera, 3/4 take. Keep the same face, build and art style as reference, plain flat neutral light-grey backdrop. Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, East Asian features, Northern European features`

### Videos

- [ ] **rafaela-default-video**
  - Input image: `content/characters/rafaela/assets/rafaela__default.png`
  - Save to: `content/characters/rafaela/assets/rafaela__default.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a neutral composed resting expression, looking at the camera with steady presence. Subtle idle animation only: gentle breathing in the chest and shoulders, a micro-shift in weight, a barely perceptible blink cycle. Latina woman in her mid-50s, heart-shaped face, high cheekbones, almond dark eyes, wavy dark shoulder-length hair, black scoop-neck sleeveless top. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **rafaela-smirk-video**
  - Input image: `content/characters/rafaela/assets/rafaela__smirk.png`
  - Save to: `content/characters/rafaela/assets/rafaela__smirk.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a knowing half-smile with one corner of the mouth raised. Subtle idle animation only: relaxed breathing, a faint shift of the raised mouth corner, a slow knowing blink. Latina woman in her mid-50s, heart-shaped face, high cheekbones, almond dark eyes, wavy dark shoulder-length hair, black scoop-neck sleeveless top. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **rafaela-vulnerable-video**
  - Input image: `content/characters/rafaela/assets/rafaela__vulnerable.png`
  - Save to: `content/characters/rafaela/assets/rafaela__vulnerable.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a quietly vulnerable expression with open honest eyes and softened features. Subtle idle animation only: soft shallow breathing, a slow easing of tension in the shoulders, a slow tender blink. Latina woman in her mid-50s, heart-shaped face, high cheekbones, almond dark eyes, wavy dark shoulder-length hair, black scoop-neck sleeveless top. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **rafaela-calculating-video**
  - Input image: `content/characters/rafaela/assets/rafaela__calculating.png`
  - Save to: `content/characters/rafaela/assets/rafaela__calculating.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows sharp analytical thought with narrowed eyes and a measured mouth. Subtle idle animation only: slow measured breathing, a subtle micro-narrowing of the eyes, an infrequent deliberate blink. Latina woman in her mid-50s, heart-shaped face, high cheekbones, almond dark eyes, wavy dark shoulder-length hair, black scoop-neck sleeveless top. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **rafaela-sad-video**
  - Input image: `content/characters/rafaela/assets/rafaela__sad.png`
  - Save to: `content/characters/rafaela/assets/rafaela__sad.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The woman on the reference image shows a heavy quiet sadness with lowered glistening eyes and a downturned mouth. Subtle idle animation only: slow heavy breathing, a slight sinking of the shoulders, a slow blink with a faint lip tremor. Latina woman in her mid-50s, heart-shaped face, high cheekbones, almond dark eyes, wavy dark shoulder-length hair, black scoop-neck sleeveless top. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

## Sebastian van der Meer (`sebastian_van_der_meer`) — **KEEP BASE**

### Images

- [ ] **sebastian_van_der_meer-calculating**
  - Reference image: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__default.png` (existing)
  - Save to: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__calculating.png`
  - Prompt:
    ```
    Use the base portrait as reference. Sharp strategic assessment, eyes narrowed, thin lips pressed, brows drawn low, looking at the camera, 3/4 take. Chin lowered, one hand raised with a finger resting against his lips. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **sebastian_van_der_meer-smirk**
  - Reference image: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__default.png` (existing)
  - Save to: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__smirk.png`
  - Prompt:
    ```
    Use the base portrait as reference. Thin knowing half-smile, one mouth corner raised, eyes glinting, looking at the camera, 3/4 take. Head tilted slightly, one hand slipped casually into a pocket. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **sebastian_van_der_meer-determined**
  - Reference image: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__default.png` (existing)
  - Save to: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__determined.png`
  - Prompt:
    ```
    Use the base portrait as reference. Resolved aggressive ambition, eyes steady and intense, jaw squared, lips set hard, looking at the camera, 3/4 take. Shoulders broad and taut, one hand curled into a fist at his side. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **sebastian_van_der_meer-surprised**
  - Reference image: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__default.png` (existing)
  - Save to: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__surprised.png`
  - Prompt:
    ```
    Use the base portrait as reference. Controlled sudden surprise, eyes widened, brows raised high, lips parting slightly, looking at the camera, 3/4 take. Body leaning back a fraction, one hand lifting from his side, fingers spread. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **sebastian_van_der_meer-outfit-ceo**
  - Reference image: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__default.png` (existing)
  - Save to: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__outfit-ceo.png`
  - Prompt:
    ```
    Use the base portrait as reference. Same man, now in a tailored charcoal suit with a crisp white shirt and a small plain metal pin on the lapel, neutral composed expression, shoulders squared, looking at the camera, 3/4 take. Keep the same face, build and art style as reference, plain flat neutral light-grey backdrop. Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

### Videos

- [ ] **sebastian_van_der_meer-default-video**
  - Input image: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__default.png`
  - Save to: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__default.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows a neutral composed resting expression, looking at the camera with steady presence. Subtle idle animation only: gentle breathing in the chest and shoulders, a micro-shift in weight, a barely perceptible blink cycle. Dutch man of 45, athletic-compact build, angular face, strong jaw, pale blue-grey eyes, light stubble, swept-back blond hair threaded with gray, dark navy button-up shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **sebastian_van_der_meer-calculating-video**
  - Input image: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__calculating.png`
  - Save to: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__calculating.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows sharp analytical thought with narrowed eyes and a measured mouth. Subtle idle animation only: slow measured breathing, a subtle micro-narrowing of the eyes, an infrequent deliberate blink. Dutch man of 45, athletic-compact build, angular face, strong jaw, pale blue-grey eyes, light stubble, swept-back blond hair threaded with gray, dark navy button-up shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **sebastian_van_der_meer-smirk-video**
  - Input image: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__smirk.png`
  - Save to: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__smirk.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows a knowing half-smile with one corner of the mouth raised. Subtle idle animation only: relaxed breathing, a faint shift of the raised mouth corner, a slow knowing blink. Dutch man of 45, athletic-compact build, angular face, strong jaw, pale blue-grey eyes, light stubble, swept-back blond hair threaded with gray, dark navy button-up shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **sebastian_van_der_meer-determined-video**
  - Input image: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__determined.png`
  - Save to: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__determined.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows a resolved, firm expression with steady unflinching eyes and a set mouth. Subtle idle animation only: deep controlled breathing in the chest and shoulders, a slight firming of the jaw, a slow unwavering blink cycle. Dutch man of 45, athletic-compact build, angular face, strong jaw, pale blue-grey eyes, light stubble, swept-back blond hair threaded with gray, dark navy button-up shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **sebastian_van_der_meer-surprised-video**
  - Input image: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__surprised.png`
  - Save to: `content/characters/sebastian_van_der_meer/assets/sebastian_van_der_meer__surprised.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows wide-eyed surprise with raised brows and parted lips. Subtle idle animation only: a quick small intake of breath lifting the shoulders, then a slow settle, one wide blink. Dutch man of 45, athletic-compact build, angular face, strong jaw, pale blue-grey eyes, light stubble, swept-back blond hair threaded with gray, dark navy button-up shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

## Willem van der Meer (`willem_van_der_meer`) — **KEEP BASE**

### Images

- [ ] **willem_van_der_meer-calculating**
  - Reference image: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__default.png` (existing)
  - Save to: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__calculating.png`
  - Prompt:
    ```
    Use the base portrait as reference. Sharp strategic focus, eyes narrowed, brows drawn, jaw set, looking at the camera, 3/4 take. Chin lowered, one hand rising to stroke his jaw with two fingers. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **willem_van_der_meer-contemplative**
  - Reference image: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__default.png` (existing)
  - Save to: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__contemplative.png`
  - Prompt:
    ```
    Use the base portrait as reference. Reflective pause, eyes softening into the middle distance, lips relaxed, looking at the camera, 3/4 take. Head tilted a little, hands resting together at his waist, shoulders easing. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **willem_van_der_meer-happy**
  - Reference image: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__default.png` (existing)
  - Save to: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__happy.png`
  - Prompt:
    ```
    Use the base portrait as reference. Rare measured smile, eyes crinkling, deep lines around the eyes easing, looking at the camera, 3/4 take. Shoulders loosening, one hand opening slightly at his side. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

- [ ] **willem_van_der_meer-surprised**
  - Reference image: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__default.png` (existing)
  - Save to: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__surprised.png`
  - Prompt:
    ```
    Use the base portrait as reference. Sharp controlled startle, eyes widened, brows lifted, lips parting; composure intact, looking at the camera, 3/4 take. Body stiffening upright, one hand lifting an inch from his side. Keep the same art style as reference, same clothing and backdrop (plain flat neutral light-grey). Clean confident linework, painterly soft shading, muted natural palette.
    ```
  - Negative: `--no neon, androids, anime, cartoon, text, watermarks, blurry, low quality, detailed backgrounds, environmental backgrounds, scenery, Latino features, East Asian features, African features`

### Videos

- [ ] **willem_van_der_meer-default-video**
  - Input image: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__default.png`
  - Save to: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__default.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows a neutral composed resting expression, looking at the camera with steady presence. Subtle idle animation only: gentle breathing in the chest and shoulders, a micro-shift in weight, a barely perceptible blink cycle. Dutch man in his early 60s, tall broad-shouldered, square strong-jawed face, weathered fair skin, deep-set pale blue eyes, gray hair swept back, dark tailored suit over a light blue stand-collar shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **willem_van_der_meer-calculating-video**
  - Input image: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__calculating.png`
  - Save to: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__calculating.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows sharp analytical thought with narrowed eyes and a measured mouth. Subtle idle animation only: slow measured breathing, a subtle micro-narrowing of the eyes, an infrequent deliberate blink. Dutch man in his early 60s, tall broad-shouldered, square strong-jawed face, weathered fair skin, deep-set pale blue eyes, gray hair swept back, dark tailored suit over a light blue stand-collar shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **willem_van_der_meer-contemplative-video**
  - Input image: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__contemplative.png`
  - Save to: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__contemplative.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows a reflective pause with eyes softening into the middle distance. Subtle idle animation only: slow measured breathing, a gentle settling of the shoulders, a slow reflective blink. Dutch man in his early 60s, tall broad-shouldered, square strong-jawed face, weathered fair skin, deep-set pale blue eyes, gray hair swept back, dark tailored suit over a light blue stand-collar shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **willem_van_der_meer-happy-video**
  - Input image: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__happy.png`
  - Save to: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__happy.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows a warm genuine smile with brightening eyes and lifted cheeks. Subtle idle animation only: buoyant breathing lifting the chest and shoulders, a soft crinkling around the eyes, a warm natural blink cycle. Dutch man in his early 60s, tall broad-shouldered, square strong-jawed face, weathered fair skin, deep-set pale blue eyes, gray hair swept back, dark tailored suit over a light blue stand-collar shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

- [ ] **willem_van_der_meer-surprised-video**
  - Input image: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__surprised.png`
  - Save to: `content/characters/willem_van_der_meer/assets/willem_van_der_meer__surprised.mp4`
  - Prompt:
    ```
    Create a seamless looping video. The man on the reference image shows wide-eyed surprise with raised brows and parted lips. Subtle idle animation only: a quick small intake of breath lifting the shoulders, then a slow settle, one wide blink. Dutch man in his early 60s, tall broad-shouldered, square strong-jawed face, weathered fair skin, deep-set pale blue eyes, gray hair swept back, dark tailored suit over a light blue stand-collar shirt. The background remains a static plain flat neutral background. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.
    ```

