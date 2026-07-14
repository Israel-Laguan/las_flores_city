# Story Builder Design Document

> **Status**: Shipped
> **Created**: 2026-07-08
> **Last Updated**: 2026-07-10
> **Related**: `docs/ADMIN_ARCHITECTURE.md`, `docs/MVW_ARCHITECTURE.md`
>
> This began as a design/planning document. The feature has since shipped. Sections
> 1–3 capture the design rationale and the options that were considered (kept for
> historical context); Section 4 records what was actually built and the key files
> that make up the implementation.

## 1. Context

### 1.1 What We Have

The Las Flores 2077 admin panel already provides a working content and asset pipeline:

```
Lore (markdown)  →  Content (YAML)  →  Database (Postgres)
  docs/lore/           content/            tables
```

**Content pipeline (working):**
- 12 content types with Zod schemas: character, dialogue, overlay, scene, gig, vault, mission, story, shop_item, location, map_tile, story_beat
- `validateContent()` → `migrateContent()` → DB upsert
- Admin editor (`/editor`) for raw YAML editing
- Admin content-linker (`/content-linker`) for linking entities
- Admin content-asset assignment (`/admin/content/assign-asset`) for writing asset URLs into YAML

**Asset pipeline (working):**
- `generate-prompt.mjs` creates `.prompt.md` files from lore/registries
- Server serves prompt catalog via `/assets/prompt-catalog`
- Admin can generate bases → approve → generate variants → publish to MinIO
- Published assets can be assigned to content YAML fields

**Prompt flow (recently improved):**
- Better initial prompt generation with draft + refined variants
- Biometric, expression, outfit-pose, character-sheet, and location-map templates
- Registry-based generation (tiles, landmarks, backgrounds)

### 1.2 What We Want

A unified "Story Builder" flow in the admin panel:

1. **User describes** a story or character in natural language
2. **Backend identifies** the content elements to create or update
3. **User reviews** and approves (or edits) the proposed plan
4. **Automated process** executes the plan: creates content YAML, generates prompt files, and offers asset generation

### 1.3 Why Now

The prompt flow improvements are stable. The content and asset pipelines work end-to-end. The missing piece is the **bridge between human intent and structured content creation** — turning a description like "Add a bartender named Diego who works at the Plaza" into a coordinated set of YAML files, prompt files, and asset generation tasks.

---

## 2. Architecture Overview

### 2.1 Proposed Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Story Builder UI (/story-builder)                          │
│                                                             │
│  1. Describe    →   2. Review Plan    →   3. Execute        │
│  (textarea)         (editable list)       (progress bar)    │
│                          ↓                      ↓           │
│                     [Approve]            [Orchestrator]      │
│                          ↓                      ↓           │
│                    ContentPlan         Create YAML          │
│                                        Create prompts       │
│                                        Validate + migrate   │
│                                        Return asset tasks   │
│                                                             │
│  4. Assets → links to /assets page for each pending need    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 System Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Story Builder UI | `admin/src/app/story-builder/` | 4-step wizard: describe → review → execute → assets |
| Content Plan Service | `server/src/services/ContentPlanService.ts` | Parse description → ContentPlan (LLM-backed) |
| Story Builder Orchestrator | `server/src/services/StoryBuilderOrchestrator.ts` | Execute approved plan: create YAML, prompts, migrate |
| Content Skeleton Generator | `server/src/services/ContentSkeletonGenerator.ts` | Generate YAML skeletons from plan items |
| Story Builder Router | `server/src/routes/admin-story-builder.ts` | Express endpoints: `POST /plan`, `POST /execute` |
| Admin Proxy Routes | `admin/src/app/api/admin/story-builder/` | Next.js proxy to server |

### 2.3 Data Flow

```
User input: "Add a bartender named Diego at the Plaza"
                    ↓
ContentPlanService.parseDescription()
                    ↓
ContentPlan {
  items: [
    { type: 'character', action: 'create', name: 'Diego', fields: {...}, assetNeeds: [...] },
    { type: 'scene', action: 'update', name: 'Plaza de la Constitución', fields: {...} },
    { type: 'dialogue', action: 'create', name: 'Diego bartender intro', fields: {...} }
  ],
  links: [
    {
      fromItem: '<dialogue-item-uuid>',
      toItem: '<character-item-uuid>',
      field: 'available_dialogues',
      action: 'add',
    }
  ]
}
                    ↓
User reviews/edits plan in UI
                    ↓
User approves → Orchestrator.executePlan(plan)
                    ↓
1. ContentSkeletonGenerator → writes YAML to content/
2. generate-prompt templates → writes .prompt.md to docs/lore/
3. validateContent() → migrateContent()
4. Return asset generation task list
                    ↓
User generates assets via existing /assets page
User links assets via existing /admin/content/assign-asset
```

---

## 3. Component Design Options

### 3.1 Content Plan Data Model

#### Option A: Flat Plan Items

```typescript
interface ContentPlan {
  id: string;
  description: string;
  items: ContentPlanItem[];
  links: ContentLink[];
  status: 'draft' | 'approved' | 'executing' | 'complete' | 'failed';
}

interface ContentPlanItem {
  type: ContentType;           // 'character' | 'dialogue' | etc.
  action: 'create' | 'update';
  name: string;
  slug: string;                // derived from name
  fields: Record<string, any>; // proposed YAML fields
  assetNeeds: AssetNeed[];
}

interface AssetNeed {
  promptType: string;          // 'portrait' | 'background' | 'biometric' | etc.
  targetField: string;         // e.g. "portrait_urls[0].url"
  status: 'pending' | 'generated' | 'assigned';
}
```

**Pros**: Simple, easy to render in UI, maps directly to YAML files.
**Cons**: Doesn't capture dependencies between items (e.g., dialogue references character).

#### Option B: Dependency-Graph Plan Items

```typescript
interface ContentPlanItem {
  id: string;                  // local UUID for references
  type: ContentType;
  action: 'create' | 'update';
  name: string;
  slug: string;
  fields: Record<string, any>;
  assetNeeds: AssetNeed[];
  dependsOn: string[];         // IDs of other plan items
}
```

**Pros**: Captures creation order (character before dialogue that references it).
**Cons**: More complex UI, harder to edit.

#### Option C: Hierarchical Plan (Story → Chapters → Items)

```typescript
interface ContentPlan {
  id: string;
  description: string;
  story: {
    title: string;
    chapters: Array<{
      title: string;
      items: ContentPlanItem[];
    }>;
  };
}
```

**Pros**: Natural for narrative content, matches story structure.
**Cons**: Overkill for simple "add a character" use cases.

**Recommendation**: **Option B** (dependency-graph) — captures ordering without being overly complex. The orchestrator can topologically sort items before execution.

#### Deep Research Queries

1. **How do existing game design tools (like articy:draft, yWriter, Twine) represent content dependencies?** What can we learn from their data models for managing narrative content with cross-references?

