# Dialogue Caching & Character Casting — Exploration Proposal

**Status:** Pre-milestone exploration. Converged in discussion on 2026-08-29;
not yet scoped into file counts or an execution order. Intended as input to a
future milestone (tentatively **M54+**), sequenced after M53 and **separate
from the M50–M53 plan-intake pipeline work** — those milestones should stay
mechanical per `docs/milestones/README.md`. This proposal is expected to
*affect* the intake pipeline later (named/generic casting and variant keys
will eventually need to be plan-intake-aware), but should not be bundled into
it now.

This is unrelated to `docs/VARIANT_GENERATION_RUNBOOK.md`, which covers scene
*background image* variants (day/night/rain). "Variant" here means dialogue
text variants keyed off relationship state — a different axis of the word,
worth flagging so the two don't get conflated in search or conversation.

## Motivation

Two systems, both aimed at making replays feel distinct without paying
runtime LLM cost per line, and without hand-authoring every permutation:

- **System A — Default Answer Generation:** precompute dialogue variants keyed
  off relationship state, so cheap/cacheable "default" content still reads as
  reactive to *how* a relationship got where it is, not just a single scalar.
- **System B — Story Template + Character Casting:** author missions against
  role slots ("a gang miniboss holds the hint") rather than fixed characters,
  and cast eligible characters into those slots per playthrough — so side
  content varies without hand-authoring N missions for N characters.

Both lean on the project's core premise: **use the LLM at compile time so
runtime serving is cheap and deterministic.** Everything below assumes that
premise and optimizes within it, rather than questioning it.

## System A — Default Answer Generation

### Bucket scheme

Converged numbers: **5 tiers × 6 axes (`trust`, `familiarity`, `alignment`,
`tension`, `debt`, `visibility`) × 7 statuses.**

