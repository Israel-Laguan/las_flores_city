# D2 · Choice-reachability validation

**Size:** M · **Type:** defect (live, player-facing) · **Rule:** R12

## Context

Verify a submitted `choice_id` belongs to the player's current node **before** calling
into effect processing. Reject unreachable and sibling choices with no effect applied.

This is the shape D2 previews for SC-M3's "choice-reachability validation before effects"
(the new-backend equivalent of this same defect, per `roadmap.md` SC-M3 contents) — get
the validate-before-apply ordering right here since it's reused later.

## Dependencies

- **None** — isolated to `server/`'s existing choice-submission code, independent of
  every setup task and spike. Safe to schedule last or interleaved with D1.

## Acceptance criteria

- A regression test submits a sibling choice (a choice that exists in the tree but not
  from the player's current node) and asserts rejection **with zero effects applied** —
  the test must check side effects were not applied, not just that an error was
  returned.
- Rejection is distinguishable from a server error in the response (a client can tell
  "your choice wasn't valid" apart from "something broke") — check the response
  shape/status code convention used elsewhere in this API before inventing a new one.
- Existing dialogue tests stay green.
- Validation happens **before** effect processing starts, not as a post-hoc check —
  per `lessons-from-current-code.md` R12 (§2.7: "every state transition validates that
  the submitted transition was reachable *before* applying effects").

## Prompt to execute

```
Fix the choice-submission path in this repo's existing dialogue system (server/) so
that a submitted choice_id is verified as reachable from the player's current node
BEFORE any effect processing runs — currently effects can apply even for an
unreachable/sibling choice.

Read lessons-from-current-code.md §2.6/§2.7 (rules R11, R12) before starting.

Steps:
1. Find the current choice-submission handler and locate where effect processing is
   invoked relative to any existing reachability check (if one exists at all).
2. Add a reachability check that runs strictly before effect processing: does the
   submitted choice_id belong to the player's current node in the dialogue tree?
3. On failure, reject with a response distinguishable from a generic server error —
   check this repo's existing convention for client-facing validation-rejection
   responses (status code / error shape) before inventing a new one.
4. Write a regression test that submits a sibling choice (exists in the tree, but not
   reachable from the player's current node) and asserts:
   - the request is rejected
   - the rejection is distinguishable from a 5xx/server-error response
   - zero effects were applied (check whatever effect side-channel exists — flags,
     stats, progress — not just that the HTTP response looked like a rejection)
5. Run the full existing dialogue test suite and confirm nothing regresses.

Do not touch the new api/ tree or anything spike-related — this is an isolated
server/ bugfix. Note in your summary that this fix's validate-before-apply shape is
the direct precedent for SC-M3's new-backend equivalent (see roadmap.md SC-M3), so keep
the check as a clean, separable function rather than inlined logic if that's easy to do
without over-engineering this fix.
```
