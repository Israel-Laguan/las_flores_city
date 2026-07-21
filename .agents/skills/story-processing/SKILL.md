---
name: story-processing
description: "Workflow for processing new story ideas, ensuring narrative consistency, checking conflicts, and migrating content to the local dev mode repository before database deployment."
---

# Story Processing Pipeline

End-to-end workflow for processing narrative ideas, dialogues, and character arcs in Las Flores 2077. This skill ensures that the AI acts as a rigorous Story Editor, keeping the local `content/` folder as a pristine, conflict-free "Dev Mode" source of truth.

## When to use

- Adding new dialogue trees or scenes.
- Processing user-provided story ideas or narrative prompts.
- Authoring overlays, new character profiles, or mystery arcs.
- Any change that involves generating or modifying YAML in the `content/` folder.

## Core Principles: Dev Mode & Publish Pipeline

- **Dev Mode**: The `content/` folder is a Git-tracked, file-based database. It acts as our "Dev Mode" environment. All ideas must first be formalized into YAML files here, so they can be queried and reasoned about locally without touching PostgreSQL.
- **Publish Pipeline**: Once YAML files are authored and approved in Dev Mode, they are validated (`npm run validate:content`) and then deployed to the DB via the admin migration tool or backend scripts.

---

## Steps

### Phase 1: Clarification & Ideation

1. **Read the Idea**: Absorb the narrative prompt provided by the user.
2. **Ask Clarifying Questions**:
   - Are there missing prerequisites? (e.g., "Does the player need to complete the Barista gig before this dialogue triggers?")
   - What are the mechanical costs? (e.g., "Should this choice cost 1 Time Block (TB)?")
   - Are there specific alignment shifts or flags that need to be set (`flag_set`)?
3. **Do not write code yet.** Wait for the user to confirm the mechanics and narrative scope.

### Phase 2: Player-Centric vs. Lore Separation

Before drafting any story beats or dialogue, ensure the narrative structure respects interactive game mechanics. Prevent the "Linear Biography" mistake:
4. **The "Biography" Check**: Ensure the proposed story beats do not read like a linear biography of an NPC's life. 
   - **Lore (Past)**: Events that happened *before* the player met the character (e.g., origin stories, past traumas) belong in `.md` lore files. They are **not** active `story_beats`.
   - **Active Beats (Present)**: A `story_beat` MUST represent a phase of the **Player's** involvement with the character in the present day.
5. **Enforce Player Agency**: Every quest arc must support multiple player choices, including:
   - **Engagement**: Helping or allying with the NPC.
   - **Rejection/Ignoring**: Walking away and defining the game-state consequences for doing so (e.g., quest locks, NPC dies).
   - **Exploitation/Alternative**: Betraying the NPC or seeking a mercenary outcome.
   - **State Tracking**: Define the specific flags (e.g., `trust_level`, `romanced_status`) that track these choices.

### Phase 3: Conflict & Continuity Check

Before drafting YAML, use your tools (like `grep_search`) against the `content/` directory to ensure narrative and mechanical integrity.

4. **Verify Existing Logic**:
   - Ensure the new `story_beat` or flag doesn't contradict an existing flow.
   - Check if an NPC is already occupied in a specific scene (`scenes/*.yaml`) before placing them there.
   - Verify character IDs and scene IDs match what already exists in the local repository.

### Phase 4: Style & Consistency Check

8. **Enforce Tone & Voice**:
   - Writing should match the cyberpunk/noir aesthetic of Las Flores 2077.
   - Ensure characters maintain their established voices (e.g., Vance is pragmatic and corporate; the Barista is mysterious but grounded).
   - Dialogues should be punchy, avoiding overly long exposition dumps in a single node. Keep it interactive.

### Phase 5: Drafting (Local Dev Mode)

9. **Write the YAML**: Create or update the files in the `content/` directory.
   - Follow strict schemas (refer to `shared/src/schemas/dialogue.ts` or similar schemas).
   - Use snake_case IDs.
   - Ensure time blocks (`time_block_cost`) and effects (`effects.flag_set`, `effects.story_beat`) are structurally perfect.
   - Avoid circular references.

### Phase 6: Validation & Deployment

10. **Run Automated Validation**:
   - Run `npm run validate:content` to ensure the new YAML files conform strictly to the game's schemas.
   - Fix any validation errors autonomously.
11. **Final Approval & Migration**:
   - Present the validated YAML changes to the user for final approval.
   - Remind the user that the story is now safely in "Dev Mode" (the repository).
   - Inform the user they can deploy the story via the Admin Panel's "Content Migration" feature when ready.
