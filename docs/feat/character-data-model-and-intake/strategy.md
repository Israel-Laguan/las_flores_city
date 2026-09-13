# Product Strategy — Character Data Model & Content Intake Direction

**Date:** 2026-09-06
**Status:** Draft
**Owner:** Israel Antonio Rosales Laguan (sole contributor / product owner)
**Feeds into:** `requirement.md` *(not yet written — see §10 gate before proceeding)*

> **Scope note.** "The idea" under challenge here is not a greenfield feature. It is the
> **direction** proposed by `docs/CHARACTER_DATA_MODEL.md` +
> `docs/DIALOGUE_CACHING_AND_CHARACTER_CASTING.md`: replace the snowflake character
> metadata with a 4-layer relational schema (vocabulary tables → promoted columns →
> join tables → mob templates), add a 3-kind dialogue taxonomy, and wire all of it into
> plan intake — in service of three stated goals: **writer intake UX**, **efficient DB
> population**, **fast/complete serving**.
>
> **Method note.** The four challenge rounds were run against repository evidence rather
> than as a live interview, per the session's execution protocol. Every number below is
> measured from this repo at HEAD `780cb60e`, not asserted. Where a strategic answer
> genuinely requires the owner and cannot be derived, it is marked
> `[TBD — validate before requirement phase]` and collected in §10.

---

## 1. Problem Statement

There are **two different problems** conflated in the source docs. Separating them is the
single most important act of this strategy review.