```
**articy:draft emphasizes a centralized, reference-based object model optimized for complex, reusable narrative content in games.**

- **Core Concepts**: Everything is an *object* (entities like characters, items, locations, quests) stored once in a database-like collection. These are referenced wherever needed (e.g., in flowcharts, dialogues, or areas). This avoids duplication and reduces inconsistencies/glitches.
- **Flow Editor**: Visual graph for storylines, branching dialogues, and logic. Nodes (Flow Fragments, Dialogues, etc.) can contain sub-elements and connect via pins (with conditions/variables). Containers support hierarchy and parallelism.
- **Templates and Extensibility**: Custom templates define properties for objects. References link entities (e.g., a character in multiple scenes or relationships). Variables, conditions, and scripting handle dependencies and state.
- **Data Model/Exports**: Structured with strong support for references/IDs. Exports include JSON/XML (with schemas), engine-specific (Unity/Unreal importers), and localization formats. This makes it highly integrable for game engines, with simulation/playtesting for logic validation.

**Key strength for dependencies**: Single source of truth via references + graph flows + conditions. Ideal for cross-referenced narrative (e.g., one character appearing in many dialogues without copy-paste errors).

**yWriter uses a hierarchical, scene-centric XML model suited for linear-to-moderately branched prose/novels.**

- **Structure**: Projects are a single `.yw7` XML file with sections for `<PROJECT>`, `<CHAPTERS>`, `<SCENES>`, `<CHARACTERS>`, `<LOCATIONS>`, `<ITEMS>`, etc. Chapters reference scenes via semicolon-delimited ID lists; scenes hold content, synopses, Goal/Conflict/Outcome, POV, status, etc.
- **Dependencies/Cross-References**: Entities (characters, locations, items) are defined once and linked to scenes (e.g., via lists or references). Reports generate cross-indexes (scenes per character, etc.). Tags, notes, and fields track plot elements.
- **Data Model**: Flat ID-based references in XML. No deep graph for branching; more linear with metadata for tracking. Exports to various formats (RTF, HTML, etc.) and supports reports/storyboards.

**Strengths for narrative**: Excellent for scene-level planning and entity tracking in long-form writing. Dependencies are mostly containment/references (e.g., which scenes feature which character), with tools for consistency checks via reports.

**Twine models narrative as a directed graph of passages with hyperlink-based dependencies.**

- **Core Data Model**: A story contains passages (nodes) with name, text (content), tags, position (for map), and metadata. Links in passage text (e.g., `[[Link text->Target Passage]]`) create directed edges; connections are parsed dynamically from text rather than stored explicitly as first-class links.
- **Graph Nature**: Visual map shows passages as nodes and links as edges. Supports variables/macros (in formats like SugarCube/Harlowe) for state/conditions. JSON exports (via Twee or tools) capture passages + links.
- **Dependencies**: Primarily hyperlink references (name-based, case-sensitive). Renaming updates links automatically in the tool, but complex logic (variables, JS) adds implicit dependencies. Tools exist for graph analysis/export (e.g., detecting dead ends, paths).

**Strengths**: Simple, flexible hypertext graph for interactive fiction. Cross-references are explicit via links; state management via variables handles conditional dependencies.

### Lessons for Managing Narrative Content with Cross-References

1. **Centralized Entities + References (articy:draft style)**: Store reusable assets (characters, items, lore) once and reference them. Prevents duplication, enables easy impact analysis (e.g., "where does this character appear?"), and supports consistency. Combine with templates for extensible properties.

2. **Graph + Hierarchical Views**: Use directed graphs for branching/dependencies (Twine) alongside containers/hierarchies (articy, yWriter chapters/scenes). Visual flows help spot cycles, dead ends, or convergence issues.

3. **Metadata and Cross-Indexing**: Fields like Goal/Conflict/Outcome, tags, POV, and generated reports (yWriter) or queries (articy) make implicit dependencies explicit and queryable.

4. **State and Conditions**: Variables, pins with logic, and scripting (articy/Twine) manage dynamic dependencies beyond static links.

5. **Export/Interoperability**: Structured exports (JSON/XML with schemas) + engine plugins allow the authoring model to feed directly into runtime/game code. This is crucial for scaling narrative in games.

6. **Hybrid Approaches**: For a custom tool, blend articy-style object database/references with Twine-style hypergraph and yWriter's scene granularity. Add graph analysis for validation (e.g., reachability, symmetry in branches).

**Overall**: These tools succeed by treating narrative as structured, relational data rather than flat text—prioritizing reusability, visualization, and analysis of dependencies. articy:draft is strongest for complex game-scale projects; Twine for quick interactive prototypes; yWriter for prose-focused outlining. A modern system could learn most by adopting reference-based entities, visual graphs, and rich export capabilities.
```

2. **What are the trade-offs between flat vs. graph-based plan representations in CMS systems?** How do tools like Sanity, Strapi, or Contentful handle content relationships during creation?

