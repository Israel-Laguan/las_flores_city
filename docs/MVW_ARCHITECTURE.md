# Minimum Viable World Architecture

## Player State Engine

### Database Schema (OLTP)

#### `users` Table

The `users` table was extended in `003_player_state_schema.sql`:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID (PK) | auto | User identifier |
| `username` | String (Unique) | — | Display name |
| `email` | String (Unique) | — | Email address |
| `password_hash` | String (Bcrypt) | — | Hashed password |
| `current_location_id` | UUID (FK → scenes) | — | Current scene |
| `current_node_id` | VARCHAR(100) | NULL | Current dialogue node |
| `credits` | Integer | 100 | Standard credits |
| `gold_credits` | Integer | 0 | Premium credits |
| `time_blocks` | Integer | 48 | Inline time-block balance |
| `last_login` | Timestamp | — | Last login time |
| `created_at` / `updated_at` | Timestamps | NOW() | Record timestamps |

Time blocks are stored inline on the `users` table rather than in a separate `time_blocks` table.

### Authentication & Session Management

**Login flow:** `POST /auth/login` → verify password → issue JWT with `userId`.

**Dev login:** `POST /auth/dev-login` for quick testing (no password required).

**Middleware:** `authMiddleware` intercepts requests, validates JWT, and attaches `req.userId`.

**JWT expiry:** 24 hours. Client stores the token in `localStorage`.

### State Fetcher (`GET /player/state`)

The `assemblePlayerState(userId)` function queries the `users` table and returns a flat `PlayerState` object:

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

**Redis caching:**
- Key: `user:state:{userId}`
- TTL: 60 seconds
- Invalidation: cache cleared on every POST update (move, sleep, spend, update)

### State Update (`POST /player/update`)

The client sends only changed fields (partial update). Validation rules:

- `time_blocks`: integer, 0–48
- `credits`: integer, ≥ 0
- `gold_credits`: integer, ≥ 0

Updates are applied via a single atomic SQL `UPDATE` statement, transaction-wrapped where needed.

---

## Integration Test Coverage

| Scenario | Notes |
|----------|-------|
| Login | JWT issued, token stored |
| Player state fetch | Flat interface, correct values |
| Location with NPCs | Handler at Apartment |
| Start dialogue | Dialogue state created |
| Make choice | TB deducted, node advanced |
| Move to Café | TB -1, location updated |
| Exhaust TB | 403 Forbidden returned |
| Sleep reset | TB=48, credits-10 |
| Final state | Values match expected |

---

## Modified Files

| File | Changes |
|------|---------|
| `shared/src/index.ts` | `PlayerStateSchema` uses flat interface |
| `server/src/middleware/auth.ts` | JWT expiry set to 24h |
| `server/src/routes/player.ts` | Redis caching, flat response, validation |
| `server/src/routes/auth.ts` | Inline time_blocks, last_login tracking |
| `server/src/routes/dialogue.ts` | Uses inline time_blocks |
| `server/src/database/migrations/003_player_state_schema.sql` | Added gold_credits, current_node_id, last_login, inline time_blocks |
| `client/src/utils/api.ts` | Updated for flat interface |
| `client/src/main.ts` | Uses locationId (flat) |
| `client/src/scenes/WorldScene.ts` | Uses timeBlocks (flat) |
| `client/src/components/PhoneOverlay.ts` | Uses flat interface |