**Problem A — "Intake and serving are not good enough yet."** (The owner's stated goal.)
**Problem B — "Character metadata is unstructured, so it can't be used as a key."** (What
`CHARACTER_DATA_MODEL.md` actually diagnoses and solves.)

They overlap by perhaps 30%. The proposed 4-layer schema is an excellent answer to
Problem B. It is a *partial and indirect* answer to Problem A.

### 5W+H — Problem B (the one the schema solves)

| Dimension | Answer |
|---|---|
| **Who** is affected | The sole developer-author, wearing the "writer" hat, when authoring character #200+ and their dialogue; and, later, a casting/variant-generation system that does not yet exist. |
| **What** is the current situation | `characters` is `name / title / description / avatar_url / metadata JSONB` (migration `001`). Every casting-relevant attribute lives in unqueried JSONB. Measured: **182 distinct `personality` values across 192 files** (top value appears 3×); **55 of 195 characters are `faction: independent`** — NULL wearing a costume; `occupation` 57/195 as prose; `age` 57/195 mixing `45` and `"Early 20s"`; `gender` 47/195; `status` 10/195 as prose-with-date. **The doc's corpus audit was independently reproduced field-by-field and is accurate** — the only error is the denominator (195 files, not 193). Credit where due: this is an unusually honest diagnosis. |
| **Where** does it occur | Authoring time (plan intake fills up to 17 metadata fields per character) and, prospectively, casting/variant-generation time. |
| **When** does it occur | Every new character; and at the moment someone tries to write a query like "who is alive, unaffiliated, a student, in this district, at night." That query has **never been run**, because nothing consumes these fields structurally. |
| **Why** is it important to solve | It is a hard blocker for mob casting and relationship-keyed dialogue variants — the M54+ casting vision. It is **not** a blocker for anything shipping today. |
| **How** does it manifest | Not as a bug. As a *ceiling*: authoring cost per character stays flat instead of falling as the roster grows. |

**The uncomfortable finding.** `personality` is referenced in 83 places across the tree — and
in **every one of them it is consumed as free-text LLM authoring context**, never as a key:
`PromptFileGenerator.ts:92,111` (concatenated into a prompt string), `ContentContext.ts:27` and
`ContentPlanService.ts:76` (`metadata->>'personality'` into an LLM context blob),
`GraphSeedSource.ts:41-48` (seeds the Neo4j authoring graph), `LLMPrompts.ts`,
`StoryBuilderPlanOps.ts:508`. **Zero hits in `client/src` and `shared/src`.** The gameplay
`faction` hits are a *different concept entirely* — the `faction_alignment` enum
(`028_metaplot_oltp.sql:23`) on `users.alignment` and `user_reputations.faction`; neither joins
to `characters.metadata->>'faction'`.

**The dialogue serving path (`resolveChunkSpeakers` on start/choose/active) reads five character columns: `id, name, title, avatar_url, portrait_urls`; the archive route's `getSpeaker` reads four (`id, name, title, avatar_url`).** Everything the 4-layer schema promotes is, from the runtime's perspective,
**write-only.** For its only actual consumer — an LLM reading prose — 182 snowflakes are
*better* signal than 16 archetypes, not worse. The snowflake problem is a **prompt-quality and
future-casting** problem. Framing it as a runtime or serving problem would be wrong.

### 12-month goal statement

> "Within the next 12 months, the best way to achieve **a narrative game with enough
> playable dialogue content to be worth playing** is **to raise dialogue authoring
> throughput**, not to raise character-roster expressivity."

This is a deliberate rewrite of the source docs' implied goal. Justification in §7.

---

## 2. Perspective & Context

**Situation that led to the idea.** Plan intake (M50→M52) has been the dominant work
stream for ~6 weeks and is genuinely good: graph intake, entity resolution, semantic
validation, duplicate detection, annotation replies. Having built a good pipe, the natural
next question is "what shape should the water be?" — hence a data-model brainstorm. That is
a sound instinct. The risk is that a well-built pipe invites you to keep improving the pipe.

**Where the project actually is** (measured at HEAD):

| Metric | Value |
|---|---|
| Contributors | **1 human** (2,296 commits since 2026-06-15, ~12 weeks) + dependabot |
| Character YAMLs | **195** |
| Dialogue YAMLs | **60** (25 top-level + 35 in relationship subdirectories) |
| Characters with any dialogue attached | **7** |
| Total dialogue nodes (approx.) | **~280** |
| Missions | **1** |
| Scenes / Locations | 18 / 75 |
| `.prompt.md` files | 407 |
| DB migrations | 91 |
| Live players | **0** — no launch date, audience, or release statement exists in any doc |

**188 of 195 characters are mute.** The roster is ~28× larger than the dialogue that uses
it. Migration velocity (91 in 12 weeks) proves schema change is *cheap* here. Dialogue
authoring is what is expensive.

**The scale the proposal plans for.** `CHARACTER_DATA_MODEL.md:428` targets
"~55 named × 50–100 nodes each + 25 mobs × 5 nodes each + 1 mission tree × 10 nodes" ≈
**2,900–5,700 dialogue nodes**. Current output: ~280. The proposal is authoring
infrastructure for **10–20× a content volume that has never been produced at rate, by a
team of one.** That is the central strategic risk, and the source docs do not name it.

**Market forces.** None identified. There is no competitive clock, no contract, no
platform deadline, no user cohort waiting. `[TBD — validate before requirement phase]`

---

## 3. Customer, Competitor, Company (3Cs)

### Customers

The brief names three "experience targets." **Today, two of the three are the same person,
and the third does not exist.** This must be stated plainly because it changes every
downstream tradeoff.

| Segment | Description | Current spend / effort to solve | Acquisition path |
|---|---|---|---|
| **Writer** (primary, real) | The owner authoring characters/dialogue via Story Builder or direct YAML. One person. | Real and measurable. `STORY_BUILDER_INTAKE_REVIEW.md` §3 enumerates the actual pains: fill progress invisible (§3.6), fallback plans silently lossy (§3.5), no input-size guidance (§3.2), missing story-quality guardrails (§3.8). | N/A — internal |
| **Dev** (primary, real) | Same person, migrating + serving. | Low pain. 91 migrations landed cleanly; migration is idempotent with a `migration_log`; the 2026-08-27 intake stress exercise found "no coordination gap requiring a task graph or swarm." | N/A — internal |
| **Player** (aspirational) | Casual narrative/VN player. Patreon-supporter overlay hinted in README (SFW/NSFW). | **Unknown — none exist.** | `[TBD]` |
| Future collaborator-writer | A second author who is not the owner | Zero today | `[TBD]` — this is the segment the 4-layer schema *actually* serves best |

**Willingness-to-pay signal:** none available. Zero players. This is not a criticism of the
project; it is a reason to weight "reduce time-to-playable-content" far above "reduce
marginal cost of character #400."

**The dilution risk is live.** The mob-template layer serves the *future collaborator-writer
at scale* segment. Building for that segment now, before the primary segment's diagnosed
pains (§3 of the intake review) are fixed, is textbook segment dilution.

### Competitors

| Competitor | What they offer | What they do well | Gap / Weakness | Go-to-market |
|---|---|---|---|---|
| **Doing nothing** (keep JSONB metadata, add columns only when a consumer demands one) | Status quo | Zero cost; zero risk; loses nothing, because nothing reads the fields structurally today | Ceiling stays; casting stays impossible | N/A |
| **Ink / Yarn Spinner / Twine** (industry-standard narrative tooling) | Battle-tested authoring + branching + variable state | Mature editors, tooling, community, debuggers, hot-reload. This is the *real* competitor for the "writer intake UX" goal. | Not server-authoritative; no DB mirror; no LLM-assisted intake | Free / OSS |
| **Ren'Py / VN engines** | Complete VN production stack | Ships games. Actually ships games. | Monolithic; not web/server-driven | Free / OSS |
| **Cyberpunk 2077 / Radiata Stories** (cited as precedent) | AAA / mid-2000s JRPG casting systems | See challenge below | — | — |

**Challenge — the genre precedent is not sound as cited.** The docs invoke CP2077 mooks-vs-named
(`DIALOGUE_CACHING…md:174-176`) and Radiata Stories' 175-cast (`:187-189`). Both are
*existence proofs that large casts are acceptable to players* — which nobody disputes. Neither
is evidence that **a solo developer should build casting machinery before having dialogue
content.** CDPR shipped 2077 with a studio of ~500. Radiata Stories was tri-Ace with a full
production team and a 3-year cycle; its 175-character "recruit anyone" system was the *core
selling mechanic*, budgeted as such from day one. Here, casting is a *content-efficiency
measure* for a project with 7 speaking characters. The correct citation for this project's
stage is not CP2077 — it is **the failure mode of solo narrative projects that build content
tooling instead of content.** The docs, to their credit, do flag the number that matters
(`:186-189`: "eligible pool size per role-tag vs. slots-needed-per-playthrough, not total
cast size"). That number is currently **1 mission and 0 role-slots**. It cannot be computed,
which means the sizing problem the machinery solves is not yet a real problem.

**Switching cost:** N/A — no incumbent to switch from.

**Our differentiation:** LLM-at-compile-time (per `DIALOGUE_CACHING…md:31-32`) is the genuine,
defensible bet — cheap deterministic runtime with reactive-feeling content. **That
differentiation is already substantially built** (see Company/Strengths) and is not gated on
the character schema.

### Company

**Strengths (real, verified in-repo):**
- **Migration velocity.** 91 migrations in 12 weeks, idempotent, logged. Schema change is
  *cheap here* — which is an argument for doing it **later, when a consumer demands it**, not
  an argument for doing it early.
- **Content externalization is shipped and irreversible.** `ContentPublishService.publishDialogueChunk/Tree`
  is called from the real compiler (`server/src/content/compiler.ts:239`); `contentFetch.ts`
  +`DialogueResolver` (615 lines) read it back; migration `063_content_url.sql` added
  `content_url`, and **migration `076_drop_dialogue_jsonb.sql` already dropped the `nodes`/`leaves`
  JSONB columns** — the in-DB fallback no longer physically exists, gated by a coverage probe
  (`npm run probe:content-urls`) and covered by four integration/unit suites. Resolved trees are
  Redis-cached with in-flight dedupe.
  **The "serve fast to clients" goal is not blocked on the character data model — it is
  substantially already delivered.**
  Two honest caveats: (a) the "CDN" is MinIO + presigned S3 URLs; the real edge layer
  (`MediaSigner`, CloudFront/Pushr) is code-complete but its env vars are **commented out** in
  `docker-compose.prod.yml:90-92`; (b) the remaining serving work is the cache-key contracts
  already flagged in `DIALOGUE_CACHING…md` (cast-aware chunk key, tree-revision scoping, choice
  reachability) — *correctness/security* items, not schema items.
- **The suspected character-serving hot spot is not a schema problem either, and — per
  SC-S6's measurement (`docs/feat/scene-centric-backend/spikes/SC-S6-serving-baseline.md`)
  — is smaller than this section originally assumed.**
  `server/src/routes/dialogue-speakers.ts:130-140` (`resolveChunkSpeakers`) runs a bulk
  `SELECT id, name, title, avatar_url, portrait_urls FROM characters` (measured
  sub-millisecond, p50 ≈ 0.3-0.6ms — not a real cost at current or 10-20x table volume,
  despite being uncached) **plus MinIO presigning per portrait URL on every**
  `start`/`choose`/`active` response (the real cost: p50 ≈ 7ms for 44 URLs). Measured
  end-to-end, the whole function is only ~29-45% of `GET /dialogue/active`'s p50/p95 — the
  other ~70% is cursor/tree/chunk lookups and `DialogueResolver.resolveChunkForUser`'s
  state loads, not touched here. Caching the presigned URLs (the query itself doesn't need
  caching) is a real serving win, but call it "the single largest lever," not "far larger
  than any amount of schema normalization" — it addresses under half of this one endpoint's
  latency.
- **Plan intake is genuinely strong.** Graph intake, entity resolution, semantic dedupe,
  annotation parity — M50/M50c/M50d/M51 all landed.
- **Content-layering discipline** is documented and enforced (`CONTENT_DB_CORRELATION_AUDIT.md` §2).

**Gaps this idea requires that the company does not have:**
- **Authoring throughput.** The binding constraint. One person, ~280 nodes in 12 weeks. The
  4-layer schema does not add a single dialogue node.
- **A second writer.** The schema's strongest ROI (menu-driven, validated, hint-assisted
  intake) is realized when someone *other than the schema's author* uses it. That person does
  not exist.
- **A player cohort** to tell you whether any of the expressivity investment lands.

**Strategic fit — and a direct contradiction to resolve.**
`CONTENT_DB_CORRELATION_AUDIT.md` §2 and `AGENTS.md` state the contract: `content/` YAML is the
source of truth; `server/src/content/upsert.ts` is the sole write path; **"Direct DB edits
outside the migration path are considered drift."** But `CHARACTER_DATA_MODEL.md:49` specifies
Layer 1 vocabulary tables as *"editable in M52's admin UI"* — i.e. **a DB-authored source of
truth with no YAML representation.** That would create a **fourth registry** alongside
`.prompt.md`, disk assets, and `portrait_urls[]` — the *exact* drift pathology the document
opens by diagnosing. This is a design contradiction, not a nit, and it must be resolved before
any requirement is written.

---

## 4. Decision Makers

| Role | Name / Team | Involvement |
|---|---|---|
| Sponsor | Israel Antonio Rosales Laguan | Sole budget owner (own time); sole escalation path |
| Owner | Same | Day-to-day accountability |
| Supporting parties | Claude Code / nybo agent pipeline | Execution leverage; **not** a substitute for authoring judgment on 2,900+ narrative nodes |
| Potential derailers | **Sunk-cost-in-flight work.** M52/M52b are unmerged with 9 commits on `feat/plan-intake-admin-integration`. Any schema work that touches plan-intake shape collides directly with that branch. | Mitigation: merge M52/M52b before opening any schema work; see §8 Timeline |
| Absent stakeholder | **The player.** No proxy, no playtest, no cohort. | Every expressivity claim in the source docs is currently unfalsifiable |

---

## 5. Market Needs

N/A for the near term — there is no go-to-market motion, no distribution dependency, and no
external party required. The only "acquisition path" that matters at this stage is
**getting the game to a playable vertical slice** so that a first player cohort can exist at
all. The README's Patreon/overlay hint is the only monetization signal in the repo and is
`[TBD — validate before requirement phase]`.

---

## 6. Solution Goal

**Primary goal (one sentence):**
> **Make the intake→DB→serve path good enough that authoring a *speaking* character is cheap
> and safe — without pre-building casting machinery for a roster scale the project has not
> yet reached.**

Note what this deliberately excludes: mob templates, dialogue economic zones, presence
confidence scores, and the full vocabulary-table layer. Those are **deferred, not rejected** —
see §8 and the staged path in §7.

**Benefits to the organization (ranked):**

1. **Time-to-playable-content.** Anything that raises dialogue nodes/week beats anything that
   lowers cost-per-character. This is the only ranking that matters at 7 speaking characters.
2. **Correctness/safety of the serving path.** The cache-key, tree-revision, and choice-reachability
   contracts in `DIALOGUE_CACHING…md` are real exploitable gaps *today* and are cheap to close.
3. **Reduced marginal authoring cost at scale.** Genuine, but only cashes out past ~50 speaking
   characters. Currently 7.
4. **Strategic optionality for a second writer.** Real, but speculative — no such person exists.

---

## 7. Criteria for Success

**Definition of success.** Twelve months out, success is **not** "we have a 4-layer character
schema." It is: *the game has enough authored, servable, playable dialogue that a first
external player can complete a coherent slice; the writer path produced most of that content
with fewer manual repairs than today; and the schema grew exactly as much as the content
demanded — no more.* If the schema ships in full and dialogue node count is still ~280, the
initiative failed regardless of how clean the tables are.

#### Qualitative Metrics

- The owner, authoring a new speaking character end-to-end, does not hand-repair YAML after
  intake — the plan is right the first time (today: `TODO:`-prefixed prose fields are the norm,
  per `LLMPrompts.ts:186`).
- Fill progress and fallback provenance are **visible** during intake — the `outline_source:
  'fallback'` silent-degradation case (`STORY_BUILDER_INTAKE_REVIEW.md` §3.5) never surprises
  the author again.
- Expression-tagged portraits actually appear in-game, not silently collapsing to `default`.
- No new registry is introduced: vocabulary lives in exactly one authored place.

#### Quantitative Metrics

| Metric | Current baseline (measured) | 6-month target | 12-month target |
|---|---|---|---|
| **Characters with any authored dialogue** | **7 / 195** | 25 | 55 |
| **Total dialogue nodes** | **~280** | 900 | 2,500 |
| **Missions** | **1** | 5 | 15 |
| Characters with ≥2 expressions that actually **resolve** at runtime | **~0** (10/195 carry `expression:` keys; most are unmatchable compound tags; publish path never writes the field) | 55 | 195 |
| Manual YAML repairs per intake run | `[TBD — instrument before requirement phase]` | −50% | −80% |
| Plan-intake round-trip (describe→migrated) | `[TBD — latency_probe gives partial data]` | — | — |
| `faction: independent` used as a NULL stand-in | 55 / 195 | 0 | 0 |

**Challenge on the source docs' implied metrics:** `CHARACTER_DATA_MODEL.md` offers no success
metric at all — only a schema and a phase plan. A schema that cannot fail is a schema that
cannot be evaluated. The table above is the falsifiable version; the top row is the one that
decides whether this was worth doing.

#### The cheaper path that hits ~80% (challenge #4, answered)

Three of the four layers can be deferred. Evidence that the near-term goals are reachable
without them:

- **Expressions are dark for plumbing reasons, not a schema reason.** Three independent
  breaks, none of which a vocabulary table fixes:
  1. `AssetPublishService.ts:91` types the array as `Array<{ url: string; label?: string }>` and
     `:163-170` finds the entry with `label === 'dev'` and **overwrites it in place** — one
     portrait per character, `expression` never written.
  2. `AssetNeedsService.ts:57` emits exactly **one `portrait` need per character**, so the ~800
     variants promised across 407 `.prompt.md` files were never wired into asset-needs
     generation at all.
  3. Even among the 10 characters that *do* carry `expression:` keys, most tags cannot match.
     `resolvePortraitUrl.ts:15-52` does a case-insensitive **exact** match on the node's
     `visual.expression`; `valentina_quan` holds 42 entries, mostly outfit-prefixed compounds
     (`work_tender`, `street_bun_calculating`) that will never match and silently fall through
     to the untagged default. The doc's "effectively dark in production" is accurate and
     *understated*.

  **Carrying `expression` through the publish path + emitting per-expression asset needs + one
  Zod enum + a normalization rule in the resolver lights up the entire expression system with
  zero new tables.** This is the single highest-ROI item in this whole review.
- **Promoted columns alone** (`life_role`, `faction_id` nullable, `lifecycle`, `birth_year`,
  `gender`, `tier`) fix the `faction:independent`-as-NULL defect and make casting *possible
  later*, without vocabulary tables, join tables, or mob templates. `CHECK` constraints can
  stand in for lookup tables until a second author needs an editable menu.
- **Traits as a validated YAML array** (Zod enum, no `character_traits` join table) gives plan
  intake the menu-driven UX benefit immediately; promote to a join table when a query needs it.
- **`character_presence` and `mob_templates` have no consumer.** 1 mission, 0 role-slots. Build
  them when the second mission needs a cast.

**Estimated coverage of the three stated goals by this reduced path: writer intake UX ~80%,
efficient DB population ~90%, fast/complete serving ~95%** (serving was never the schema's
problem). Cost: roughly 1 migration + 2 service edits + 1 Zod change, versus ~10 tables, a
backfill of 195 files, and a dual-read window.

---

## 8. Constraints & Obstacles

| Type | Description | Impact |
|---|---|---|
| **Organizational** | **Team of one.** Every hour on schema is an hour not on dialogue. There is no parallelism to hide the cost behind. | **High** |
| **Sequencing / collision** | M52 + M52b are **unmerged**, 9 commits on `feat/plan-intake-admin-integration`, mid-review (CodeRabbit/cubic fixes already applied). The schema proposal changes `TODO_FIELDS.character` and `FILL_TARGETS` — the exact surface those commits touch (`StoryBuilderPlanOps.ts:499-521`). | **High** |
| **Phantom deadline** | The doc anchors its entire 4-phase plan to "before M54." **M54 is `legacy-plan-stage-gate-hardening` — narrowing `allowedStatuses` on the legacy stage endpoint, provenance stamping, and retiring `latency_probe.ts`.** It explicitly disclaims graph-intake and has *nothing to do with characters or casting.* Its own doc states "Predecessor: none," and the milestones README says it "**can run at any time — it targets a different pipeline entirely.**" The "M54" in `DIALOGUE_CACHING…md:5` was a *placeholder number* that the real M54 has since taken. **There is no deadline. The sequencing pressure in the source doc is an artifact of a naming collision.** | **High** |
| **Process** | `docs/milestones/README.md:92-93`: "Each milestone should be independently reviewable and mergeable. **Keep changes mechanical; avoid bundling refactors or unrelated cleanup into these milestones.**" A 4-layer schema + 195-file backfill + dual-read window is the definition of a non-mechanical bundled refactor. It needs its own milestone, cleanly after M52/M52b merge. | **Medium** |
| **Architectural contradiction** | Layer-1 vocabulary tables are specified as DB-authored/admin-editable, contradicting the YAML-is-source-of-truth contract (§3, Company). Unresolved, this manufactures a fourth registry. | **High** |
| **Technical** | 91 existing migrations (next is `092`); `characters` was created in `001_initial_schema.sql:10` and has received exactly two column additions since (`038_character_portrait_urls`, `039_character_atlas_url`) — everything else lives untyped in `metadata` JSONB. Everything promoted must be backfilled from prose across 195 files, much of it LLM-inferred and therefore requiring human review. | **Medium** |
| **Precedent** | **There is essentially no lookup/vocabulary-table precedent in this codebase.** Exactly one `CREATE TYPE ... AS ENUM` exists across all 91 migrations (`faction_alignment`, `028`). Layer 1 would introduce five new lookup tables and a pattern the project has never used — worth weighing against `CHECK` constraints, which it also barely uses. | **Medium** |
| **Financial** | Owner's time only. No cash ceiling; the ceiling is attention. | **High** (as time) |
| **Timeline** | **No real deadline exists.** No launch date, no contract, no competitor clock, no player cohort in any doc. Verified across the milestone tree and `game_design.md`. | Low — *and this is good news*: it removes the only justification for locking decisions early |

### Non-functional expectations

| Attribute | Expectation |
|---|---|
| Performance | **No dialogue-path benchmark exists anywhere in the repo.** The only perf numbers are generic k6 thresholds in `docs/stress-testing.md:65-69` (p95 < 500ms local, "150ms P95 production") — *targets*, and about `/auth/login`, not dialogue. The perf rationale in `063_content_url.sql` ("the game hot path stops reading the heavy JSONB from the DB pool") is an **asserted, never-measured** claim. **"Serve fast" is currently an ungrounded goal: there is no baseline, so no improvement can be demonstrated.** Instrument before optimizing. |
| Reliability | Migration must stay idempotent (`migration_log`); staging must stay atomic-write + rollback. Backfill must be re-runnable. |
| **Security** | **Live gaps, independent of the schema, already documented in `DIALOGUE_CACHING…md`:** unscoped `WHERE chunk_key = $1 LIMIT 1` lookup lets a client load a chunk from a different tree/revision; `handleIntraChunkChoice` does not verify the submitted `choice_id` belongs to the player's current node (effect-triggering from unreached nodes); first-fetch cast assignment needs an idempotency key. **These should be fixed regardless of whether any of this schema ships**, and arguably before it. |
| Scale | 0 concurrent players. Any scale target is fiction. `[TBD]` |

### Failure modes — how this fails despite being well-built

1. **Tooling substitutes for content.** The schema ships, is beautiful, and 12 months later
   there are still ~280 dialogue nodes. The most likely failure. The §7 top-row metric exists
   specifically to detect it early.
2. **Backfill review debt.** 195 characters × LLM-inferred archetype/life_role/lifecycle, each
   needing human review ("prompt for review" appears three times in the backfill plan). That is
   a multi-hundred-decision queue for one person, producing no new content. Half-finished, it
   strands the codebase in the dual-read window indefinitely.
3. **Fourth-registry drift.** Admin-editable vocabulary tables with no YAML source re-create
   the exact pathology being cured.
4. **Intake-shape collision.** Schema work changes `FILL_TARGETS` while M52/M52b are unmerged;
   the branch conflicts, or worse, two definitions of "what intake asks for" coexist.
5. **Premature decision lock.** The five `[DECISION]` items are locked against a deadline that
   does not exist (see §10), committing to variant economics before a single variant has been
   generated or playtested.

---

## 9. Key Sources of Insight

| Source | Type | How to reach |
|---|---|---|
| `docs/STORY_BUILDER_INTAKE_REVIEW.md` §3 | **The actual, already-diagnosed writer-intake pain list.** Nine concrete gaps; none require the 4-layer schema. | In-repo — read before writing any requirement |
| `docs/CONTENT_DB_CORRELATION_AUDIT.md` §2–3 | The content-layering contract the schema must not violate | In-repo |
| `docs/DATA_INTAKE.md` "Historical intake exercise (2026-08-27)" | Evidence the current `content_plans`/`job_runs` model is adequate: 60/60 terminal, <10s drain, worker interrupt resumed, "found no coordination gap requiring a task graph or swarm" | In-repo |
| `server/src/services/AssetPublishService.ts:89-170`, `AssetNeedsService.ts:57` | Root cause of the dark expression system — plumbing, not schema | In-repo |
| `docs/milestones/M54-legacy-plan-stage-gate-hardening.md` + `docs/milestones/README.md:83-93` | Proof the "before M54" deadline is a naming collision | In-repo |
| Corpus itself (`content/characters/*`, `content/dialogues/*`) | 195 / 60 / 7-speaking / ~280 nodes — the numbers that reframe the whole initiative | `git`-tracked; re-measure before requirement |
| **A first external playtester** | The missing input. Every expressivity claim is unfalsifiable without one. | `[TBD — no cohort exists]` |
| Ink / Yarn Spinner / Ren'Py authoring models | Prior art on narrative authoring ergonomics for small teams | External — worth one teardown before designing intake UX |

---

## 10. Strategic Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **Tooling displaces content; node count stays flat** | **High** | **High** | Gate the schema milestone on a content metric: do not start Layer 3/4 until speaking characters ≥ 25. Track §7 row 1 weekly. |
| **Backfill review debt strands the dual-read window** | High | Medium | Cap backfill to mechanically-derivable fields only (`gender` 47, `age`→`birth_year` 57, `status`→`lifecycle` 10). Leave `archetype`/`life_role` NULL and fill them **as each character gets dialogue**, not in a batch. |
| **M52/M52b branch collision on `FILL_TARGETS`** | High | Medium | Hard rule: merge `feat/plan-intake-admin-integration` before opening any intake-shape change. Non-negotiable. |
| **Fourth-registry drift from admin-editable vocab tables** | High | Medium | Resolve the source-of-truth contradiction (§3) *in the requirement*: vocabularies authored as YAML under `content/`, migrated like everything else; admin UI edits the YAML, not the table. |
| **Five `[DECISION]`s locked against a phantom deadline** | Medium | **High** | See the decision-by-decision review immediately below. Default to deferral. |
| **Genre precedent (CP2077 / Radiata) misapplied to a solo project** | Medium | Medium | Replace the precedent with the metric the docs themselves identify (`eligible pool per role-tag vs. slots-per-playthrough`) — currently uncomputable, which is itself the answer. |
| **Serving-path security gaps stay open while schema work proceeds** | **High** | Medium | Pull tree-revision scoping + choice-reachability validation *out* of the casting proposal and ship them as a standalone fix now. They are correctness bugs, not design questions. |
| **No player feedback loop; expressivity investment unvalidated** | Medium | High | Get one playable slice + one external playtester before Layer 4. |

### The five `[DECISION]` items, re-read as strategic bets (challenge #2)

Each is presented in the source doc as a technical toggle with a due date. Each is actually a
commitment, and **none of them has a real deadline** now that "before M54" is known to be a
naming collision.

| # | Decision | What it actually commits you to | Recommendation |
|---|---|---|---|
| 1 | Do lifecycle changes invalidate graph revisions? | Option B makes character death a **content-recompile event** — an ongoing compile-cost tax and a cache-invalidation surface across every published chunk. | **Defer.** Take Option A (lifecycle is not graph-triggering) as the *reversible* default; a gated `lifecycle=deceased` tree costs nothing and can be revisited. Do not add the `graph_revision_invalidates_on_lifecycle` column at all until a second mission needs it — a boolean column defaulting to FALSE that nothing reads is exactly the JSONB-snowflake pattern being cured, in a new costume. |
| 2 | Is `economic_class` a weak generation key or a pure filter? | As a generation key it **multiplies every variant by 4**, permanently, across the whole corpus. This is the highest-cost decision on the list and it is the one framed most casually. | **Defer, and default to filter-only.** Promoting a filter to a key later is additive; demoting a key means regenerating and re-QA'ing every variant. Asymmetric risk — take the cheap side. |
| 3 | Does `character_presence` carry confidence scores, or yes/no? | Weighted pools commit you to tuning a distribution and to explaining "why did I meet this NPC" bugs. Also: presence data must be *authored* for 195 characters × 4 time bands. | **Do not build the table yet.** 1 mission, 0 role-slots. This decision has no consumer. |
| 4 | How many trait tags per character? (2–3 chosen) | Variant multiplicity ×N, and the answer is already asserted in-doc without evidence ("we chose 2–3 as the sweet spot"). | **Not a real decision at this stage** — it is a generation-time knob. Make traits a validated array with no hard cap; discover the sweet spot from the first 10 authored characters. Locking it now optimizes a curve nobody has plotted. |
| 5 | Mobs generated on-demand or pre-authored? | The largest fork in the document: on-demand commits to name pools, portrait pools, trait composition, and per-save instantiation persistence — a whole subsystem. | **Defer entirely.** Zero mobs exist; zero role-slots exist. Revisit when mission #5 is authored and the pool-sizing metric can actually be computed. |

**Net:** all five should be deferred. Four of them have no consumer in the codebase, and the
fifth (economic class) has a clearly asymmetric cost profile that argues for the cheap default.
Locking them "before M54 scoping" would be locking them against nothing.

### Sequencing claim, re-examined (challenge #3)

The doc claims the rollout is *"additive, non-destructive"* and safe to backfill incrementally.
**Additive at the SQL level, yes. Non-colliding at the process level, no.** Three concrete
collision surfaces:

1. **`FILL_TARGETS` / `TODO_FIELDS.character` is shared state.** The proposal rewrites it
   (`CHARACTER_DATA_MODEL.md:348-361`) while M52/M52b are actively editing the same intake
   path on an unmerged branch.
2. **The dual-read window is a *permanent* liability if backfill stalls.** Stage 3 says "flip
   reads when backfill is >95% complete." For 195 characters requiring human review on
   archetype and life_role assignment, by one person who also has to write dialogue, >95% is a
   real risk of never arriving. Additive migrations are cheap; **half-finished migrations are
   not** — they double every read path indefinitely.
3. **The vocabulary tables are not additive at all** — they introduce a new source of truth
   under a contract that says there is only one (§3).

The honest statement is: *"the schema is additive; the rollout is a multi-week process change
that competes directly with in-flight milestone work and with content authoring."*

---

## Verdict

**The diagnosis is excellent and independently verified. The remedy is well-designed. The
timing and the framing are wrong.**

- The 4-layer schema solves **authoring-scale expressivity** (challenge #1). It overlaps the
  three stated goals by roughly a third: it helps writer intake UX *somewhat* (menus beat free
  text), helps DB population *marginally* (population was never the bottleneck — the
  2026-08-27 exercise says so explicitly), and helps serving **not at all** (CDN chunking is
  already built; the serving gaps are cache-key correctness bugs).
- The binding constraint is **dialogue authoring throughput**: 7 speaking characters, ~280
  nodes, 1 mission, one person. The proposal is infrastructure for 10–20× that volume.
- **Recommended near-term scope** — the ~80% path from §7, in priority order:
  **(a)** fix the expression publish path, per-expression asset needs, and resolver tag
  normalization — lights up a system that is already coded but starved of data;
  **(b)** close the tree-revision scoping and choice-reachability gaps — these are exploitable
  correctness bugs today, independent of any schema;
  **(c)** cache `resolveChunkSpeakers`' bulk character query and its presigned portrait URLs —
  the only real character-serving hot spot, and *first* instrument the dialogue path, since no
  baseline exists;
  **(d)** ship the still-open `STORY_BUILDER_INTAKE_REVIEW` §3 writer-UX items (fill progress,
  fallback provenance, input-size guidance, story-quality prompt guardrails) — these are the
  *actual* diagnosed writer pains;
  **(e)** add promoted columns only (`life_role`, nullable `faction_id`, `lifecycle`,
  `birth_year`, `gender`, `tier`) with `CHECK` constraints — no vocabulary tables, no join
  tables, no mob templates.
- **Defer** Layers 1, 3, 4 and all five `[DECISION]`s. Revisit at ≥25 speaking characters and
  ≥5 missions — the point at which the pool-sizing metric the docs themselves name becomes
  computable.

**Do not proceed to `/nybo-plan` on the full 4-layer direction.** Proceed to a requirement for
the reduced scope above, after the questions in the next section are answered.

---

## Open Questions — must be answered before the requirement phase

1. **Is "ship a playable slice" the actual 12-month goal, or is this project's goal the
   authoring *system* itself?** If the latter, most of this critique inverts and the 4-layer
   schema is the product. This is the one question that changes everything.
2. **Will there ever be a second writer?** The schema's best ROI is for someone who is not its
   author.
3. **Source of truth for vocabularies: YAML under `content/`, or DB rows editable in admin?**
   Cannot both be true.
4. **Is there any launch/monetization intent (the README's Patreon overlay hint), and on what
   horizon?**
5. **Baseline instrumentation:** how many manual YAML repairs per intake run today? Nothing
   measures this, and the primary writer-UX metric depends on it.
