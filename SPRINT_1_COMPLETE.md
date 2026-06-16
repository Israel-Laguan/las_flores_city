# Sprint 1: The Minimum Viable World (MVW) - Complete

## Task 1.1: Player State Engine (Detailed Audit Against Spec)

### 1.1.1: Database Schema Implementation (OLTP)

#### 1.1.1a: The `users` Table ✅
All required columns implemented in `003_sprint1_schema.sql`:

| Column | Type | Default | Status |
|--------|------|---------|--------|
| `id` | UUID (PK) | auto | ✅ Sprint 0 |
| `username` | String (Unique) | - | ✅ Sprint 0 |
| `email` | String (Unique) | - | ✅ Sprint 0 |
| `password_hash` | String (Bcrypt) | - | ✅ Added |
| `current_location_id` | UUID (FK → scenes) | - | ✅ Added |
| `current_node_id` | VARCHAR(100) (Nullable) | NULL | ✅ Added |
| `credits` | Integer | 100 | ✅ Added |
| `gold_credits` | Integer | 0 | ✅ Added |
| `time_blocks` | Integer | 48 | ✅ Added (inline, not separate table) |
| `last_login` | Timestamp | - | ✅ Added |
| `created_at` / `updated_at` | Timestamps | NOW() | ✅ Sprint 0 |

#### 1.1.1b: Migration Script ✅
- `server/src/database/migrations/003_sprint1_schema.sql`
- Runs automatically via `npm run migrate`

### 1.1.2: Authentication & Session Management

#### 1.1.2a: JWT Implementation ✅
- **Login Flow:** `POST /auth/login` → Verify password → Issue JWT with `userId`
- **Middleware:** `authMiddleware` intercepts requests, validates JWT, attaches `req.userId`
- **Dev Login:** `POST /auth/dev-login` for quick testing (no password required)

#### 1.1.2b: Session Persistence ✅
- JWT expiry: **24 hours** (matches spec)
- Client stores token in `localStorage`

### 1.1.3: The State Fetcher (`GET /player/state`)

#### 1.1.3a: State Assembler ✅
- `assemblePlayerState(userId)` queries `users` table and builds flat `PlayerState` object

#### 1.1.3b: Response Shaping ✅
Returns JSON matching the shared interface:
```typescript
interface PlayerState {
  userId: string;
  username: string;
  locationId: string;
  timeBlocks: number;
  credits: number;
  goldCredits: number;
  currentNodeId: string | null;
  lastLogin: string;
  createdAt: string;
  updatedAt: string;
}
```

#### 1.1.3c: Redis Caching ✅
- **Key:** `user:state:{userId}`
- **TTL:** 60 seconds
- **Invalidation:** Cache cleared on every POST update (move, sleep, spend, update)

### 1.1.4: State Update Mechanism (`POST /player/update`)

#### 1.1.4a: Partial Update Logic ✅
- Client sends only changed fields: `{ "time_blocks": 47, "current_location_id": "uuid-xyz" }`

#### 1.1.4b: Validation ✅
- `time_blocks`: Must be integer, 0-48
- `credits`: Must be integer, ≥ 0
- `gold_credits`: Must be integer, ≥ 0

#### 1.1.4c: Atomic DB Update ✅
- Single SQL `UPDATE` statement
- Transaction-wrapped where needed

---

## Integration Smoke Test Results

| Test | Status | Notes |
|------|--------|-------|
| Login | ✅ | JWT issued, token stored |
| Player State | ✅ | Flat interface, correct values |
| Location + NPCs | ✅ | Handler at Apartment |
| Start Dialogue | ✅ | Dialogue state created |
| Make Choice | ✅ | TB deducted, node advanced |
| Move to Café | ✅ | TB -1, location updated |
| Exhaust TB | ✅ | 403 Forbidden returned |
| Sleep Reset | ✅ | TB=48, credits-10 |
| Final State | ✅ | Values match expected |

---

## Files Modified in Audit

| File | Changes |
|------|---------|
| `shared/src/index.ts` | `PlayerStateSchema` now uses flat interface |
| `server/src/middleware/auth.ts` | JWT expiry changed to 24h |
| `server/src/routes/player.ts` | Redis caching, flat response, validation |
| `server/src/routes/auth.ts` | Inline time_blocks, last_login tracking |
| `server/src/routes/dialogue.ts` | Uses inline time_blocks |
| `server/src/database/migrations/003_sprint1_schema.sql` | Added gold_credits, current_node_id, last_login, inline time_blocks |
| `client/src/utils/api.ts` | Updated for flat interface |
| `client/src/main.ts` | Uses locationId (flat) |
| `client/src/scenes/WorldScene.ts` | Uses timeBlocks (flat) |
| `client/src/components/PhoneOverlay.ts` | Uses flat interface |
| `scripts/sprint1-smoke-test.mjs` | Updated for flat interface |

---

**Sprint 1 Task 1.1 now fully matches the spec.**