This is a *new*, separate derivation from `Posture` (`derivePosture()` in
`shared/src/relationshipPostures.ts`). Posture collapses axes into one coarse
gating enum (and doesn't consume `debt`/`visibility` at all) — it stays
untouched for `required_posture`/`hidden_if_posture` gating. The new
dialogue-variant key is orthogonal and lives alongside it, not inside it.

**Per-node axis selection, not a flat global grid.** A node declares which
2–3 axes are narratively "in play" for it (e.g. a debt-collection beat cares
about `debt` × `familiarity`; it doesn't need 5-way resolution on
`visibility`). Axes not declared collapse to a single default bucket for that
node. This is the actual lever that keeps the combinatorial cost tied to
narrative relevance instead of a flat 5⁶ × 7 ≈ 109,000-combo tax on every
node.

**Open follow-up (explicitly deferred, not resolved):** double-check the
5-tier × 6-axis × 7-status grid for overlapping or prunable combinations
before generation — some tier combinations may be narratively
indistinguishable or unreachable given how axes co-vary in practice, and
collapsing those early saves generation + QA cost.

### Contextual variants

Gender/age/time-of-day/etc. multiply on top of the bucket key. Apply
selectively: full contextual-variant treatment is reserved for
**named/signature nodes** (relationship milestones, mission-critical
reveals). Everyday barks/filler get bucket-only variants, no contextual
multiplier. See "Named vs. generic" below — this mirrors the same two-tier
split as character casting.

### Delivery model: CDN chunks, not per-node fetches

Content is published as **chunks**: a chunk is a run of dialogue that ends at
a decision point, and each option at that boundary names the next chunk to
fetch. The client walks the conversation by chunk-to-chunk requests keyed off
the option chosen, rather than the server resolving and streaming one node at
a time. This is what makes CDN caching actually pay off — chunks are static,
content-addressable artifacts.

### Answer identity vs. presentation

**The contract is an answer ID, not transformed text.** The server/content
layer picks a branch and returns its ID; all effects (`relationship_effect`,
flag/stat mutations) resolve from that ID only. LLM personalization is a
**presentation-only rewrite pass** on top of the chosen ID's default text —
it never influences which branch was taken or which effects fire.

Implication for the personalization call: it should receive only the chosen
ID's default text plus tone/voice context — never the surrounding state
machine or sibling candidate IDs — so a personalizing LLM can't infer or leak
branches the player didn't actually reach.

### Accepted tradeoffs (explicitly decided, not open questions)

- **Datamining/wikis are acceptable.** Caching in a CDN means motivated
  players can and will enumerate every combination. Accepted: casual players
  won't visit a wiki, and they're the audience this system is optimizing for.
- **LLM personalization drift is the player's own responsibility**, *given*
  the ID/effects boundary above holds. Once effects are guaranteed to come
  from the compiled default regardless of surface phrasing, drift is a
  cosmetic/immersion choice the player opted into, not a canon-integrity bug.

## System B — Story Template + Character Casting

- **Main story bosses are preselected** (authored, fixed). **Side-mission
  slots are cast** from a pool of eligible characters at runtime.
- **Eligibility** is expressed as gates in the same shape as the existing
  `RelationshipGateSchema` (alive, not already at a committed status like
  `PARTNER`, no prior interaction within some cooldown window, gang
  membership/age requirements, etc.) — reuse the pattern rather than
  inventing a parallel gating language.
- **Casting is pinned at the point of no return for a mission**, not
  re-evaluated live. Concretely: when the player accepts the job (or, for
  ambient/triggerless missions, on the first dialogue fetch past the
  commit point), the next call saves the cast characters for the important
  slots as a **delta** — only the slot→character assignment, not the full
  mission content. Re-evaluating eligibility after that point risks a cast
  identity "flickering" or invalidating mid-mission if the player's relation
  to that character changes elsewhere in the game.
  - Corollary: previewing/browsing a mission briefing before accepting must
    **not** burn a cast allocation, or the effective pool shrinks over time
    from abandoned previews.
- **Migration:** cast-assignment records are versioned against the template
  version they were cast from, so a later content edit to the template (or
  removal of a swapped-in character) can detect stale casts and either
  re-validate or grandfather them, rather than silently breaking old saves.

### Named vs. generic character tiers

Formalize this as an explicit tag on character/role slots rather than an
emergent accident (precedent: Pokémon trainer reuse, Cyberpunk 2077 gang
mooks vs. named characters — both accepted conventions players don't bat an
eye at):

- **`named`** — requires a large, distinct pool (background/name/asset)
  relative to how many named slots exist per playthrough. Gets the full
  System A contextual-variant investment.
- **`generic`** — small pool is fine, reuse is expected and unremarkable.
  Bucket-only dialogue variants at most, no contextual multiplier.

The sizing target that actually matters is **eligible pool size per
role-tag vs. slots-needed-per-playthrough for that tag** — not total cast
size. (Radiata Stories' 175-character roster is a useful existence proof
that a large total cast is achievable, and that most casual players not
completing every relationship is an accepted genre norm — but the
per-tag pool is the number to actually track.)

## Open risks / follow-ups for next session

1. Prune the axis-tier grid for overlap/unreachable combinations (System A,
   flagged above as unresolved).
2. Chunk design specifics: chunk sizing/boundaries, cache-busting/versioning
   for CDN chunks, and exactly where the personalization rewrite pass
   intercepts a chunk before render.
3. Schema shape for the variant key: needs a decision (e.g. a
   `variants: Record<VariantKey, ...>` map vs. one node per variant) on
   `DialogueChoiceSchema`/`EffectsSchema` before M52's admin editor UI locks
   around today's shape.
4. `PlanConsistencyChecker` (M50) is currently scoped to location/district
   mismatches and orphan edges — casting swaps introduce a new class of
   contradiction (a swapped-in character already committed elsewhere, e.g.
   already `PARTNER` via the dating track) that isn't covered yet.
5. Concrete per-role-tag pool sizing targets (named vs. generic) to hit
   before this ships.
6. Where this eventually touches plan intake / entity resolution (M50/M51):
   generated plans will need to know which roles are `named` vs `generic`
   and reason about the casting pool, not just fixed characters.
