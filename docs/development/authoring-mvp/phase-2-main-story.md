# Phase 2: Main Story Isolation

> **Goal:** Define and validate the critical path from `prologue` to `finale_complete`. Build a story arc visualizer and flow validator so authors can see story coverage and ensure all beats are reachable.
>
> **Dependencies:** None (uses existing `queryOLTP`, Redis cache, and `validate.ts` patterns)
>
> **Prerequisites:** Phase 0 complete (server endpoints working)
>
> **Status:** 🔲 Planned

---

## Tasks

### 2A — Story Arc Visualizer

**Files to create:**
- `admin/src/app/story-arc/page.tsx` — story arc page
- `admin/src/app/api/admin/story-arc/route.ts` — Next.js API proxy

**Files to modify:**
- `admin/src/app/components/AdminNav.tsx` — add `/story-arc` link

**Server endpoint:**
- Add to `admin-story-beats.ts` or create `admin-story-arc.ts`

#### `GET /admin/story-arc`

Returns the full story arc with beats and their linked content.

```json
{
  "success": true,
  "data": {
    "beats": [
      {
        "slug": "prologue",
        "label": "Prologue",
        "order": 0,
        "description": "Default state. Player has just arrived...",
        "setByDialogues": [
          { "id": "...", "name": "The Awakening", "nodeId": "node_1" }
        ],
        "requiredByScenes": [
          { "id": "...", "name": "Welcome Center", "district": "South" }
        ],
        "isReachable": true,
        "isServerSide": false
      },
      {
        "slug": "act2_mystery_active",
        "label": "Act 2 – Mystery Active",
        "order": 100,
        "description": "Set server-side when...",
        "setByDialogues": [],
        "requiredByScenes": [],
        "isReachable": false,
        "isServerSide": true,
        "notes": "Set by server-side code, not dialogue YAML. No validation needed."
      }
    ],
    "coverage": {
      "totalBeats": 7,
      "dialoguesSettingBeat": 4,
      "scenesRequiringBeat": 2,
      "serverSideBeats": 2,
      "unreachableBeats": 1
    }
  }
}
```

**Implementation notes:**
- Query `story_beats` table for all beats (ordered by `order`)
- Query `dialogue_trees` for nodes with `effects.story_beat` → identify which dialogues set each beat
- Query `scenes` for `metadata->>'required_story_beat'` → identify which scenes require each beat
- Mark beats as `isServerSide` if they're known to be set server-side (e.g., `act2_mystery_active`, `act3_finale_unlocked`)
- Compute `isReachable`: false if no dialogue sets it AND it's not server-side

**Admin UI Layout:**

```
┌─────────────────────────────────────────────┐
│ Story Arc                          [Refresh]│
├─────────────────────────────────────────────┤
│ Coverage: 5/7 beats reachable (71%)         │
│ ████████████████░░░░░░░░░░ 71%              │
│                                              │
│ Timeline:                                    │
│                                              │
│ ┌─[0] Prologue─────────────────────────┐    │
│ │ ✅ Reachable                          │    │
│ │ Set by: The Awakening                 │    │
│ │ Required by: —                        │    │
│ └───────────────────────────────────────┘    │
│       ↓                                     │
│ ┌─[10] Act 1 – Awakening────────────────┐    │
│ │ ✅ Reachable                          │    │
│ │ Set by: The Awakening (node end)      │    │
│ │ Required by: Old Town Café            │    │
│ └───────────────────────────────────────┘    │
│       ↓                                     │
│ ...                                          │
│       ↓                                     │
│ ┌─[300] Finale Complete──────────────────┐   │
│ │ ❌ Unreachable                         │   │
│ │ No dialogue sets this beat            │   │
│ │ Required by: —                        │   │
│ └───────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Verification:**
- [ ] `/story-arc` page shows all 7 beats in order
- [ ] Each beat shows which dialogues set it
- [ ] Each beat shows which scenes require it
- [ ] Server-side beats are marked as such
- [ ] Unreachable beats are highlighted in red
- [ ] Coverage bar shows percentage

---

### 2B — Story Flow Validator

**Files to modify:**
- `server/src/content/validate.ts` — add story flow validation

**Purpose:** Validate that a player can theoretically reach every beat from `prologue` by traversing dialogue `effects.story_beat` connections.

**Validation logic:**

```
Input: story_beats table (all beats with order + slug)
       dialogue_trees (nodes with effects.story_beat)
       scenes (metadata.required_story_beat)

