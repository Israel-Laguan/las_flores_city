# Sprint 2 — Object Storage Decoupling from MinIO

> **Status:** Planned (not started)
> **Owner:** platform / infra
> **Origin:** CI failure on the MinIO `services:` block, 2026-10-04
> **Depends on:** the Silo image swap (already landed separately)

## Problem

The stack is named after, configured with, and coupled to a specific vendor
(`minio`) at every layer, while the code it actually needs is only "an
S3-compatible endpoint". The vendor's continued availability was an
assumption nobody had tested.

This became concrete when CI failed with `unauthorized` pulling
`quay.io/minio/minio`. Two separate defects were stacked on top of each other:

1. **A fabricated image pin.** `.github/workflows/ci.yml` pinned
   `quay.io/minio/minio:UNVERIFIED-PINNED@sha256:a1a8bd...` — a fabricated
   tag/digest pair whose own comment admitted it was never verified. This
   alone explains the `unauthorized` error.
2. **The vendor is genuinely gone.** Upstream MinIO archived the community
   edition and removed the public Docker Hub repo. Verified via registry token
   introspection with a control group:

   | repo | anonymous token `access` |
   | --- | --- |
   | `library/redis` | `[pull]` |
   | `minio/minio` | `[]` (pull denied) |
   | `pgsty/silo` | `[pull]` |

   So `docker-compose.yml`'s `minio/minio:latest` was equally broken for local
   dev — it only appeared to work because the image was already cached in the
   local podman store.

The immediate fix (swap to PGSTY's Silo, a maintained MinIO-compatible fork,
pinned to a registry-verified multi-arch digest) is done and tested. **This
sprint is about the naming and coupling debt it exposed, not about the outage.**

## Why this is not just a rename

Renaming is only safe if the two layers are treated separately, because they
have very different costs:

| Layer | Blast radius | Risk |
| --- | --- | --- |
| App code reading `MINIO_*` | **33 refs, all in one file** (`server/src/services/StorageService.ts`) | Low |
| Infra identity (service / container / volume names) | ~14 files, 4 hostname refs | Low |
| Env var names in deployment config | 163 refs total (`scripts/` 74, `docs/` 43, `.github/` 13) + prod secrets + every dev host | **High** |

The app-side coupling is already effectively contained. The expensive part is
`MINIO_*` as an *interoperability contract*: it is the de-facto standard name
that every MinIO-compatible server reads, Silo included. Renaming it buys
purity but costs a coordinated deployment break unless aliased.

## Goals

- A future vendor swap touches one image reference, not the repo.
- Compose service/container/volume names describe the capability, not a vendor.
- Any env var rename is backwards compatible and non-breaking for existing
  deployments.

## Non-goals

- Replacing S3 semantics with a different storage API.
- Re-architecture of `StorageService.ts` beyond what the rename requires.
- Unrelated infra cleanup.

## Phase 1 — Infra identity (safe, self-contained)

Rename the vendor out of the *orchestration layer only*. No application code
changes; only hostnames and names.

- Compose service `minio` -> `object-storage` in `docker-compose.yml` and
  `docker-compose.prod.yml`.
- Update the four hostname references that resolve the service by name:
  `docker-compose.yml:151`, `docker-compose.yml:254`,
  `docker-compose.prod.yml:67`, `docker-compose.prod.yml:127`.
- `container_name: las-flores-minio` -> `las-flores-object-storage`
  (14 files reference the current name).
- Volume `.minio-data/` -> `.object-storage-data/`, plus
  `scripts/setup-persistent-minio.sh`.
- Update `README.md`, `AGENTS.md`, `docs/DEVELOPMENT_SETUP.md`,
  `docs/DOCKER_INTEGRATION.md`, `docs/development/MINIO_SETUP.md` (renamed),
  `docs/development/ADMIN_QA.md`, `start-stack.sh`, `scripts/podman-workflow.sh`,
  and the `podman-dev` / `podman-ops` skills.

**Keep `MINIO_*` env vars unchanged in this phase.** They are read by the
server process, not by the compose service name, so Phase 1 is behaviourally
inert.

## Phase 2 — Env var migration (breaking; needs a deprecation window)

Introduce vendor-neutral names with `MINIO_*` retained as a fallback.

- Primary: `S3_ENDPOINT`, `S3_PORT`, `S3_PUBLIC_URL`, `S3_BUCKET`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY`.
- Read both, e.g. `S3_ENDPOINT ?? MINIO_ENDPOINT`, inside the single choke
  point `StorageService.ts`. Log a deprecation warning when the legacy name is
  used.
- Update `docker-compose*.yml`, `.github/workflows/ci.yml`, `scripts/`,
  `.env.example`, and deployment secrets.
- Remove the `MINIO_*` fallback only after a release cycle and a check that no
  deployment still sets them.

## Acceptance criteria

- [ ] `grep -rn 'minio' --include='*.yml' --include='*.sh'` returns no vendor
      name in orchestration config (docs may mention history).
- [ ] Full stack boots from a clean `docker compose up` and from the Podman
      runbook; `mc ready local` / the Silo healthcheck passes.
- [ ] Integration suites that require object storage still pass:
      `compiler`, `d2-choice-reachability`, `m30.snapshots`, and the ~11 suites
      that call `publishDialogueTree` unmocked.
- [ ] After Phase 2: an old `.env` using only `MINIO_*` still boots, with a
      warning.

## Risks / things to verify during the sprint

- **Data migration.** Renaming the volume orphans existing local data. Silo has
  already been verified to read a MinIO-written volume, but doing the volume
  rename and the image swap in the same change would make any data problem
  ambiguous. Do not combine them.
- **On-disk format.** Silo claims MinIO on-disk compatibility. This has been
  verified for *reading* a volume written by the old MinIO image; a
  *write-then-read-back-by-MinIO* round trip has not been tested and should not
  be assumed.
- **Third-party provenance.** Silo is AGPLv3, maintained by Pigsty, not MinIO.
  This was adopted as an urgent unblock; the provenance decision should be
  reviewed on its own merits rather than inherited from the outage fix.
- **Console port.** MinIO's web console (`--console-address :9001`) is
  carried over in the current config; confirm whether Silo's console is
  feature-equivalent or should be dropped.

## Open questions

1. Keep a `minio` service alias for back-compat with anyone's local scripts, or
   break it cleanly?
2. Is `MINIO_SETUP.md` renamed, or folded into `DEVELOPMENT_SETUP.md`?
3. Should Phase 2 ship at all, or is the single-file containment in
   `StorageService.ts` good enough justification to keep `MINIO_*` forever as
   the standard name?

## Reference

- Immediate fix: `docker-compose.yml`, `.github/workflows/ci.yml`, and the
  runbooks now pin
  `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z@sha256:635197cb...`.
- Storage choke point: `server/src/services/StorageService.ts`.