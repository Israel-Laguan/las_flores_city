# Relationship Template

This document provides a reusable template for implementing the relationship system described in the Relationship Branch Blueprint. Follow this template when designing new NPC relationships.

## Naming Convention

All relationship state for a character is namespaced with `<slug>_` prefix:
- Stats: `<slug>_trust`, `<slug>_familiarity`, `<slug>_alignment`, `<slug>_tension`, `<slug>_debt`, `<slug>_visibility`
- Flags: `<slug>_first_contact_made`, `<slug>_vulnerability_shared`, etc.
- State: `<slug>_act`, `<slug>_ending`, `last_<slug>_encounter_at`

This avoids collisions and makes decay/clamp workers character-agnostic.

---

## The 5-Act Beat Sheet

Each character defines all 5 acts. Some may be observed rather than dialogue.

| Act | Beat | What the player chooses | What's recorded |
|---|---|---|---|
| 1 | First Contact (ambiguous) | approach style (cautious/direct/warm/deflecting) | `<slug>_first_contact_made` flag + approach-style state + baseline dimensions |
| 2 | World Event (unavoidable) | response to an NPC action the player didn't control | highest-weight dimension deltas + any "public stance" friction flags |
| 3 | Voluntary Disclosure (bilateral) | receive/reciprocate/use information | `<slug>_<topic>_revealed` flag + familiarity/tension deltas; gated on `<slug>_familiarity: "gte:N"` |
| 3.5 | Micro-beat (optional) | small normal moment | path-opening flag (e.g. `ANSWERED`/`DEEPENED`) — keeps the thread alive for decay |
| 4 | Pressure Point (action) | a *world action*, not a dialogue line | the 3-way branch flag (`COVERED`/`WITNESSED`/`DEFLECTED`) + large dimension deltas |
| 4.5 | Path deepening (optional) | intimacy vs. distance | path flag (`<SLUG>_PATH_ACTIVE`) + romantic/friendship tension flag |
| 5 | Resolution (earned) | nothing — the ending emerges | `story_beat: <slug>_<ending>_ending` (character-scoped) |

---

## The 6 Dimensions

| Dimension | Range | What it captures | Example low | Example high |
|---|---|---|---|---|
| **Trust** | -100 to 100 | Does this person believe what I say? | They assume I'm lying or using them | They act on my word without verification |
| **Familiarity** | 0 to 100 | How much do they know about me? | Stranger | Knows my actual history, not just what I've said |
| **Alignment** | -100 to 100 | Do we want the same things? | Actively opposing goals | Working toward the same end by different means |
| **Tension** | 0 to 100 | What's unresolved between us? | 0 = nothing to say / nowhere to go | High tension = either breaks or deepens |
| **Debt** | -100 to 100 | Who owes whom? | Negative = player owes them | Positive = they owe player |
| **Visibility** | 0 to 100 | How much do they notice me? | I'm irrelevant to their life | My actions regularly affect their world |

> **Important:** These are not good/bad axes. High tension is not bad — it's the engine of interesting relationships.

---

## Initial Baselines

Apply at Act 1 start (first encounter) via `stat_set` in the dialogue's start node:

```yaml
effects:
  stat_set:
    <slug>_trust: -20      # Slightly wary
    <slug>_alignment: -40  # Opposing roles
    <slug>_tension: 30     # Moderate tension
    <slug>_familiarity: 0 # Stranger
    <slug>_visibility: 0   # Not visible
    <slug>_debt: 0         # No debt
```

---

## Ending → Threshold Map

Lift thresholds into Act 5 `required_stats` gates. Use `gte:`/`lte:` grammar.

```yaml
# In the character's char_<slug>.yaml metadata:
relationship_endings:
  ally_of_cost:
    required_stats:
      <slug>_trust: "gte:50"
      <slug>_alignment: "gte:40"
    required_flags:
      <SLUG>_PATH_ACTIVE: true
    description: "Functional and affectless. Two professionals doing what needs doing."
  
  opponent:
    required_stats:
      <slug>_alignment: "lte:30"
      <slug>_tension: "gte:70"
    required_flags:
      WITNESSED: true
    description: "Professional threat assessment."
  
  failed_friend:
    required_stats:
      <slug>_trust: "gte:40"
      <slug>_familiarity: "gte:60"
      <slug>_tension: "gte:50"
    required_flags:
      DEFLECTED: true
    description: "Some people you almost knew."
  
  failed_lover:
    required_stats:
      <slug>_trust: "gte:60"
      <slug>_familiarity: "gte:70"
      <slug>_tension: "gte:65"
    required_flags:
      WITNESSED: true
      LOVER_PATH_ACTIVE: true
    description: "Too close for distance and too fractured for closeness."
  
  distant_presence:
    required_stats:
      <slug>_trust: "lte:50"
      <slug>_familiarity: "lte:50"
    description: "Parallel action. No personal dimension."
  
  the_mirror:
    required_stats:
      <slug>_trust: "gte:60"
      <slug>_familiarity: "gte:65"
      <slug>_alignment: "gte:40"
      <slug>_tension: "gte:50"
    required_flags:
      COVERED: true
    description: "Mutual recognition. Both compromised."
  
  # Aspirational endings (hard to reach)
  friend:
    required_stats:
      <slug>_trust: "gte:70"
      <slug>_familiarity: "gte:75"
      <slug>_alignment: "gte:65"
      <slug>_tension: "lte:40"
    required_flags:
      FRIEND_PATH_ACTIVE: true
    description: "Warmth without sentimentality."
  
  lover:
    required_stats:
      <slug>_trust: "gte:75"
      <slug>_familiarity: "gte:80"
      <slug>_alignment: "gte:60"
      <slug>_tension: "gte:30"
    required_flags:
      LOVER_PATH_ACTIVE: true
      ROMANTIC_TENSION_CONFIRMED: true
    description: "Tender, careful, slightly afraid."
```

