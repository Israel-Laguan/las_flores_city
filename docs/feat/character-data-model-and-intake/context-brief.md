# Character & Story Content Pipeline — Context Brief for Independent Review

**Purpose of this document:** brief an outside expert who has no prior context on this
project. It describes the game, the people who touch content, what's broken today, and
what "good" looks like — deliberately **without** proposing tables, schemas, or a data
model. We have an internal draft schema (`CHARACTER_DATA_MODEL.md`) and a strategic
critique of that draft (`strategy.md`, same folder), but we want an independent read
first. **Please form your own view of the right structure and process before reading
those** — or read them last, specifically to critique them, not to confirm them. Tell us
if our diagnosis of the problem is wrong, not just whether our proposed fix is elegant.

---

## 1. What this game is

Las Flores 2077 is a **server-driven visual novel** — narrative-driven social
simulation with a competitive mystery layer. "Server-driven" is load-bearing: the server
is the source of truth for what happens next, and the client (Phaser/PixiJS) renders
what the server dictates. There's no client-side story logic to speak of.

The player-facing surface is:

- **Dialogue trees** — branching conversations gated by relationship state, flags, and
  time-of-day, authored as content and walked node-by-node (or, in the newer delivery
  model, chunk-by-chunk — see §4).
- **A phone-overlay UI** layered over world/location scenes — in-fiction apps (Messages,
  a banking app, a social feed, an identity app) that also surface narrative content.
- **A world of districts/locations** populated by characters the player can encounter,
  talk to, and build relationships with.

It is not a hand-drawn-background classic VN engine; it's closer to a bespoke narrative
runtime with a VN-shaped player experience.

## 2. Who touches this pipeline, and what "good" looks like for each

Three roles, three different definitions of success. All three need to hold
simultaneously — optimizing one at the expense of the others is not a win.

**The writer.** Wants to describe a story idea, a character, or an edit to something
that already exists, in natural language, and have the system:
- turn that into structured entities (characters, locations, dialogue, missions, story
  beats) they can review before anything becomes canon,
- catch problems *while they're still editable* — inconsistencies, missing fields,
  contradictions with existing canon, broken references — rather than downstream,
- offer **hints**, not just validation errors: "characters in this role usually also
  have X", "this trait conflicts with that relationship", "you haven't given this
  character a way to speak yet."

**The developer/operator.** Wants that same writer-approved plan to land in the
database completely and correctly with no manual repair step, in a way that:
- is efficient to populate (no N+1 write storms, no re-deriving the same values by hand
  for every character),
- is safe to re-run (idempotent migration, no duplicate or orphaned rows),
- doesn't require a human to reconcile drift between "what the writer wrote," "what got
  generated," and "what's actually live" (see §3 — this drift already exists today).

**The player.** Wants content that is:
- **fast** — dialogue and assets need to load without a visible stall, ideally served
  from a CDN rather than round-tripped through the app server on every request,
- **complete** — no missing portraits, no dead-end dialogue nodes, no character who is
  supposed to be able to talk but silently can't.

## 3. What's true about the pipeline today

### 3.1 Three ways content is authored

1. **Direct YAML authoring** — the baseline. Authors hand-edit YAML under `content/`,
   then run validation (Zod schemas + XSS checks + story-flow reachability checks) and
   migration (YAML → Postgres upsert, idempotent via a migration log). Most existing
   content was made this way.
2. **Story Builder** — a wizard: writer describes something in natural language → an
   LLM proposes a structured plan → writer reviews/refines/approves → the plan is
   staged as YAML (validated before any DB write) → migrated to Postgres → assets
   generated/assigned. This is the intended high-leverage path for new content going
   forward.
3. **Lore + asset generation** — narrative markdown under `docs/lore/` feeds a prompt-
   generation step, which feeds an external art pipeline, whose output (images) gets
   assigned back onto content YAML.

### 3.2 There is a graph database in the loop, and it is *not* the runtime store