```
**Flat representations** in CMS content modeling typically refer to simple, hierarchical, or page-centric structures (e.g., a single document or content type with embedded fields, rich text, or basic trees). **Graph-based representations** treat content as interconnected nodes (documents/entries) with explicit, often bidirectional relationships/references forming a flexible network.

### Trade-offs: Flat vs. Graph-Based

**Flat / Hierarchical (Tree-like) Pros:**
- Simpler authoring and mental model: Clear parent-child hierarchies (e.g., pages with sections, nested categories) make it intuitive for editors.
- Easier querying and performance in many cases: Fewer joins; predictable traversal (e.g., via paths or limited depth).
- Lower complexity for small/simple sites: Less risk of ambiguity or over-modeling.
- Straightforward caching and rendering, especially for page-based or compositional UIs with limited reuse.

**Flat / Hierarchical Cons:**
- Limited flexibility for complex relationships: Struggles with many-to-many, cross-content reuse, or dynamic connections (e.g., a product referenced in articles, campaigns, and recommendations).
- Duplication risk: Changes (e.g., updating an author bio) require manual updates across instances.
- Poor scalability for omnichannel or relational content: Hard to maintain referential integrity or query across diverse connections without denormalization.

**Graph-Based Pros:**
- High flexibility and reusability: Any node can link to any other (bidirectional in many systems), enabling rich relationships, single source of truth, and easy reuse (e.g., one "Author" document referenced everywhere).
- Better for complex domains: Supports dynamic, contextual connections (social-like networks, knowledge graphs, personalized content). Scalable for large datasets with many interlinks.
- Strong referential integrity and querying: Modern systems index relationships bidirectionally, support deep population (with limits), incoming references, and powerful queries (GROQ, GraphQL). Changes propagate automatically.
- Composable content: Ideal for modular/component-based modeling where pieces assemble dynamically across channels.

**Graph-Based Cons:**
- Increased complexity: More potential for ambiguity, over-linking, or performance issues (N+1 queries, deep nesting, large join-like operations). Requires careful governance.
- Steeper learning curve for editors and developers: Managing references, weak/strong links, and query optimization.
- Potential bloat or inconsistency if not designed well (e.g., excessive population or cache invalidation chains).

**Hybrid approaches** are common: Use flat/embedded structures for tightly coupled, non-reusable pieces (e.g., inline components) and graph references for shareable entities. Denormalization (duplicating some data for reads) balances consistency vs. performance.

Graph models shine in modern headless CMS for structured, relational content, while flat suits simpler or page-oriented needs.

### How Sanity, Strapi, and Contentful Handle Content Relationships

These headless CMS platforms are **graph-oriented** at their core, emphasizing references/links over duplication. Relationships are first-class, with schema-driven modeling.

**Sanity:**
- Uses **reference fields** (strong by default for integrity; weak optional). References are bidirectional and indexed in the Content Lake (graph-like database).
- Editors can create/select referenced documents inline. Strong references prevent deletion of in-use documents.
- Supports arrays for one-to-many/many-to-many. GROQ queries excel at dereferencing (`->`), projections, and incoming references (`*[references(^._id)]`).
- Cross-dataset references and real-time collaboration. Great for composable, reusable content with strong integrity.
- During creation: Studio UI allows searching/creating references on-the-fly; publishing enforces integrity.

**Strapi:**
- Full relational support via the Content-Type Builder or schema files: one-to-one, one-to-many, many-to-one, many-to-many, polymorphic, etc.
- Relations are defined between collection types (or components). Use `populate` (or deep population) in API queries to resolve them.
- Supports components (reusable embedded structures) alongside relations for hybrid modeling. Dynamic Zones for flexible composition.
- During creation: Admin panel lets you select related entries; schema-driven for code-based control. Excellent for database-like modeling with API-first delivery.

**Contentful:**
- **Reference fields** (links) to other entries or assets. Supports single or array (one-to-many). Validations restrict to specific content types.
- Links are resolved via `include` parameter (up to 10 levels) in REST or naturally in GraphQL. `linkedFrom` for incoming references.
- Entries form a graph; reuse is core (e.g., one Author linked to many posts). Environments for previews/variants.
- During creation: Web App/Studio allows selecting/linking entries. Changes propagate via links; strong focus on structured, portable content.

All three prioritize **reuse without duplication**, with tools for previewing resolved content. Sanity leans toward flexible, code-defined schemas and real-time; Strapi toward traditional relational DB modeling; Contentful toward enterprise governance and GraphQL. Choose based on your need for query power (Sanity/Contentful) vs. relational simplicity (Strapi). Always model with authoring UX, query patterns, and performance in mind.

**Flat vs. graph-based content representations in CMS systems**, when compared to **traditional SQL (relational) databases**, highlight differences in data modeling philosophy, relationship handling, querying, performance characteristics, and suitability for content-heavy applications.

### Core Concepts in Comparison

- **Flat representations** (CMS): Simple structures like a single document/type with embedded fields, rich text, or shallow hierarchies (tree-like). Similar to denormalized tables or wide entities in SQL.
- **Graph-based representations** (CMS): Nodes (documents/entries) connected by explicit references/links, forming a flexible network. Many modern headless CMSes (Sanity, Strapi, Contentful) are graph-oriented at the application level.
- **Traditional SQL**: Purely **relational** (tables, foreign keys, joins). Highly normalized by default, with explicit schema enforcement via DDL.

### Key Trade-offs and Comparisons

**1. Modeling Relationships**
- **CMS Flat**: Embedded fields or simple parent-child. Low flexibility for reuse (risk of duplication). Comparable to a single wide SQL table with redundant columns.
- **CMS Graph**: References (one-to-many via arrays, many-to-many implicitly via bidirectional links). First-class, often bidirectional indexing. Enables easy reuse and propagation of changes.
- **SQL**: Foreign keys (FKs) and junction tables for many-to-many. Explicit, normalized, and enforced by constraints (e.g., `ON DELETE CASCADE`). Very rigid but consistent. Graph CMS feels more like a **lightweight graph on top of relations** (or document store with links), while SQL requires manual junction tables for complex networks.

**Advantage**: CMS graph offers simpler modeling for content reuse (no manual junction tables). SQL excels in strict integrity and complex business rules.

**2. Schema Flexibility and Evolution**
- **CMS (both flat/graph)**: Often schema-flexible or code-defined (e.g., Sanity schemas in JS, Strapi builder + JSON schemas). Changes can be deployed iteratively; some support migration tools. Graph models handle evolving relationships better.
- **SQL**: Strict schema (ALTER TABLE). Migrations are explicit (e.g., via Liquibase/Flyway) but can be costly in production with large tables. Denormalization for performance is common but manual.

**CMS edge**: Faster iteration for content teams. SQL edge: Strong typing and constraints prevent bad data.

**3. Querying and Data Retrieval**
- **CMS Flat**: Simple fetches; limited joins. Good for page-like renders.
- **CMS Graph**: Powerful traversal (GROQ in Sanity, GraphQL in Contentful/Strapi, population/deep include). Bidirectional queries (incoming references) are native. Can suffer from N+1 or deep nesting without limits.
- **SQL**: Joins, CTEs, window functions. Extremely expressive for aggregates, transactions, and complex analytics. Tools like recursive CTEs handle hierarchies well.

**Performance note**: CMS graph queries often resolve at read time (with caching/CDN). SQL shines in transactional/OLTP workloads but can require ORM overhead (e.g., eager loading to avoid N+1).

**4. Performance and Scalability**
- **CMS Flat**: Fast reads for self-contained content; easy caching.
- **CMS Graph**: Good horizontal scaling in document stores (e.g., Sanity's Content Lake). References add indirection but benefit from indexing. Deep graphs need careful depth limits and population controls.
- **SQL**: Excellent for normalized data with proper indexing. Vertical scaling strong; horizontal via sharding/replicas is more complex. Joins can be expensive at scale without optimization.

**CMS strength**: Built for read-heavy, omnichannel content delivery with APIs/CDNs. **SQL strength**: High concurrency, ACID transactions, reporting.

**5. Referential Integrity and Consistency**
- **CMS Graph**: Strong references prevent deletion of referenced content (e.g., Sanity). Weak references allow dangling links. Real-time updates propagate.
- **CMS Flat**: Simpler but prone to duplication/inconsistency.
- **SQL**: Database-level constraints (FKs, triggers). Very strong, with transactions for multi-row consistency.

**SQL wins** for financial/critical data. CMS graph suffices for most content use cases with added editor safeguards.

**6. Authoring and Developer Experience**
- CMS (especially graph): Studio UIs make references intuitive (search/create inline). Content is the UI.
- SQL: Typically backend-only; requires custom admin UIs (e.g., via Adminer or frameworks). Less content-author friendly.

**7. Use Cases and When to Choose**
- **Flat CMS + SQL-like**: Simple blogs, pages with minimal relations. Use SQL directly (or Strapi on Postgres) for apps needing strong transactions.
- **Graph CMS**: Compositional content, reuse across channels, knowledge graphs, personalization. Many CMSes (Hygraph explicitly markets as graph) sit on top of or emulate graph-like access.
- **Traditional SQL**: Backend systems, e-commerce with inventory/orders, analytics. Often combined with CMS (headless CMS + SQL for user data).

**Hybrid Reality**: Many modern setups use **CMS for content graph** + **SQL/Postgres for transactional data** (e.g., Strapi can use SQL under the hood). Graph databases (Neo4j) or graph extensions (Postgres with recursive queries) bridge gaps for very complex relationships.

**Summary Table** (High-Level):

| Aspect                  | CMS Flat          | CMS Graph                  | Traditional SQL                  |
|-------------------------|-------------------|----------------------------|----------------------------------|
| **Relationships**      | Embedded/simple  | References (bidir)        | FKs + Junction tables           |
| **Flexibility**        | Low              | High                      | Medium (schema migrations)      |
| **Query Power**        | Simple           | Traversal-focused         | Joins + Analytics               |
| **Integrity**          | Weak             | Strong refs               | Database constraints            |
| **Best For**           | Static pages     | Reusable, connected content | Transactions, reporting         |
| **Scaling Reads**      | Excellent        | Good (with caching)       | Good (indexing)                 |

In practice, **headless CMS graph models** provide a higher-level abstraction tailored to content workflows, while SQL offers raw power and reliability for data-intensive applications. Many teams use both together.
```

3. **How should we handle partial plan execution failures?** If 3 of 5 items succeed, what's the rollback strategy? Should we support resumable execution?