---

## Friction Convention

A choice on character B may carry `hidden_if` referencing character A's flag:

```yaml
# In character B's dialogue
choices:
  - id: trust_choice
    text: "Share sensitive information"
    next_node_id: b_trust_path
    hidden_if:
      adeyemi_publicly_denounced: true  # Can't trust B if you denounce A
```

Friction flags are set by high-stakes choices on character A. Document each friction pair in the character's lore file.

---

## Decay Convention

Every encounter's end-node effect updates `last_<slug>_encounter_at`:

```yaml
effects:
  state_set:
    last_adeyemi_encounter_at: NOW
```

The decay worker (`RelationshipDecayWorker`) reads this to compute elapsed days and applies:
- Trust: -2 per day (floor: -100)
- Familiarity: -1 per day (floor: 0)
- Tension: +1 per day (ceiling: 100)

---

## Time Block Cost

Add `time_block_cost` to relationship choices (Acts 1-4) to implement Rule 3 (cost of intimacy):

```yaml
choices:
  - id: engage_choice
    text: "Engage with character"
    next_node_id: next_node
    time_block_cost:
      amount: 1
      description: "Engaging with <Character>"
```

Keep "normal moment" (NM) encounters free (amount: 0 or omitted).

---

## Dialogue Gating

Use the three player-state channels correctly:

### Flags (`flag_set` / `required_flags` / `hidden_if`)
- Boolean: presence of key = true, absence = false
- Use for: binary states, path flags, event completion
- Example: `adeyemi_first_contact_made: true`

### State (`state_set` / `required_state` / `hidden_if_state`)
- Categorical strings
- Use for: character-scoped progress, timestamps
- Example: `adeyemi_act: "1_done"`, `last_adeyemi_encounter_at: NOW`

### Stats (`stat_set` / `required_stats` / `hidden_if_stats`)
- Numeric, additive
- Clamped to [-100, 100] for relationship stats
- Use `op:number` grammar: `gte:70`, `lte:50`, `gt:40`, `lt:30`, `eq:0`, `ne:0`
- Example: `adeyemi_trust: 15`

---

## Wiring Dialogues

### Character-Scoped Dialogues
Add dialogue UUIDs to the character's `available_dialogues` array in `char_<slug>.yaml`:

```yaml
available_dialogues:
  - <dialogue-uuid-1>
  - <dialogue-uuid-2>
```

### Scene-Scoped Dialogues
For location-specific encounters, add to the scene's `available_dialogues` and ensure the character is in the scene's `npcs` array:

```yaml
# In scene_<location>.yaml
npcs:
  - <character-uuid>
available_dialogues:
  - <dialogue-uuid>
```

### Dialogue Scope
- Use `dialogue_scope: character` for character-specific dialogues
- Use `dialogue_scope: scene` for location-specific dialogues
- Set `character_id` for character dialogues, `scene_id` for scene dialogues

---

## Content Checklist

Before a character is complete, verify:

- [ ] 5 acts defined (Acts 3.5 and 4.5 optional)
- [ ] 6 dimensions tracked via stats
- [ ] All dialogue files have valid YAML
- [ ] Dialogues wired to character or scenes
- [ ] Initial baselines applied in Act 1
- [ ] Time block costs on Act 1-4 choices
- [ ] Act 5 gated by dimension thresholds
- [ ] End nodes set `last_<slug>_encounter_at: NOW`
- [ ] Character added to relevant scene `npcs` arrays
- [ ] Character YAML has `relationship_endings` with correct grammar (`gte:`/`lte:`, record-form `required_flags`)

---

## Engine Support

The following engine components support this template:

1. **Three state channels**: flags, state, stats (see `shared/src/schemas/dialogue.ts`)
2. **Gating**: `required_flags`, `required_state`, `required_stats` on choices and metadata
3. **Numeric comparisons**: `gte:`, `lte:`, `gt:`, `lt:`, `eq:`, `ne:` grammar
4. **Decay worker**: `RelationshipDecayWorker` (daily cron)
5. **Stat clamping**: `mergeStatsClamped` for relationship prefixes
6. **Timestamp support**: `NOW` marker in state_set values

---

## Anti-Patterns to Avoid

- ❌ **Dialogue maze**: Long conversation trees where every path reaches the same outcome
- ❌ **Waiting NPC**: Character whose entire arc is triggered by the player
- ❌ **Optional confession**: Backstory moment that feels like a collectible
- ❌ **Clean ending**: Resolution that feels like a reward
- ❌ **Relationship inflation**: Every character the player spends time with becomes an ally
- ❌ **Explained emotion**: NPC tells the player what they're feeling
- ❌ **Symmetric options**: Both choices look equally viable and equally good
- ❌ **List-form required_flags**: Use record form `key: true`, not array form `- key`
- ❌ **conditions: block**: Use direct gates (`required_flags`, etc.), not nested `conditions:`