An optional Neo4j instance sits in the authoring path as a **disposable intermediate
representation** — never in the game's runtime hot path, and the server must keep
working if Neo4j is unavailable. Canon content seeds into Neo4j as nodes; a writer's
proposed changes become tagged `ADD`/`MODIFY`/`DELETE` deltas against that graph, which
support reasoning/critique *before* anything is committed (e.g., detecting a
contradiction with existing canon that a flat plan diff wouldn't surface). Those deltas
are then exported back into the same `ContentPlan` → stage → migrate → verify pipeline
described above. **Postgres remains the durable source of truth throughout** — the
graph is a reasoning layer over authoring, not a second database of record. Plans move
through an explicit status lifecycle (draft → proposed → approved → staged → migrated →
verified, plus failed/rejected terminal states) tracked in Postgres.

We mention this because the user's framing — "writer explains their idea and an LLM
creates entities that are saved in a graph db to be captured as a plan, then when
approved we save into db and cdn" — is close to what's already built, but the graph's
actual role (authoring-time reasoning IR, not storage of record) matters for anyone
proposing changes to it.

### 3.3 How content is served today

Assets (portraits, generated images) live in object storage (S3-compatible / MinIO).
Dialogue is delivered as **chunks** — a run of dialogue ending at a decision point,
fetched by the client as a discrete cacheable artifact rather than one node at a time —
which is what makes CDN caching pay off. The client never fetches CDN objects directly;
it always goes through a resolver so server-side contracts (which tree/revision is
active, whether a choice is actually reachable) stay enforced.

### 3.4 Known problems, stated as symptoms, not diagnoses

- **Character "personality" has no real structure.** It's a free-text field with ~180
  distinct values across ~190 characters — effectively one snowflake per character, not
  a queryable trait.
- **`faction` is doing two jobs.** For characters with an actual affiliation, it works.
  For roughly 3 in 10 characters, it's set to `independent`, which isn't really a
  faction — it's the shape of "ordinary person with no organizational affiliation"
  (student, vendor, homemaker, unemployed) being forced into a field that only answers
  "who do you report to."
  - This one interacts with the writer-hints goal directly: a writer authoring a plan
    with no way to say "this is a regular person with a normal life" will keep landing
    on `independent` as the default non-answer.
- **Expression/portrait data has three registries that don't agree with each other**:
  what the narrative prompt files promise, what image assets actually exist on disk,
  and what the runtime actually reads to pick a portrait. They drift, and for the large
  majority of characters the runtime silently falls back to a single default image.
- **There's no generic/background-character machinery.** Every character in the system
  today is authored individually — full lore file, full prompt file, full asset set.
  There's no lighter-weight path for "a nameless NPC who exists to make a scene feel
  populated" versus "a named character with a story arc," so any future crowd/mob
  content would currently cost the same per-instance as a fully authored character.
- **The dialogue-caching layer intends server-side reachability enforcement**
  (client never hits CDN directly; resolver is used so "whether a choice is actually
  reachable" stays enforced on serve), but it is unverified whether a client-submitted
  `/choose` is fully validated as reachable from the player's current node *before*
  effects are applied. This is an open correctness question independent of character
  schema.
- **There's no serving benchmark today.** "Serve fast" is a stated goal with no current
  measurement to compare against.

### 3.5 Scale and team constraints — please weigh these heavily

- **Team size: one person**, full stack, across all of authoring tooling, backend,
  and client. There is no parallelism to hide investment behind — time spent on
  infrastructure is time not spent on content, directly and without offset.
- **Current content volume:** on the order of ~195 authored characters, of which a
  small minority (single digits) have any dialogue at all; total dialogue content is a
  few hundred nodes across ~60 YAML files (25 top-level + subdirectories); one mission exists.
  (Numbers can drift; re-measure if using for estimation.)
- **No confirmed launch date, platform deadline, or competitive clock** exists in any
  project document. Any urgency framing should be treated as unconfirmed until stated
  otherwise.
- Any proposal should be honest about what it costs in a solo-developer context, not
  just what it would cost a team.

## 4. What we're actually asking

Given the game, the three roles above, and the current state of the pipeline:

1. **What data model and process would you propose** to support (a) writer intake with
   in-the-moment consistency checking and useful hints, (b) efficient, idempotent
   database population once a writer approves a plan, and (c) fast, complete serving to
   clients via CDN and/or direct query? You do not need to work within any existing
   schema sketch — propose whatever structure you think is right, and say so explicitly
   if that means discarding or overriding something described above.
2. **Where do you think the graph-authoring layer (§3.2) actually earns its place**, and
   where would a simpler relational-only flow do the same job? We are not committed to
   keeping Neo4j in the loop if you don't think it's pulling weight.
3. **What would you build first**, given the team-of-one and current-content-volume
   constraints in §3.5 — and what would you explicitly defer until the project has more
   content or more people?
4. **Which of the symptoms in §3.4 do you think are actually the same underlying
   problem**, and which are unrelated issues that happen to be adjacent?
5. Is there evidence the three stated goals (writer/dev/player experience) are actually
   in tension with each other in a way that requires a real tradeoff, rather than being
   simultaneously achievable with the right structure?

We are specifically looking for independent judgment here, including disagreement with
the framing of this document itself if you think it's missing or overweighting
something.