```
**Partial failures in multi-step plan execution are common in distributed, agentic, or workflow systems. The goal is to achieve eventual consistency, minimize waste, avoid duplicates, and provide clear recovery paths.**

### Core Strategies for Handling Partial Failures (e.g., 3/5 Items Succeed)

1. **Track Execution State Granularly**  
   Persist the status of each step/item (e.g., pending, running, succeeded, failed, compensated) with timestamps, outputs, and any side effects. Use a durable store (database, event log, or workflow engine state). This is foundational for both rollback and resumption.

2. **Rollback via Compensating Transactions (Saga Pattern)**  
   The **Saga pattern** is the standard approach for long-running or distributed plans where full ACID transactions aren't feasible.  
   - Each forward step that has side effects registers (or pairs with) a **compensating action** *before* execution (to handle partial failures during the step itself).  
   - On failure: Execute compensations in **reverse order** (LIFO) for successfully completed steps.  
   - Example for 3/5 success: Compensate items 1-3 (in reverse: 3, then 2, then 1), leave 4-5 untouched.  
   - Compensations are *semantic* undos (e.g., "refund payment" not database rollback; "cancel reservation" not delete record). They should be idempotent.

   **Key Disciplines**:
   - Register compensation *before* the forward action.
   - Make everything idempotent (use keys tied to plan/step ID).
   - Handle compensation failures (e.g., retry, alert, or escalate to manual intervention).
   - Some steps may be "pivot" (non-compensable point of no return).

   Many engines (Temporal, AWS Step Functions, Conductor, Cloudflare Workflows) support this natively with saga/rollback handlers.

3. **Alternative/Complementary Approaches**:
   - **All-or-nothing**: Strict rollback on any failure (suitable for critical consistency needs).
   - **Best-effort/Continue on error**: Mark failures, proceed with successes (for independent items), and notify.
   - **Optional steps**: Some items can fail without triggering full rollback.
   - **Checkpointing intermediate results**: Persist outputs/artifacts so downstream steps can reuse them.

### Should You Support Resumable Execution? **Yes, strongly recommended.**

Resumability (combined with durable execution) is a best practice in modern workflow/agent systems. It avoids re-executing expensive/side-effecting successful steps.

- **How it works**:
  - On retry/resume: Replay execution log/history from the start, but **skip completed steps** by returning persisted results (idempotent replay).
  - Retry only failed/pending items (e.g., items 4-5 in your example).
  - Support selective resumption (resume from specific failed nodes) or full re-execution with reuse of prior outputs.

- **Benefits**: Reduces cost/time, prevents duplicates, handles crashes/restarts gracefully, supports human-in-the-loop (pause for approval/input, then resume).

- **Prerequisites**:
  - **Idempotency** everywhere (especially external calls/tools).
  - Deterministic code (no reliance on non-reproducible values like `Date.now()` or random without seeded/contextual keys).
  - Persistent state/checkpoints at step boundaries.

### Recommended Implementation Outline

- **Orchestrator/Engine**: Use or emulate durable systems like Temporal, AWS Step Functions, LangGraph (for agents), or similar. They handle replay, retries, sagas, and pausing automatically.
- **For each plan item/step**:
  - Define forward logic + compensation.
  - Wrap in retry policies (exponential backoff, max attempts, different policies per step).
  - Checkpoint after success.
- **On failure**:
  1. Determine failure type (transient → retry; permanent/business → compensate + fail plan).
  2. Run compensations for completed steps.
  3. Persist overall plan status (partial success, compensated, etc.).
  4. Offer resume/retry options.
- **Monitoring/Observability**: Full execution history, compensation audit trail, alerts on uncompensated states.
- **Edge Cases**:
  - Partial side effects during a failing step → pre-registered compensations help.
  - Compensation itself fails → escalation path (manual, retry queue, or "broken" state).
  - Long-running plans → support pauses/resumes via signals/events.

This approach balances reliability with practicality. For AI agent plans specifically, combine it with checkpointing of LLM context/tool results and idempotent tool design. If building from scratch, start with a simple state machine + saga stack; for production, leverage a proven engine.

```

4. **What's the minimum viable plan item?** Can we get away with just `type + name + fields`, or do we need `slug`, `assetNeeds`, and `dependsOn` from day one?

```
**Yes, you can get away with just `type + name + fields` for a true Minimum Viable Plan Item.**

### Initial Definition (Day 1)
A plan item should be the smallest useful unit that lets you:

1. Identify it unambiguously.
2. Categorize it.
3. Store the actual content/details.

**Core schema:**
```ts
interface PlanItem {
  id: string;           // UUID or auto-generated
  type: string;         // e.g. "feature", "task", "asset", "milestone", "section"
  name: string;         // Human-readable title
  fields: Record<string, any>; // Flexible bag for everything else (description, status, dates, etc.)
}
```

This is enough to start building:
- A list view / backlog
- Basic CRUD
- Filtering by type
- Rendering dynamic forms based on `type`
- Export/import

### What the initial UI hides (but the schema keeps)

The shared Zod schema (`shared/src/schemas/story-builder.ts`) includes `slug`, `assetNeeds`, and `dependsOn` on every plan item, but the **initial admin UI** hides them to keep the interface simple. These fields are always present in storage — they just get sensible defaults (`slug` derived from name, `assetNeeds: []`, `dependsOn: []`).

This means the schema is stable from day one; only the UI presentation evolves:
- **initial UI**: Only shows `type`, `name`, `action`, `fields`. Other fields default.
- **Phase 2 UI**: Expose `slug` (auto-generated) and `status` in the editor.
- **Phase 3 UI**: Add `dependsOn` visualization and editing (dependency graph).
- **Phase 4 UI**: Show `assetNeeds` per item with asset status tracking.

### Recommended evolution path

1. **Initial schema** — Schema has all fields; UI shows `type + name + action + fields` only
2. **Phase 2** → Expose `slug` (auto-generated) and `status` in the editor
3. **Phase 3** → Expose `dependsOn` with dependency graph visualization
4. **Phase 4** → Expose `assetNeeds` with asset generation status tracking

### Practical tip
Make `fields` properly versioned or typed per `type` (either via JSON schema, a simple registry, or TypeScript discriminated unions). This keeps the core minimal while preventing chaos as the system grows.

**Bottom line**: The full schema (`type + name + fields + slug + assetNeeds + dependsOn`) is the contract from day one. The initial UI simply hides the extra fields, keeping things simple while the storage model is already complete.
```

5. **How do we represent "update existing content" safely?** Should the plan include a diff of proposed changes, or just the final state? How do we show the user what will change?

```
**Best practices for safely representing "update existing content":**

### 1. **Core Principle: Never blind-update**
Always prioritize **transparency and reversibility**. Users (and the agent) should see *exactly* what is changing before any destructive action (overwrite, replace, delete) is finalized.

### Recommended Flow
1. **Read first** (`read_file`)
2. **Plan the change** (in reasoning)
3. **Preview the diff**
4. **Apply** (with confirmation if high-stakes)
5. **Verify** after apply

### Diff vs. Final State: Use Both, Prioritize Diff for Previews

| Approach              | When to Use                          | Pros                              | Cons                              | Safety Level |
|-----------------------|--------------------------------------|-----------------------------------|-----------------------------------|--------------|
| **Diff only** (recommended for preview) | Planning / user review stage        | Shows *precisely* what changes   | User doesn't see full new context | High        |
| **Final state only**  | Simple appends or new files         | Easy to read full result         | Hides what was removed/altered    | Medium      |
| **Both (diff + final)** | Most real updates                   | Full transparency                | Slightly more verbose             | Highest     |

**Strong recommendation**: Include a **unified diff** in your plan/response when proposing updates. Then offer the full final state if requested or for small files.

### How to Show Changes to the User

- **Use the `edit_file` tool with `show_diff=true`** — this is the built-in, safest mechanism. It returns the full diff before/after the edit.
- In your reasoning / final response:
  - Show a **markdown code block with diff** (e.g. `diff` language).
  - Highlight added/removed lines clearly.
  - Summarize impact: "This changes 3 lines, adds 45 new lines, removes 12 lines."
  - Include context: line numbers, surrounding code/comments.

**Example safe representation** (in your response to user):

```diff
--- original.md
+++ updated.md
@@ -42,12 +42,15 @@
 Existing paragraph here.
 
- Old sentence that is being replaced.
+ New improved sentence with better clarity and updated facts.
 
 More context that stays the same.
 
