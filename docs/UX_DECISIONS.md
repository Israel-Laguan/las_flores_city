# UX Decisions

This document captures intentional UX design decisions that shape the player experience. They serve as reference for future feature work and content authoring.

---

## Main Menu: Single "START GAME" Button

### The decision

The main menu does **not** have separate "NEW GAME" and "CONTINUE" buttons. Instead, a single "START GAME" button dynamically labels itself:

- **"NEW GAME"** — shown when no saved activity exists.
- **"CONTINUE"** — shown when player activity exists (any time block spent, dialogue started, story beat advanced, or flags set).

### The rationale

Once a player spends a time block, the story is committed. There is no undo, no save-scumming, no going back to a clean slate. By presenting a single action, the UI reinforces that this commitment is meaningful:

- A "NEW GAME" option alongside "CONTINUE" would falsely imply the player can restart freely without consequence.
- A "NEW GAME" option that actually wiped progress would be destructive and surprising.
- The dynamic label gives returning players a clear signal that progress exists, without offering a revert.

### Technical implementation

- Activity is detected client-side from the `PlayerState` fetched via `GET /player/state`.
- Five fields are checked (OR logic): `storyBeat !== 'prologue'`, `currentDay > 1`, `timeBlocks < 48`, `currentNodeId != null`, `Object.keys(flags).length > 0`.
- The button always fires the same event (`game:start`) regardless of label. The server does not distinguish "new" from "continue" — both paths fetch the current player state and resume from wherever the player left off.
- The `isNew` flag on the emitted event is vestigial and never consumed. It exists only for backwards compatibility with the event handler signature.

### Marketing framing

> "Some decisions can't be unmade. Every time block spent is a choice that moves the story forward. There's no undo — your actions are your story."

---

## Time-block Commitment Principle

Time blocks are the game's primary pacing resource. They are non-refundable once spent. This applies everywhere:

- Dialogue choices that cost TB cannot be reversed.
- Movement between locations costs 1 TB and the change is permanent.
- Sleeping resets TB to 48 but costs credits (rent deduction) and advances the day.

### Why not allow undo?

1. **Narrative weight** — choices must matter. If a player can undo a dialogue choice, the emotional stakes of difficult conversations are lost.
2. **Simplicity** — a save/restore system adds complexity to the state machine, cache invalidation, and OLAP telemetry integrity.
3. **Alignment with the setting** — the game's world is a persistent simulation. The player character lives with the consequences of their actions.
