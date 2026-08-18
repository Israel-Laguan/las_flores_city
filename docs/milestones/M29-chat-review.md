# M29 — Conversational Chat Assistant + `needs_review` Queue

> **Status:** Implemented (act-mode build; working tree carries M28 changes — not committed) · **Branch:** `milestone/29-chat-review` · **PR size target:** ~25 files (landed ~30)
> **Phase:** 8 · **Source:** `ARCHITECTURE_SEPARATION_ANALYSIS.md` §12 Moment 4, §13, §15.8

## Goal

Deliver the human-in-the-loop review surface: a multi-turn, graph-scoped chat assistant
(Moment 4) and a first-class `needs_review` triage queue (§15.8) for proposals and
conflicts.

## Scope

| Item | Detail |
|---|---|
| **`chatExplain` / `chatPropose`** | new `LLMProvider` methods; prose reply vs structured `GraphDelta` (propose/explain split so questions don't trigger structured generation) |
| **`POST .../chat` + `.../chat/apply-delta`** | validate `GraphDeltaSchema` → write shadow-node/tombstone delta → mark `:Conflict 'addressed'` → merged-view refresh |
| **`needs_review` queue** | diff-style previews (`+Person: Sarah`, `+Alice --VISITED--> Central Station`, `⚠ conflict …`) with `[Keep existing][Accept new][Merge][Edit]` |
| **Chat side-panel / "Copy to Chat"** | `ConflictChatContext` bundle (conflict + evidence + neighborhood); docks on any admin page |

## Key changes / files touched (~25)

| Area | Files |
|---|---|
| LLM | `LLMTypes.ts`, `LiteLLMProvider.ts`, `LLMPrompts.ts` (`chatExplain`/`chatPropose`) |
| Routes | `admin-story-builder-chat.ts` (+ apply-delta) |
| Shared schemas | `graph-delta.ts` validation, `ConflictChatContextSchema` |
| Admin UI | chat side-panel, review queue, copy-to-chat (+ tests) |
| Tests | unit for delta validation; integration for apply-delta → mark addressed |

## Risks & verification

- **Risk:** Medium. Structured-output validity — a malformed `GraphDelta` must never
  corrupt the graph (validate before write, reject-and-refine); cost/latency of chat
  loops.
- **Verify:** from a `:Conflict`, copy to chat, chatExplain returns prose, chatPropose
  returns a valid `GraphDelta`, apply writes the delta and marks the conflict addressed.
- **Accept:** a full conflict → propose → apply → refresh loop works from the admin UI.

## Definition of Done

- [x] `chatExplain`/`chatPropose` implemented with propose/explain split
- [x] `apply-delta` validates `GraphDeltaSchema`, writes delta, marks conflict addressed
- [x] `needs_review` queue with diff previews + resolution actions
- [x] "Copy to Chat" + side-panel UX working end-to-end

## Implementation notes (deltas surfaced against the original plan)

- **`AdminEventEmitter.ts`** gained `plan_chat_reply` / `plan_delta_applied` /
  `plan_delta_discarded` union members (the routes emit these; the union is the
  type gate).
- **`GET /review-queue` resolves to `/admin/story-builder/review-queue`** (the chat
  router mounts under the actions router, which sits under `/admin/story-builder`).
- **`CritiqueOverlay.tsx` lives at**
  `admin/src/app/(admin)/story-builder/components/CritiqueOverlay.tsx`; the
  disabled M29 stub was replaced with a live "Copy to Chat" that opens the chat
  panel (with an `onCopyToChat` override kept for tests).
- **Server isolation**: admin/content-authoring routes (including the new chat +
  review-queue endpoints) are served by the **intake-worker on `:3001`** (the
  game-server on `:3000` does not mount them). Verified live via in-container
  `wget` probes: `/health` → `{"success":true}` and
  `/admin/story-builder/review-queue` → `401` (auth), not `404`.
- **Chat is ephemeral by construction**: no chat table; `POST .../chat` carries the
  full message history (capped to the last ~40) and `apply-delta`/`discard-delta`
  are the only durable writes.