+## New section added as part of this update
+Additional content here...
```

**Then** (optionally):
- Provide the full new file content in a collapsible section or separate preview.
- Ask for confirmation: "Apply this change? (yes/no/edit)"

### Additional Safety Layers

- **Small, targeted edits** over large overwrites (`edit_file` with specific `old_string` > `write_file`).
- Use `replace_all=false` unless you're certain.
- For complex refactors: multiple small `edit_file` calls instead of one giant one.
- Always read the file *immediately before* editing in the same turn if possible.
- For critical files: propose the diff, wait for explicit user "yes".
- After edit: re-read and show a snippet of the result.

### When Final State Is Acceptable
- New files (`write_file`)
- Very short documents (< 20 lines)
- Pure appends (clear "add to end" intent)
- User explicitly asked for "rewrite the whole thing"

This pattern (read → diff preview → apply → verify) is the standard used in reliable agent/tool systems because it minimizes surprise and makes mistakes easy to spot/revert. 

The `edit_file` tool already supports this well via `show_diff`. Use it liberally when updating content.
```
---

### 3.2 LLM Integration

#### Option A: Direct API Call (OpenAI/Anthropic)

```typescript
// server/src/services/LLMService.ts
async function parseDescription(description: string): Promise<ContentPlan> {
  const prompt = buildSystemPrompt(description);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: description }
      ],
      response_format: { type: 'json_object' }
    })
  });
  return parseLLMResponse(response);
}
```

**Pros**: Full control, can use any LLM provider.
**Cons**: Need to manage API keys, rate limits, error handling, prompt engineering.

#### Option B: Use Existing AKOOL CLI

The project already has an `akool-image-cli` skill. Could we leverage AKOOL's text capabilities?

**Pros**: Reuses existing infrastructure.
**Cons**: AKOOL is image-focused, not text generation.

#### Option C: Pluggable LLM Provider

```typescript
interface LLMProvider {
  parseDescription(description: string): Promise<ContentPlan>;
}

class OpenAIProvider implements LLMProvider { ... }
class AnthropicProvider implements LLMProvider { ... }
class LocalLLMProvider implements LLMProvider { ... } // Ollama, llama.cpp

// Configured via env var
const provider = createLLMProvider(process.env.LLM_PROVIDER || 'openai');
```

**Pros**: Flexibility, can swap providers, supports local LLMs for dev.
**Cons**: More abstraction, need to test multiple providers.

#### Option D: Hybrid (Rule-based + LLM)

```typescript
async function parseDescription(description: string): Promise<ContentPlan> {
  // Try rule-based first for simple cases
  const ruleBased = tryRuleBasedParse(description);
  if (ruleBased) return ruleBased;
  
  // Fall back to LLM for complex descriptions
  return await llmProvider.parseDescription(description);
}
```

**Pros**: Fast for simple cases, no API cost for "add character X".
**Cons**: Two code paths to maintain, inconsistent behavior.

**Recommendation**: **Option C** (pluggable provider) with OpenAI as default. This gives us flexibility and aligns with the project's pattern of env-driven configuration.

#### Deep Research Queries

1. **What's the best LLM for structured JSON generation from natural language?** Compare GPT-4, Claude, Gemini, and local models (Llama 3, Mistral) for: (a) instruction following, (b) JSON schema adherence, (c) cost, (d) latency.

2. **How do we prevent LLM hallucination of UUIDs and invalid content?** Should we pre-generate UUIDs and pass them to the LLM, or have the LLM generate placeholders that we replace?

3. **What prompt engineering techniques work best for "description → structured content plan"?** Research: few-shot prompting, chain-of-thought, function calling, structured output mode. What gives the most reliable results?

4. **How do we handle LLM rate limits and timeouts in a request-response cycle?** The admin UI needs to feel responsive. Should we use streaming, polling, or background jobs with status updates?

5. **Can we use function calling / tool use to let the LLM query existing content?** E.g., "Does a character named Diego already exist?" before proposing to create one. How do OpenAI function calling and Anthropic tool use compare for this?

6. **What's the cost per plan generation?** Estimate token usage for typical descriptions (50-200 words) and resulting plans (500-2000 tokens). How does this scale with daily usage?

7. **How do we test LLM-backed services?** What patterns exist for unit testing, integration testing, and regression testing when the output is non-deterministic? Should we record and replay LLM responses in tests?

8. **Should we fine-tune a model on existing content?** We have 60+ characters, 100+ dialogues. Could fine-tuning improve plan quality? What's the ROI vs. prompt engineering?

---

### 3.3 Plan Persistence

#### Option A: Session-Only (initial)

Plans live in browser state only. If the user closes the tab, the plan is lost.

**Pros**: No DB migration needed, fastest to implement.
**Cons**: Can't resume interrupted work, no audit trail.

#### Option B: Database-Persisted (Roadmap)