1. Build a graph:
   - Nodes = beat slugs
   - Edges = "beat A can lead to beat B" (A before B in order)
   
2. For each beat that has a dialogue setting it:
   - Mark it as "settable"
   
3. For each beat that is server-side:
   - Mark it as "settable by server"
   
4. For each scene requiring a beat:
   - Check if the beat is settable (by dialogue or server)
   - If not, emit warning: "Scene X requires beat Y but no dialogue sets it"
   
5. Reachability check:
   - Start from 'prologue' (always settable)
   - Traverse to reachable beats by following edges
   - Any beat not reachable: emit error/warning
```

**Validation result additions:**

```typescript
// New interface in validate.ts
interface StoryFlowCheck {
  beat: string;
  label: string;
  isReachable: boolean;
  isSetByDialogue: boolean;
  isServerSide: boolean;
  requiredByScenes: string[];
  setByDialogues: string[];
  issues: string[];
}
```

**Warnings to emit:**
- "Beat X is unreachable: no dialogue sets it and it's not server-side"
- "Beat X has no dialogues that set it (possible dead end)"
- "Scene Y requires beat Z but Z is unreachable"
- "Beat X is set by dialogues but no scenes require it (no visible effect)"

**Verification:**
- [ ] Validation detects unreachable beats
- [ ] Validation detects scenes requiring unreachable beats
- [ ] Server-side beats are correctly exempted
- [ ] Existing validation still passes
- [ ] `npm run validate:content` works with new checks

---

### 2C — Main Story Content Audit

**Purpose:** Guided by the story arc visualizer and flow validator, ensure the main story path is complete and coherent.

**Audit checklist:**

1. **Beat coverage**: Every beat that should be set by a dialogue has at least one dialogue that sets it
   - `prologue` → default state (always reachable)
   - `act1_awakening` → set by `dialogue_awakening.yaml` ✅
   - `act1_city_arrived` → set by `welcome_dialogue.yaml` ✅
   - `act1_first_contact` → set by `dialogue_first_contact.yaml` ✅
   - `act2_mystery_active` → server-side (mystery join flow) ✅
   - `act3_finale_unlocked` → server-side (LeaderboardWorker) ✅
   - `finale_complete` → set by `dialogue_finale.yaml` ✅

2. **Scene gating**: Every scene with `required_story_beat` has that beat existing and settable
   - `scene_cafe.yaml` requires `act1_awakening` ✅
   - `old_town_cafe.yaml` requires `act1_awakening` ✅

3. **Dialogue flow**: Ensure the dialogues chain correctly
   - `dialogue_awakening.yaml` → ends with `effects.story_beat: act1_awakening`
   - After awakening, player can go to café (act1_awakening gated)
   - `welcome_dialogue.yaml` → sets `act1_city_arrived`
   - `dialogue_first_contact.yaml` → sets `act1_first_contact`
   - Mystery join → sets `act2_mystery_active` (server)
   - Mystery solve → sets `act3_finale_unlocked` (server)
   - `dialogue_finale.yaml` → sets `finale_complete`

4. **Gap identification**:
   - Is there a dialogue between `act1_first_contact` and `act2_mystery_active`?
     - If no, players may feel stuck. Need a dialogue that introduces mysteries.
   - Is there content for `act2_mystery_active` (during mystery)?
     - Mystery-gated dialogues should be available.
   - Is `finale_complete` dialogue accessible after mystery solve?
     - Check `dialogue_finale.yaml` appears when `act3_finale_unlocked`.

**Content files to potentially create:**
- `content/dialogues/dialogue_mystery_intro.yaml` — introduces mystery system after first contact
- Mystery-gated dialogues for `act2_mystery_active`
- Finale dialogue for `act3_finale_unlocked` → `finale_complete`

**Verification:**
- [ ] All 7 beats are reachable from `prologue`
- [ ] All scenes with `required_story_beat` have their beat settable
- [ ] Story flow validator passes with no errors
- [ ] A player can theoretically traverse from prologue to finale

---

## Verification Checklist

- [ ] `/story-arc` page shows beat timeline with content links
- [ ] Story flow validator integrated into `validate.ts`
- [ ] All beats are reachable (or documented as server-side)
- [ ] Main story path is complete (prologue → finale)
- [ ] Players can theoretically traverse the full arc
- [ ] `npm run lint --workspace=server` passes
- [ ] `npm run build --workspace=server` passes
- [ ] `npm run validate:content` passes with no new errors