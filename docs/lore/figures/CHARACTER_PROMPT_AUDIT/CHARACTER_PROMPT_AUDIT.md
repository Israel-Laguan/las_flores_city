# Character Prompt Audit — 20 Characters (I through L)

**Audit date:** 2026-07-07
**Scope:** 20 lore files + 20 prompt files + VST reference matrix (7 existing characters)

---

## CRITICAL FINDING

**All 20 prompt files are identical boilerplate templates.** None have been processed through the Visual Style Translator. Every prompt says "distinctive appearance fitting their background" and "calm and determined" with zero biometric specifics. No face shape, jaw, nose, eye shape, build, skin texture, or hair texture is defined. Additionally, all 20 prompts label every character as "young adult" regardless of actual age.

This means the VST uniqueness rules (no duplicate face+jaw+nose+eye combos, at least one asymmetric feature, age-appropriate skin changes) cannot be evaluated at the prompt level — the prompts contain no data to check.

---

## Character Data Extracted from Lore Files

| # | Name | Age | Ethnicity | Physical Details from Lore |
|---|------|-----|-----------|--------------------------|
| 1 | Isabella Marquez | 42 | Latina (coastal village) | None |
| 2 | Isabella Rodriguez | ~22 | Latina (City District) | Athletic build, dark hair in ponytail/bun, warm brown eyes, open smile |
| 3 | Isabella Vargas | 23 | Latin American (Eastern District) | Abstract only: observant, focused, subtle intensity in eyes |
| 4 | Isadora Morales | Unknown (Far South native) | Latina (implied, Far South) | None |
| 5 | Jan van der Meer | 41 (deceased 2060) | Dutch | None |
| 6 | Javier Mendoza | 47 | Latino (implied) | 5'10", tanned weathered skin, strong build |
| 7 | Javier Ramirez | 30 | Latino (Port Area) | 5'10", sturdy build, short dark hair, well-groomed beard, sharp brown eyes |
| 8 | Javier Salazar | 35 | Latino (Central Las Flores) | None (described as flashy/ladies' man, knock-off luxury brands) |
| 9 | Jianhua | ~87 (born ~1990s) | Chinese | None |
| 10 | Jiao Yang | Unknown | Chinese-American (Chinatown, Northeast) | None (described as vibrant, ready smile) |
| 11 | Juan Carlos Perez | 45 | Afro-Latino (Old Las Flores) | None |
| 12 | Juan Rodriguez | 78 | Indigenous activist family (San Miguel del Monte) | Deep-set eyes, rough voice from chain-smoking |
| 13 | Julian Schneider | 21 | European descent (Andean Mountains hostel) | Tousled light brown hair, bright blue eyes, polished appearance |
| 14 | Karla | 24 (deceased 2053) | Unknown (implied Latina, local farmer) | Dark hair in neat braids, defiant face |
| 15 | Kun Zhang | Elderly (retired, first-gen immigrant) | Chinese | None |
| 16 | Kusi | ~50 | Indigenous Andean (Quechua name) | None |
| 17 | Laura Rodriguez | 48 | Latina (implied, working-class Las Flores) | None |
| 18 | Levi de Jong | 24 | Dutch | Dark hair, piercing blue eyes, athletic build |
| 19 | Li Wei | 90s | Chinese (Beijing-born) | Frail, stooped posture, sharp gaze, age-spotted hands |
| 20 | Lin Xiu | 20 | Chinese (implied, port family) | Round face, bob cut |

---

## Duplicate Check

**Against existing reference matrix (7 characters):**

| Existing Character | Face | Jaw | Nose | Eyes |
|---|---|---|---|---|
| Miguel | square | strong | straight | deep-set |
| Carlos | oval | soft | straight | round |
| Ana | angular | defined | narrow | almond |
| Isabella (Rodriguez) | angular | sharp | straight | narrow |
| Alex | angular | sharp | straight | deep-set |
| Mateo | round | soft | wide | hooded |
| Rosa | heart | pointed | curved | round |

**Result:** No duplicate combos can be detected among the 20 new characters because none of their prompts contain face/jaw/nose/eye data. The VST pipeline was never invoked.

**Required action:** All 20 characters need VST processing before prompts can be validated for uniqueness.

---

## Ethnicity / Name Consistency Check

| Character | Name | Stated Ethnicity | Consistent? | Notes |
|---|---|---|---|---|
| Isabella Marquez | Spanish | Latina | YES | Coastal village origin fits |
| Isabella Rodriguez | Spanish | Latina | YES | City District upbringing fits |
| Isabella Vargas | Spanish | Latin American | YES | Eastern District, university student |
| Isadora Morales | Spanish | Latina (Far South) | YES | Far South native, Spanish name |
| Jan van der Meer | Dutch | Dutch | YES | Born Netherlands, family relocated |
| Javier Mendoza | Spanish | Latino (implied) | YES | Agricultural Valley farmer |
| Javier Ramirez | Spanish | Latino | YES | Port Area born and raised |
| Javier Salazar | Spanish | Latino (implied) | YES | Central Las Flores origin |
| Jianhua | Chinese | Chinese | YES | CLM engineer, first-gen immigrant |
| Jiao Yang | Chinese | Chinese-American | YES | Second-gen, Chinatown Northeast |
| Juan Carlos Perez | Spanish | Afro-Latino | YES | Old Las Flores, COFAVIC organizer |
| Juan Rodriguez | Spanish | Indigenous family | YES | San Miguel del Monte, indigenous activist parents |
| Julian Schneider | German/European | European descent | YES | Andean Mountains hostel family |
| Karla | Spanish | Unknown (implied Latina) | LIKELY | Local farmer, no explicit ethnicity stated |
| Kun Zhang | Chinese | Chinese | YES | First-gen immigrant, textile factory |
| Kusi | Quechua | Indigenous Andean | YES | Quechua name meaning "joy," Andean region |
| Laura Rodriguez | Spanish | Latina (implied) | YES | Working-class Las Flores neighborhood |
| Levi de Jong | Dutch | Dutch | YES | Family relocated for lithium industry |
| Li Wei | Chinese | Chinese (Beijing) | YES | Tsinghua/Wharton, founding LW Group investor |
| Lin Xiu | Chinese | Chinese (implied) | YES | Port business family |

**Summary:** All 20 characters show consistent ethnicity-name-background alignment. No mismatches found.

---

## Age Appropriateness Check

| Character | Stated Age | Prompt Says | Appropriate? | Notes |
|---|---|---|---|---|
| Isabella Marquez | 42 | "young adult" | NO | Should say "middle-aged" |
| Isabella Rodriguez | ~22 | "young adult" | YES | Correct |
| Isabella Vargas | 23 | "young adult" | YES | Correct |
| Isadora Morales | Unknown | "young adult" | UNCERTAIN | No age in lore; prompt default may be wrong |
| Jan van der Meer | 41 (deceased) | "young adult" | NO | Was middle-aged at death; portrait should reflect ~41 |
| Javier Mendoza | 47 | "young adult" | NO | Should say "middle-aged"; lore says weathered skin |
| Javier Ramirez | 30 | "young adult" | BORDERLINE | 30 is borderline; "young adult"勉强 acceptable |
| Javier Salazar | 35 | "young adult" | BORDERLINE | 35 is upper edge of "young adult" |
| Jianhua | ~87 | "young adult" | NO | Should say "elderly" |
| Jiao Yang | Unknown | "young adult" | UNCERTAIN | No age in lore |
| Juan Carlos Perez | 45 | "young adult" | NO | Should say "middle-aged" |
| Juan Rodriguez | 78 | "young adult" | NO | Should say "elderly"; VST requires receding hairline/gray streaks |
| Julian Schneider | 21 | "young adult" | YES | Correct |
| Karla | 24 (deceased) | "young adult" | YES | Correct |
| Kun Zhang | Elderly (retired) | "young adult" | NO | Should say "elderly" |
| Kusi | ~50 | "young adult" | NO | Should say "middle-aged" |
| Laura Rodriguez | 48 | "young adult" | NO | Should say "middle-aged" |
| Levi de Jong | 24 | "young adult" | YES | Correct |
| Li Wei | 90s | "young adult" | NO | Should say "elderly"; VST requires age spots, stooped posture |
| Lin Xiu | 20 | "young adult" | YES | Correct |

**Summary:** 11 of 20 characters have incorrect age labels in their prompts. All say "young adult" regardless of actual age ranging from 20 to 90s.

---

## Asymmetric / Imperfect Feature Check

Per VST rules: "Every character MUST have at least ONE asymmetric or imperfect facial feature."

| Character | Lore Mentions Imperfection? | Prompt Specifies? |
|---|---|---|
| Isabella Marquez | No | No |
| Isabella Rodriguez | No | No |
| Isabella Vargas | No | No |
| Isadora Morales | No | No |
| Jan van der Meer | No | No |
| Javier Mendoza | Weathered skin (age 47) | No |
| Javier Ramirez | No | No |
| Javier Salazar | No | No |
| Jianhua | No | No |
| Jiao Yang | No | No |
| Juan Carlos Perez | No | No |
| Juan Rodriguez | Deep-set eyes, rough voice | No |
| Julian Schneider | No | No |
| Karla | Scar on face implied (murder victim) | No |
| Kun Zhang | No | No |
| Kusi | No | No |
| Laura Rodriguez | No | No |
| Levi de Jong | No | No |
| Li Wei | Age spots, stooped posture | No |
| Lin Xiu | No | No |

**Summary:** Zero prompts specify any asymmetric or imperfect feature. Two lore files mention age-related features (Javier Mendoza weathered skin, Li Wei age spots) but these aren't translated to prompts. The VST rule requiring imperfections is universally unmet.

---

## Men/Women Over 40 Age Rules

VST requires:
- Men over 40: receding hairline, gray streaks, or thicker brows
- Women over 40: subtle lines around eyes, slight brow droop, or skin texture change

| Character | Age | Gender | VST Age Rule Applied? |
|---|---|---|---|
| Isabella Marquez | 42 | F | NO — no lines, brow droop, or skin texture in prompt |
| Javier Mendoza | 47 | M | NO — no receding hairline, gray, or thick brows in prompt |
| Juan Carlos Perez | 45 | M | NO |
| Juan Rodriguez | 78 | M | NO |
| Kun Zhang | Elderly | M | NO |
| Kusi | ~50 | M | NO |
| Laura Rodriguez | 48 | F | NO |
| Li Wei | 90s | M | NO |

**Summary:** All 8 characters over 40 are missing required age-appropriate features in their prompts.

---

## Consolidated Issues List

### Prompt-Level Issues (all 20 characters)
1. **No VST biometrics** — face shape, jaw, nose, eyes, build, skin, hair all undefined
2. **No asymmetric/imperfect features** — VST requirement universally unmet
3. **Generic age label** — all say "young adult" regardless of actual age
4. **No age-appropriate features** — men/women over 40 missing required skin/hair changes
5. **No wardrobe specificity** — all say "practical clothing" with no role-specific detail
6. **Duplicate "distinctive appearance" phrasing** — identical across all 20 prompts
7. **Missing Consumer Tags in structured output** — prompts lack the [CONSUMER: portrait] / [CONSUMER: phaser-sprite] pairing for body sheets

### Lore-Level Issues
1. **15 of 20 lore files lack physical descriptions** — cannot derive VST biometrics from lore alone
2. **Isadora Morales has no age stated** — needs clarification for prompt generation
3. **Jiao Yang has no age stated** — needs clarification
4. **Karla's ethnicity not explicitly stated** — implied Latina but not confirmed

### What Needs to Happen
Each of these 20 characters must be fed through the Visual Style Translator with their lore as input, producing:
- Unique face shape + jaw + nose + eye combinations (no duplicates against the 7 existing characters or each other)
- At least one asymmetric/imperfect feature per character
- Age-correct labels and skin/hair features
- Role-specific wardrobe descriptions
- Both face and body reference prompts