```sql
CREATE TABLE content_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  plan_json JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE content_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES content_plans(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  action VARCHAR(10) NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  fields JSONB NOT NULL,
  asset_needs JSONB DEFAULT '[]',
  depends_on UUID[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Pros**: Resumable, audit trail, can list past plans.
**Cons**: Requires migration, more complex.

#### Option C: File-Based Persistence

Store plans as JSON files in `content/plans/` directory.

**Pros**: No migration, fits existing file-based content pattern.
**Cons**: No query capability, concurrency issues, doesn't fit the "content is YAML" convention.

**Recommendation**: **Option A for the initial release, Option B as roadmap item.** Start session-only to validate the flow, then add persistence once the UX is proven.

#### Deep Research Queries

1. **How do other game development tools handle "design documents" or "content plans"?** Do they persist intermediate plans, or only final content? What's the UX expectation?

2. **What's the right granularity for plan persistence?** Should we persist the entire plan as one JSON blob, or normalize into items? What are the query patterns we'll need?

3. **How do we handle concurrent plan editing?** If two admins work on different plans simultaneously, do we need locking? What about editing the same plan?

4. **Should plans be versioned?** If a user creates a plan, executes it, then modifies the plan and re-executes, should we keep history? How does this relate to the existing `migration_log`?

5. **What's the lifecycle of a plan?** Draft → approved → executing → complete. Can plans be cancelled mid-execution? Can they be re-run? What about partial failures?

---

### 3.4 Content Skeleton Generation

#### Option A: Template-Based

```typescript
// server/src/services/ContentSkeletonGenerator.ts
const TEMPLATES: Record<ContentType, (item: ContentPlanItem) => string> = {
  character: (item) => `
id: ${crypto.randomUUID()}
name: ${item.name}
description: ${item.fields.description || 'TODO: Add description'}
occupation: ${item.fields.occupation || 'TODO'}
`,
  dialogue: (item) => `
id: ${crypto.randomUUID()}
name: ${item.name}
start_node_id: start
nodes:
  start:
    text: "TODO: Add dialogue text"
    choices:
      - text: "Continue"
        next_node_id: end
  end:
    text: "TODO: Add ending"
`,
  // ... etc for each type
};
```

**Pros**: Simple, predictable, no external dependencies.
**Cons**: Templates need maintenance, may not capture all field nuances.

#### Option B: LLM-Generated YAML

Use the LLM to generate complete YAML content directly.

**Pros**: Richer content, less boilerplate.
**Cons**: Unreliable, may produce invalid YAML, harder to validate.

#### Option C: Hybrid (Template + LLM Fill)

Generate the skeleton with templates, then use LLM to fill in `TODO` fields.

**Pros**: Structured skeleton + rich content.
**Cons**: Two-step process, more complex.

**Recommendation**: ****Option A** (template-based) for the initial release. The templates can be derived from existing content files (use a real character YAML as the template base).

#### Deep Research Queries

1. **What are the minimum required fields for each content type?** Audit the Zod schemas to determine which fields are required vs. optional. This defines the template skeleton.

2. **How do we generate good placeholder content?** Should we use `TODO: Add description` or generate context-aware placeholders like `A bartender working at the Plaza`?

3. **Should we clone existing content as templates?** E.g., for a new character, clone the YAML of a similar existing character and modify name/description. How do we find "similar" characters?

4. **How do we handle content with complex nested structures?** Dialogues have nodes with choices, overlays have modifications. Can templates handle this, or do we need a builder pattern?

5. **What's the relationship between plan items and final YAML?** One plan item = one YAML file? Or can one plan item produce multiple files (e.g., a "story" item creates the story YAML + references to character/scene YAMLs)?

---

### 3.5 Asset Needs Calculation

#### Option A: Static Rules

```typescript
const ASSET_NEEDS: Record<ContentType, AssetNeed[]> = {
  character: [
    { promptType: 'portrait', targetField: 'portrait_urls[0].url' },
    { promptType: 'biometric', targetField: 'biometric_refs.horizontal_face_sheet' },
    { promptType: 'expression', targetField: 'asset_manifest.expression_strip_url' },
  ],
  scene: [
    { promptType: 'background', targetField: 'background_url' },
    { promptType: 'ambient', targetField: 'ambient_sound_url' },
  ],
  // ... etc
};
```

**Pros**: Predictable, easy to implement, matches existing prompt templates.
**Cons**: One-size-fits-all, doesn't consider character importance.

#### Option B: LLM-Determined

Let the LLM decide which assets are needed based on the description.

**Pros**: Context-aware (major character gets full biometric set, minor NPC gets just portrait).
**Cons**: Unreliable, may miss required assets.

#### Option C: Tiered (Static + Override)

```typescript
const TIERS = {
  major: ['portrait', 'biometric', 'expression', 'outfit-pose'],
  standard: ['portrait', 'biometric'],
  minor: ['portrait'],
};
// LLM assigns tier, static rules determine assets per tier
```

**Pros**: Flexible, predictable within tiers.
**Cons**: Need to define tiers, LLM must correctly classify.

**Recommendation**: ****Option A** (static rules) for the initial release, **Option C** (tiered) as enhancement. The static rules already match the existing `generate-prompt.mjs` templates.

#### Deep Research Queries

1. **What assets does each content type currently have?** Audit existing content YAMLs to see which asset fields are populated vs. empty. This tells us what's actually needed vs. what's optional.

2. **How do we map asset needs to existing prompt templates?** The `generate-prompt.mjs` has templates for portrait, background, tile, overlay, biometric, expression, outfit-pose, character-sheet, location-map. Which content types need which?

3. **Should asset generation be automatic or manual?** After plan execution, should we auto-trigger asset generation, or just create the prompt files and let the user decide?

4. **How do we track asset generation status per content item?** Should the plan store asset status, or should we query the `asset_bases` table by `prompt_rel`?

5. **What's the cost impact of auto-generating all assets?** If a plan creates 5 characters with full biometric sets, that's 15+ image generations. Should we batch or queue these?

---

### 3.6 Orchestrator Design

#### Option A: Synchronous Execution

```typescript
async function executePlan(plan: ContentPlan): Promise<ExecutionResult> {
  for (const item of topologicalSort(plan.items)) {
    await createContentFile(item);
    await generatePromptFiles(item);
  }
  await validateAndMigrate();
  return { success: true, assetTasks: collectAssetTasks(plan) };
}
```

**Pros**: Simple, immediate feedback.
**Cons**: Long-running (migration can take 30+ seconds), request timeout risk.

#### Option B: Background Job with Polling

```typescript
async function executePlan(plan: ContentPlan): Promise<{ jobId: string }> {
  const jobId = crypto.randomUUID();
  await setCache(`story-builder:job:${jobId}`, { status: 'running', progress: 0 });
  // Fire and forget — background process picks up
  backgroundQueue.push({ jobId, plan });
  return { jobId };
}

// Client polls: GET /admin/story-builder/status/:jobId
```

**Pros**: No timeout, can handle large plans.
**Cons**: More complex, need job queue infrastructure.

#### Option C: Streaming via Server-Sent Events

```typescript
// Server sends progress updates as items are processed
res.writeHead(200, { 'Content-Type': 'text/event-stream' });
for (const item of sortedItems) {
  res.write(`data: ${JSON.stringify({ step: 'creating', item: item.name })}\n\n`);
  await createContentFile(item);
  res.write(`data: ${JSON.stringify({ step: 'done', item: item.name })}\n\n`);
}
res.write(`data: ${JSON.stringify({ step: 'complete' })}\n\n`);
res.end();
```

**Pros**: Real-time feedback, no polling.
**Cons**: SSE support in Next.js proxy, connection management.

**Recommendation**: ****Option A** (synchronous) for the initial release with a generous timeout. Move to **Option B** (background job) if plans get large. The existing migration endpoint is already synchronous.

#### Deep Research Queries

1. **How long does content migration typically take?** Measure `migrateContent()` execution time for the current content set. This determines if synchronous is viable.

2. **What's the right error handling strategy?** If item 3 of 7 fails, do we: (a) abort everything, (b) skip and continue, (c) rollback items 1-2? What does the user expect?

3. **Should we support dry-run mode?** "Show me what would be created without actually creating it." How do we represent this in the UI?

4. **How do we handle content that references not-yet-created content?** If a dialogue references a character that's created later in the plan, validation will fail. Do we: (a) sort by dependencies, (b) skip validation until all items are created, (c) create stubs first?

5. **What's the rollback story?** If execution fails midway, we may have partial YAML files and prompt files. Should we track and clean up? Or leave them for manual fix?

6. **Should the orchestrator be idempotent?** If a user re-executes the same plan, should it: (a) skip existing items, (b) overwrite, (c) error? How does this interact with `migration_log`?

---

### 3.7 UI Design

#### Option A: Single-Page Wizard

One page with 4 steps, state managed in React:

```
/story-builder
  ├── Step 1: Describe (textarea)
  ├── Step 2: Review Plan (editable list)
  ├── Step 3: Execute (progress bar)
  └── Step 4: Assets (links to /assets)
```

**Pros**: Simple, no routing, all state in one place.
**Cons**: Can't bookmark/share specific steps, back button behavior tricky.

#### Option B: Multi-Page Flow

```
/story-builder          → Step 1: Describe
/story-builder/review   → Step 2: Review (plan in query or session)
/story-builder/execute  → Step 3: Execute
/story-builder/assets   → Step 4: Assets
```

**Pros**: Clean URLs, back button works.
**Cons**: Need to pass plan between pages (session storage or DB).

#### Option C: Modal-Based

Story builder as a modal overlay on the existing admin dashboard.

**Pros**: Non-disruptive, can be opened from anywhere.
**Cons**: Limited screen space, can't show complex plans.

**Recommendation**: **Option A** (single-page wizard) for the initial release. The plan lives in React state; if the user navigates away, they lose the plan (acceptable for session-only initial release).

#### Deep Research Queries

1. **How do other admin tools handle multi-step content creation?** Look at WordPress, Strapi, Contentful, Shopify. What patterns work for "describe → review → execute" flows?

2. **What's the best way to render an editable plan?** Should each plan item be: (a) a form with labeled fields, (b) a YAML editor, (c) a card with key-value pairs? How do we balance structure vs. flexibility?

3. **How do we show progress during execution?** Progress bar, step list, log output? What gives the user confidence that things are working?

4. **Should we support collaborative editing?** If two admins view the same plan, should they see each other's changes? (Probably not for the initial release, but worth considering.)

5. **How do we handle large plans in the UI?** If a plan has 20 items, do we paginate, scroll, or collapse? What about plans with 100+ items?

6. **What's the mobile experience?** Admin panel is likely desktop-only, but should the story builder be responsive? Does it need to work on tablets?

---

## 4. Shipped state

The Story Builder shipped. The wizard flow is:

```
Idea → AI Proposal → Iterate → Approve → Stage → Migrate
```

### 4.1 What was built

| Area | Delivered |
|-----------|-----------|
| **Foundation** | 4-step wizard, ContentPlan Zod schema, LLM-backed plan generation (Mock + LiteLLM providers), template-based YAML skeletons for all 12 content types, synchronous orchestrator (create → validate → migrate), server + admin proxy routes, asset pipeline integration, content-linker, in-card lore viewer/editor. |
| **Plan Persistence + Iteration** | `content_plans` table, 6-state status enum (draft → proposed → approved → staged → migrated → failed), `refinePlan()` with feedback log + versioning, CRUD + refine endpoints, plan list page, auto-save + load-from-URL wizard, integration tests. |
| **Staging + Migration Gate** | Split execute into `previewPlan()` (dry-run), `stagePlan()` (write YAML + validate), and `migrateStagedPlan()` (DB upsert). 5-step wizard (Describe → Review → Stage → Migrate → Assets), before/after preview UI, integration tests. |
| **Asset Needs + Lore Generation** | `AssetNeedsService` (static rules per content type) injected during parse/refine, `generateLoreStubs()` (writes `.md` at lore/narrative paths), `PromptFileGenerator` (writes `.prompt.md` for the asset pipeline), staging result surfaces lore + prompt files, unit tests. |
| **Polish + UX** | Execute-proxy validation fix, plan templates (mystery, shopkeeper, location), partial-failure recovery with per-item status + "Retry Failed" endpoint/UI, plan versioning (`parent_plan_id`) with version-history UI, keyboard shortcuts (Ctrl+Enter, Ctrl+S), template/versioning tests. |

### 4.2 Architecture decisions that held

1. **LLM as plan generator, not executor** — the LLM produces a structured plan; the orchestrator owns file I/O and validation.
2. **Template-based YAML + LLM fill** — deterministic skeletons guarantee valid YAML while the LLM supplies creative content.
3. **Stage/migrate split** — users can write and validate YAML (stage) before committing to the DB (migrate), enabling safe experimentation.
4. **Atomic execution with rollback** — failed validation after writes triggers cleanup; partial failures are tracked per-item and retryable.
5. **DB-persisted plans with versioning** — plans survive reloads; refinements create new versions linked via `parent_plan_id`.

### 4.3 Key files reference

| File | Purpose |
|------|---------|
| `shared/src/schemas/story-builder.ts` | ContentPlan, ContentPlanItem, AssetNeed, ContentLink, status enum, FeedbackLogEntry schemas |
| `server/src/services/LLMService.ts` | LLM provider interface, Mock + LiteLLM implementations (incl. `refinePlan()`) |
| `server/src/services/ContentPlanService.ts` | Description → plan parsing, context gathering, refinement, asset-needs injection |
| `server/src/services/StoryBuilderOrchestrator.ts` | Plan execution: preview, stage, migrate, YAML creation, lore stub generation, validation |
| `server/src/services/ContentSkeletonGenerator.ts` | Template-based YAML generation per content type |
| `server/src/services/AssetNeedsService.ts` | Static asset-needs rules per content type |
| `server/src/services/PromptFileGenerator.ts` | Prompt file generation for the asset pipeline |
| `server/src/services/PlanTemplates.ts` | Pre-configured plan templates (mystery, shopkeeper, location) |
| `server/src/routes/admin-story-builder.ts` | Express routes: plan, execute, CRUD, refine, preview, stage, migrate, retry, versions, templates |
| `server/src/content/validate.ts` | Content validation (schema + XSS + story flow) |
| `server/src/content/migrate.ts` | Content migration (YAML → DB upsert) |
| `server/src/database/migrations/047_content_plans.sql` | `content_plans` table |
| `server/src/database/migrations/048_content_plans_versioning.sql` | `parent_plan_id` versioning column |
| `admin/src/app/story-builder/page.tsx` | 5-step wizard UI |
| `admin/src/app/story-builder/plans/page.tsx` | Plan list page (with version history) |
| `admin/src/app/story-builder/components/` | ContentCard, FieldDefinitions, PlanSummary, LoreViewer |
| `admin/src/app/api/admin/story-builder/` | Next.js proxy routes (plan, execute, plans CRUD/refine/preview/stage/migrate/retry/versions, templates) |
| `server/src/routes/assets.ts` | Asset API routes (catalog, generate, approve, publish) |

### 4.4 Future extensions

Not planned, but noted during design as natural extensions. These are aspirational and require their own design review before implementation:

- Tiered asset needs (major/standard/minor character).
- LLM-generated content fill beyond skeletons.
- Clone existing content as a template; collaborative editing.
- Background job execution with polling for large plans.

---

## 5. Technical Constraints

### 5.1 AGENTS.md Compliance

- Use `oltpPool` / `withOLTPTransaction` for any DB operations
- Use `getCache` / `setCache` / `deleteCache` for caching
- No new pools or alternate cache layers
- Test fixtures use dedicated UUIDs, clean up in `afterAll`
- After server code changes: rebuild and restart server container

### 5.2 Existing Patterns to Follow

- **Router pattern**: `express.Router()` with `authAndAdminMiddleware` (see `admin-content.ts`)
- **Proxy pattern**: `adminFetch()` in Next.js API routes (see `content/link/route.ts`)
- **Content path validation**: `validateContentPath()` from `admin-content.ts`
- **YAML writing**: Atomic write via `.tmp` + `rename` (see `admin-content.ts:PUT /file`)
- **Content types**: Use `ContentType` from `shared/src/schemas/content-validation.ts`
- **Zod schemas**: Define in `shared/src/schemas/`, export from `shared/src/index.ts`

### 5.3 Environment Variables

Env vars used by the shipped implementation (`server/src/services/LLMService.ts`):
- `LLM_PROVIDER` — `mock` | `litellm` (default: `mock`)
- `LITELLM_BASE_URL` — LiteLLM gateway URL (default: `http://litellm:4000`)
- `LITELLM_API_KEY` — LiteLLM API key
- `LLM_MODEL` — Model name (default: `poolside/laguna-m.1`)

> Note: earlier drafts proposed direct `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`
> integration. That was dropped — all LLM access goes through the LiteLLM gateway.

### 5.4 Testing Strategy

- **Unit tests**: `ContentPlanService.parseDescription()` with mocked LLM responses
- **Integration tests**: `POST /admin/story-builder/plan` and `/execute` endpoints
- **E2E tests**: Full flow from describe → execute → verify content exists
- **LLM mocking**: Record/replay LLM responses for deterministic tests

---

## 6. Open Questions

1. **Should the LLM have access to existing content?** If a user says "add a rival for Diego", the LLM needs to know who Diego is. Do we: (a) pass all character names, (b) let the LLM query via function calling, (c) ignore existing content?

2. **How do we handle lore references?** Content YAMLs have `lore_ref` fields. Should the plan include lore references, or should the user add them manually after execution?

3. **What about story beats?** Story beats have a specific registry format. Should the story builder be able to create new story beats, or only reference existing ones?

4. **How does this interact with the existing `/missions/new` wizard?** There's already a mission creation wizard. Should the story builder replace it, or should they coexist?

5. **Should we support "story templates"?** E.g., "Add a mystery" template that creates: mission + dialogue + overlay + vault item. How do we represent templates?

6. **What's the review process for LLM-generated content?** Should there be a "human approval required" step before content goes live, or does the plan approval step suffice?

7. **How do we handle multi-language content?** Las Flores has Spanish and English content. Should the story builder support both, or is that a separate concern?

8. **What analytics should we track?** Plan creation rate, execution success rate, average items per plan, LLM cost per plan. What metrics help us improve the feature?

9. **Should `story_beat` be enforced strictly (404 if missing) or allow fallback dialogues?** Resolved: scenes already gate by `metadata.required_story_beat` (`server/src/routes/location.ts:244-271`); dialogues now mirror that pattern via `metadata.required_story_beat` on dialogue trees (`server/src/routes/dialogue-helpers.ts:resolveDialogueTree`, `isStoryBeatAllowed`). If the tree is gated and the player doesn\'t satisfy the gate, `resolveDialogueTree` returns `null` and `handleStartDialogue` 404s with the existing "No dialogue available" error.

---

## 7. Story Beat Semantics

> Authoritative reference for how `story_beat` slugs work at runtime
> and in content. When this section conflicts with a comment in
> code, code wins; please update this doc to match the implementation.

A **story beat** is a free-form string slug that marks the player\'s
position on the main narrative arc. The slug set is fixed by
`content/story_beats.yaml`; the player\'s current beat is stored on
`player_states.story_beat`. This section documents what authors
and operators can rely on.

### 7.1 Authoring model

- **Slugs** are `^[a-z][a-z0-9_]*$`, validated by
  `shared/src/schemas/yaml-content.ts::StoryBeatRegistrySchema`.
  Free-form: any slug matching the pattern is allowed, no other
  semantic constraint.
- **`order`** is an integer, conventional for display only
  (admin story-beats list sorts by it). The DB and runtime **do
  not** enforce any ordering, and the runtime does not compare
  `order` between beats.
- **`description`** is a free-text note for authors and admins.
  It is never displayed to players in the current build.
- **The registry** lives in `content/story_beats.yaml` and is
  migrated to `story_beats`. Two server-side beats are seeded
  with slugs `act2_mystery_active` and `act3_finale_unlocked`;
  these are set automatically by the join-mystery flow and the
  LeaderboardWorker respectively, and must remain in the registry
  for those flows to compile.

### 7.2 How `story_beat` is read and written

| Path | Read | Write |
|---|---|---|
| `setStoryBeat` (effects.story_beat on a dialogue node) | — | Flat `UPDATE player_states SET story_beat = $1` (`server/src/database/repositories/PlayerStateRepository.write.ts:setStoryBeat`). No monotonicity check, no transition validation. |
| `getFullState` (player-state assembly) | `ps.story_beat` | — |
| `resolveDialogueTree` (gating) | `ps.story_beat` | — |
| `DialogueResolver` cache key | `ps.story_beat` | — |
| Scene gating (`location.ts:265-271`) | `ps.story_beat` | — |
| Admin story-beats list | `story_beats.story_beat` | Admin CRUD writes the registry table; player `story_beat` is not directly editable. |

### 7.3 Forward-only? — No, by convention

`setStoryBeat` does **not** enforce forward-only progression.
`story_beat` is a free cursor, and the writer does not consult
`order` before overwriting. This is deliberate:

- **Time travel**: the breakthrough-solve and archive flows must be
  able to move a player backward and forward to test endings.
- **Debugging**: operators may need to revert a player\'s beat to
  reproduce a bug.
- **Replay and experimentation**: content authors can explore
  branches without restart friction.

**Author responsibility**: a dialogue tree whose terminal node
sets `effects.story_beat: act1_first_contact` should be reachable
from `act1_awakening` and from `act1_first_contact` itself. If a
branch can lead the player *backward* (e.g. a node that sets
`act1_awakening` on a path that started in `act1_first_contact`),
the author is responsible for either accepting that or adding a
`required_flags` / `required_story_beat` gate to prevent the
backward transition. The runtime will not protect against it.

### 7.4 Branches that set different beats — last write wins

When two branches in the same tree end in nodes that set
`effects.story_beat` to *different* slugs, the player\'s final
`story_beat` is whichever terminal node they actually reached. The
runtime does not record the path, only the final write. If
authors need the player to remember which branch they took, use
`flag_set` (see `shared/src/schemas/dialogue.ts::EffectsSchema`).
A future "branch memory" feature would also need a separate
storage path; the current `story_beat` is intentionally minimal.

### 7.5 Gating contracts

A gate is metadata on the gated surface (scene or dialogue tree)
that constrains visibility based on the player\'s `story_beat`.
Two surfaces share the same gate semantics:

- **Scenes**: `metadata.required_story_beat` (string or string[]).
  Enforced in `server/src/routes/location.ts:265-271`. Slugs are
  cross-referenced against the registry at content-migration time
  (`server/src/content/validate.ts::validateSceneBeatSlugs`,
  `server/tests/unit/storyBeatSchema.property.test.ts:Scene beat
  slug cross-reference`).
- **Dialogue trees**: `metadata.required_story_beat` (string or
  string[]). Enforced in `server/src/routes/dialogue-helpers.ts::
  resolveDialogueTree` via the `isStoryBeatAllowed` helper. Slugs
  are cross-referenced at migration time
  (`validateDialogueTreeBeatSlugs`, property-test block in
  `storyBeatSchema.property.test.ts`).

The gate\'s contract, in both cases:

| `metadata.required_story_beat` | Player satisfies when… |
|---|---|
| absent or `null` | always (backwards-compatible) |
| string | player\'s beat equals that string |
| `string[]` (non-empty) | player\'s beat is in the array |
| `string[]` (empty) | never (defensive fail-closed) |
| any other type | never (defensive fail-closed) |

When a dialogue tree fails the gate, `resolveDialogueTree` falls
through to the speaker-only fallback query (so a beat-unlocked
alternative tree can still serve the same character). If the
fallback also fails the gate, the function returns `null` and
`handleStartDialogue` returns the existing
`"No dialogue available for this character at this location"`
404 error.

### 7.6 Server-side beats (auto-set, not authored from a choice)

Two beats are set server-side, not from a dialogue `effects.story_beat`:

- `act2_mystery_active` — set when the player joins a mystery
  via the `join_mystery` flow.
- `act3_finale_unlocked` — set by the `LeaderboardWorker` when
  a mystery is solved and the finale becomes accessible.

These are identified in `server/src/routes/admin-story-beats.ts`
via `const SERVER_SIDE_BEATS = new Set(['act2_mystery_active',
'act3_finale_unlocked'])` so the admin UI can flag them as
"system-managed" and refuse deletion while in use.

### 7.7 Cross-references

- `docs/NEXT_STEPS.md` — open action items (the beat-semantics
  doc was opened as item 2; this section closes it).
- `server/src/routes/location.ts:244-271` — scene gating
  implementation (the reference for the dialogue-tree mirror).
- `server/src/routes/dialogue-helpers.ts` — `isStoryBeatAllowed`
  and `resolveDialogueTree` (tree-level gate).
- `server/src/services/DialogueResolver.ts` — cache-key partitioning
  by `beat:` so beat changes invalidate correctly.
- `server/src/database/repositories/PlayerStateRepository.write.ts::
  setStoryBeat` — the write path. No monotonicity enforcement;
  see §7.3.
- `shared/src/schemas/dialogue.ts` — `EffectsSchema` (story_beat
  is an optional string slug, max 100 chars).
- `content/story_beats.yaml` — the registry.

---

## 8. References

- `docs/ADMIN_ARCHITECTURE.md` — Admin panel architecture
- `docs/MVW_ARCHITECTURE.md` — Player state engine
- `server/src/content/migrate.ts` — Content migration pipeline
- `server/src/content/validate.ts` — Content validation
- `server/src/content/upsert.ts` — Content upsert logic
- `server/src/routes/admin-content.ts` — Admin content routes
- `server/src/routes/admin-content-link.ts` — Content linking
- `server/src/routes/admin-content-asset.ts` — Asset assignment
- `server/src/routes/assets.helpers.ts` — Prompt catalog and parsing
- `server/src/routes/assets.generation.handlers.ts` — Asset generation
- `docs/lore/assets/scripts/generate-prompt.mjs` — Prompt file generation
- `shared/src/schemas/yaml-content.ts` — YAML content schemas
- `shared/src/schemas/content-validation.ts` — Content types
- `shared/src/schemas/assets.ts` — Asset schemas