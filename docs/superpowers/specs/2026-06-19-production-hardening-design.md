# Task 6.5 — Production Hardening & Build Optimization

**Date:** 2026-06-19
**Status:** Approved
**Epic:** Sprint 6 closeout — secure the auth layer and optimize the production build, with deployment infra deferred to a follow-up.

## Scope (locked)

**Implement now:**
- HttpOnly cookie auth migration (server + client + AI worker), with localhost dev parity
- Vite production build config (native esbuild minify, console stripping, chunk hashing)

**Document only (deferred follow-up):**
- Nginx reverse-proxy + Brotli/Gzip compression
- Dual CDN (AWS S3 public / Pushr.io private) folder structure + bucket policies

A boxed **"Deployment Follow-Up Prompt"** in §9 captures the deferred infra work for the user to execute later.

---

## 1. Spec-drift corrections

The originating Task 6.5 brief contained snippets written against an idealized codebase. These are the corrections applied in this design so the implementation matches our real patterns and our **"zero new dependencies"** rule (the precedent set in Task 4.3 with native `fetch` over `axios`, and reaffirmed for the rate-limiter slice).

| Brief proposal | Actual codebase state | Correction applied |
|---|---|---|
| `import cookieParser from 'cookie-parser'` | Not installed; **violates the zero-new-deps rule** | Hand-rolled ~15-line `parseCookies()`. JWT is already signed by `JWT_SECRET`, so cookie tampering just yields a signature failure — signed cookies are redundant. |
| `req.user = decoded` | `req.userId = decoded.userId` is the established pattern (`middleware/auth.ts:34`); the `user?` field is declared but never populated | Keep `req.userId`; token payload stays `{ userId }` |
| `jwt.sign({ id: user.id })` | `generateToken()` signs `{ userId }` (`middleware/auth.ts:16`) | Keep `generateToken()` unchanged |
| `oltpPool.query(...)` direct | `queryOLTP(...)` is the AGENTS.md-mandated helper | Use `queryOLTP` everywhere |
| `{ success, user }` response | Envelope is `{ success, data: {...}, timestamp }` (`routes/auth.ts:63-70`) | Keep envelope; **stop returning `token` to client** |
| `error: 'UNAUTHORIZED_NO_TOKEN'` | `{ success: false, error: '...', timestamp }` envelope | Keep existing error envelope, do not invent new codes |
| `shouldIntercept(endpoint, options, err)` | Actual signature is `shouldIntercept(err)` (`utils/api.ts:29`) | Keep single-arg signature |
| `crypto.randomUUID()` unconditional | Code guards for envs without `randomUUID` (`utils/api.ts:79-81`) | Keep the guard |
| `API_BASE = '/api'` + rewrite all call sites | 30+ call sites use `/auth/...`, `/player/...`, etc. | Use Vite `rewrite: p => p.replace(/^\/api/, '')` — **zero call-site churn** |
| `minify: 'terser'` + `terserOptions` | Vite 5 default minifier is esbuild; terser is an optional peer dep | **Use native `esbuild.drop: ['console','debugger']` instead** — zero new deps |
| Worker takes `jwt` via postMessage | `aiWorker.ts:79` receives `jwt` as a message arg | Drop `jwt` from the contract; worker authenticates via `credentials: 'include'` |
| E2E injects token via `localStorage` | `mvw.e2e.test.ts:30-32` uses `addInitScript` | HttpOnly cookies cannot be injected this way — migrate to Playwright cookie jar |

---

## 2. Architecture: same-origin cookie model

```
Browser (play.lasflores2077.com  or  localhost:5173)
   │
   │  all fetch() → relative '/api/...' + credentials:'same-origin'
   │  cookies attach automatically (same-origin)
   ▼
[Vite dev proxy]            [Nginx prod]   ← documented only, not built now
   │ rewrite /api → /
   ▼
Express :3000   (cookies set on path='/', SameSite prod=strict/dev=lax, HttpOnly)
```

**Why this works in dev without HTTPS:** `secure: false` when `NODE_ENV !== 'production'`; `sameSite: 'lax'` in dev (strict would block some navigations), `'strict'` in prod. Same-origin means no CORS preflight, no `SameSite=None` requirement, and no third-party cookie partitioning.

**CORS-ready for later (the "hybrid"):** Express CORS becomes env-driven. In dev and same-domain prod it is effectively unused; the moment we flip to `api.lasflores2077.com`, setting `CLIENT_ORIGIN_URL` plus the existing `credentials: true` makes cross-origin credential flow work with no code change.

---

## 3. Server changes

### 3.1 New file `server/src/utils/cookies.ts`

Native cookie parser + cookie setters. **No `cookie-parser` dependency.**

```typescript
import { Request, Response } from 'express';

/**
 * Parse the Cookie header into a flat key→value map.
 *
 * We intentionally do NOT implement signed cookies: the JWT itself is signed
 * by JWT_SECRET, so a tampered cookie simply fails jwt.verify() and is
 * rejected as INVALID_TOKEN — there is no privilege-escalation path. This
 * mirrors the zero-new-deps decision established in Task 4.3 (native fetch).
 */
export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
    }
  }
  return out;
}

/** Attach parsed cookies to req.cookies (the shape cookie-parser would give). */
export function cookieParserMiddleware(req: Request, _res: Response, next: () => void): void {
  (req as Request & { cookies: Record<string, string> }).cookies = parseCookies(req);
  next();
}

const COOKIE_NAME = 'jwt_session';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h — matches generateToken()'s expiresIn

function sameSite(): 'strict' | 'lax' {
  return process.env.NODE_ENV === 'production' ? 'strict' : 'lax';
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: sameSite(),
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: sameSite(),
    path: '/',
  });
}
```

### 3.2 `server/src/middleware/auth.ts`

`authMiddleware` reads the cookie first (populated by the parser middleware), keeps the `Authorization: Bearer` fallback so E2E tests and curl continue to work during the transition, and still sets `req.userId` (not `req.user`). `optionalAuth` gets the same dual-path treatment. The public `generateToken()` helper is unchanged.

```typescript
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  // 1. Prefer the secure HttpOnly cookie.
  let token = (req as any).cookies?.jwt_session;

  // 2. Fall back to the Authorization header for tests / curl / transitional clients.
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'No token provided',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;  // unchanged contract — every route reads req.userId
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
      timestamp: new Date().toISOString(),
    });
  }
}
```

### 3.3 `server/src/routes/auth.ts`

`/login`, `/register`, `/dev-login` call `setSessionCookie(res, token)` and **stop returning `token` in the JSON body**. The response envelope stays `{ success, data: { user }, timestamp }`. New `POST /auth/logout` calls `clearSessionCookie(res)`.

```typescript
import { setSessionCookie, clearSessionCookie } from '../utils/cookies.js';
// ...
const token = generateToken(user.id);
setSessionCookie(res, token);

res.status(201).json({
  success: true,
  data: { user },          // ← token removed from body
  timestamp: new Date().toISOString(),
});

// New route:
authRouter.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ success: true, timestamp: new Date().toISOString() });
});
```

### 3.4 `server/src/index.ts`

Mount the cookie parser before routes, and make CORS env-driven.

```typescript
import { cookieParserMiddleware } from './utils/cookies.js';
// ...
const allowList = process.env.CLIENT_ORIGIN_URL
  ? process.env.CLIENT_ORIGIN_URL.split(',').map(s => s.trim())
  : null;

app.use(cookieParserMiddleware);
app.use(cors({
  origin: allowList ?? true,   // true = reflect origin (dev / same-domain prod)
  credentials: true,           // REQUIRED for the cookie to cross the CORS boundary
}));
app.use(express.json());
```

`docker-compose.yml` server env gains `CLIENT_ORIGIN_URL` (left unset locally; set only on split-domain prod). No other compose changes.

---

## 4. Client changes

### 4.1 `client/src/utils/api.ts` (the core refactor)

- `API_BASE` becomes `'/api'` (was `'http://localhost:3000'`). The Vite proxy strips the prefix so call sites stay unchanged.
- Remove the `authToken` module-level variable, `setAuthToken`, and `getAuthToken`.
- Remove every `localStorage.getItem('auth_token')` / `setItem` / `removeItem`.
- `fetchAPI` drops the `Authorization` header branch and adds `credentials: 'same-origin'`.
- `login` / `register` / `devLogin` stop calling `setAuthToken` — the server's `Set-Cookie` header is applied to the browser jar automatically.
- `shouldIntercept(err)` keeps its single-arg signature; the `crypto.randomUUID` guard stays.

```typescript
const API_BASE = '/api';   // relative; Vite proxy (dev) / Nginx (prod) strip the prefix

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const method = options?.method ?? 'GET';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // No Authorization header. No localStorage. The browser attaches the
  // HttpOnly jwt_session cookie automatically because credentials:'same-origin'.

  const attempt = async (): Promise<T> => {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options?.headers },
      credentials: 'same-origin',
    });
    // ... unchanged error/status handling and TerminalModal intercept ...
  };
  // ... unchanged try/catch + TerminalModal wiring ...
}

export async function login(email: string, password: string) {
  const result = await fetchAPI('/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  });
  // No setAuthToken — cookie is already set by Set-Cookie.
  return result;
}
// devLogin / register: same treatment.
```

### 4.2 `client/vite.config.ts`

Proxy gains a `rewrite` rule so existing `/auth/...`, `/player/...` call sites continue to hit the right server path:

```typescript
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/api/, ''),
    },
    '/comms': { target: 'http://localhost:3000', changeOrigin: true },
  },
},
```

### 4.3 `client/src/workers/aiWorker.ts`

Drop `jwt` from the `RewriteRequest` interface and from the `onmessage` destructure. Fetch the key share with `credentials: 'same-origin'` (workers run same-origin and share the browser's cookie jar) and remove the `Authorization` header. Same value as the main thread — consistent and tight.

```typescript
interface RewriteRequest {
  id: string;
  type: 'rewrite_choices';
  choices: Array<{ id: string; text: string; next_node_id: string; [key: string]: any }>;
  relationshipContext: string;
  localKey: string;
  // jwt removed — worker authenticates via the HttpOnly cookie
}

self.onmessage = async (event: MessageEvent<RewriteRequest>) => {
  const { id, type, choices, relationshipContext, localKey } = event.data;
  // ...
  const res = await fetch('/api/settings/ai-key-share', {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',   // cookie attaches automatically (same-origin)
  });
  // ... rest unchanged: decrypt with localKey, call LLM, postMessage back
};
```

### 4.4 `client/src/components/DialogueUI.ts`

Lines 146 and 151 stop reading `localStorage.getItem('auth_token')` and stop passing `jwt` in the worker `postMessage`. The guard becomes simply `!phoneStore.getState().aiEnabled || !getLocalKey()`.

### 4.5 Stray `localStorage` token reads (6 files)

The following files bypass `api.ts` and read tokens directly. Each switches to the relative `/api/...` path + `credentials: 'same-origin'` and drops the `Authorization: Bearer` header:

- `client/src/ui/apps/FeedApp.ts:15,89` (`localStorage.getItem('jwt')`)
- `client/src/ui/apps/MessagesApp.ts:67` (`'auth_token'` or `'jwt'`)
- `client/src/ui/apps/TrabajandoApp.ts:17,91` (same)
- `client/src/ui/apps/SettingsApp.ts:153,175,199` (same)
- `client/src/components/PhoneOverlay.ts:44` (`hasAuthToken` check) — under cookies there is no JS-visible token, so the `hasAuthToken` boolean is replaced by calling the existing `api.getPlayerState()` (or a lightweight `/auth/me` probe if preferred). If the probe 401s, the phone shows its logged-out state; otherwise it proceeds. The gating decision is based on the server response, never on a client-side token check.

### 4.6 `client/src/main.ts`

`initApp()` currently checks `api.getAuthToken()` before dev-login. Under cookies there is no JS-visible token, so the flow becomes: try `getPlayerState()`; on 401, call `devLogin()`. The cookie is then set by the server and subsequent requests authenticate automatically.

---

## 5. Vite production build

Native esbuild minification with console/debugger stripping. **No `terser` dependency** — this honors the zero-new-deps rule absolutely (corrected from the brief's terser proposal during design review).

```typescript
build: {
  outDir: 'dist',
  emptyOutDir: true,
  // esbuild is Vite's built-in minifier. drop: ['console','debugger'] replaces
  // terser's drop_console/drop_debugger with zero new dependencies.
  chunkFileNames: 'assets/js/[name]-[hash].js',
  entryFileNames: 'assets/js/[name]-[hash].js',
  assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
  rollupOptions: {
    output: {
      manualChunks: { phaser: ['phaser'] },  // already present — preserved
    },
  },
},
esbuild: {
  drop: ['console', 'debugger'],   // production-only by default; dev server unaffected
  legalComments: 'none',
},
```

> **Note:** `esbuild.drop` applies to the dev transform too unless guarded. If console logs are needed during `vite dev`, gate it behind `mode === 'production'` in the config function form: `export default defineConfig(({ mode }) => ({ esbuild: mode === 'production' ? { drop: ['console','debugger'] } : {} , ... }))`. The implementation will use the function form to keep dev DX intact.

**Verification:** `npm run build --workspace=client` must emit hashed assets under `dist/assets/js/` with no `console.` calls in the output (grep the built bundle).

---

## 6. Test changes

### 6.1 Existing E2E suites — cookie-jar migration

Affected: `client/tests/e2e/mvw.e2e.test.ts`, `terminal-modal.e2e.test.ts`, `phone-os.e2e.test.ts`. The `addInitScript(localStorage.setItem(...))` pattern cannot set HttpOnly cookies. New pattern:

```typescript
let authContext: any;  // shared Playwright request context holding the cookie

test.beforeAll(async ({ request }) => {
  const res = await request.post(`${API_BASE}/auth/register`, { data: { ... } });
  expect(res.ok()).toBeTruthy();
  // Playwright's `request` context captures the Set-Cookie automatically.
});

test.beforeEach(async ({ page, request }) => {
  const cookies = (await request.context().cookies()).filter(c => c.name === 'jwt_session');
  await page.context().addCookies(cookies.map(c => ({ ...c, url: API_BASE })));
});
```

Every `fetch(...)` inside `page.evaluate(...)` drops the `Authorization` header and uses `credentials: 'same-origin'`. The page under test is served by Vite dev at `http://localhost:5173`, so in-test fetches must use the **relative** `/api/...` path (which Vite proxies to `:3000`) to remain same-origin with the page and let the cookie attach. Absolute `http://localhost:3000/...` URLs from inside the page would be cross-origin to `:5173` and break the same-origin cookie model the test is meant to verify.

### 6.2 New focused E2E: `client/tests/e2e/auth-cookie.e2e.test.ts`

Asserts the new contract end-to-end:
1. `POST /auth/register` response body has **no `token` field**.
2. The response carries `Set-Cookie: jwt_session=...; HttpOnly; SameSite=Lax; Path=/`.
3. A follow-up `GET /player/state` with no `Authorization` header returns 200 (cookie authenticates).
4. `POST /auth/logout` clears the cookie; a subsequent `/player/state` returns 401.

---

## 7. Local Docker parity verification

Per AGENTS.md, after server code changes: `docker compose build server && docker compose up -d server`, then verify with `curl http://localhost:3000/health`. For this task, additionally:

```bash
# Cookie is set, body has no token:
curl -i -c /tmp/lf_cookies -X POST http://localhost:3000/auth/dev-login -H 'Content-Type: application/json' -d '{}'
# → Set-Cookie: jwt_session=...; HttpOnly; SameSite=Lax; Path=/
# → { "success": true, "data": { "user": {...} }, ... }   (no "token")

# Authenticated request with NO Authorization header:
curl -b /tmp/lf_cookies http://localhost:3000/player/state
# → 200 { "success": true, "data": {...}, ... }
```

---

## 8. Definition of Done (scoped)

- [ ] Native cookie parser mounted; `req.cookies` populated before routes (no `cookie-parser` dep).
- [ ] `/login`, `/register`, `/dev-login` set the `HttpOnly` `jwt_session` cookie; JSON body no longer contains `token`.
- [ ] New `POST /auth/logout` clears the cookie.
- [ ] `authMiddleware` reads cookie first, falls back to `Authorization: Bearer`; sets `req.userId` (not `req.user`).
- [ ] CORS env-driven via `CLIENT_ORIGIN_URL` with `credentials: true`.
- [ ] Client `fetchAPI` uses relative `/api`, `credentials: 'same-origin'`, no `Authorization` header, no `localStorage` token state.
- [ ] AI worker authenticates via cookies; `jwt` removed from the postMessage contract.
- [ ] All stray `localStorage['jwt']` / `['auth_token']` reads removed (6 files).
- [ ] Vite prod build uses native `esbuild.drop` (no terser); verified via `npm run build --workspace=client` and a grep for `console.` in the bundle.
- [ ] E2E suite migrated to the cookie-jar pattern; new `auth-cookie.e2e.test.ts` passes.
- [ ] Local Docker parity verified: login → cookie set → `/player/state` 200 with no `Authorization` header.
- [ ] Deployment appendix (§9) written with the follow-up prompt.

---

## 9. Deployment Follow-Up (DOCUMENTED ONLY — not implemented in this task)

The work below is intentionally deferred. It is captured here so the next session can execute it without re-deriving the architecture.

### 9.1 Nginx ingress + Brotli/Gzip

Mirrors the same-origin Vite proxy from development so cookies continue to pass with zero CORS friction.

```nginx
# /nginx/production.conf  (to be created in a follow-up task)
server {
    listen 443 ssl http2;
    server_name play.lasflores2077.com;

    ssl_certificate     /etc/letsencrypt/live/play.lasflores2077.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/play.lasflores2077.com/privkey.pem;

    # Gzip fallback
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss;

    # Brotli (requires ngx_brotli module in the nginx image)
    brotli on;
    brotli_comp_level 4;
    brotli_types text/plain text/css text/xml application/json application/javascript application/xml+rss;

    # Compiled client SPA
    location / {
        root /var/www/las-flores-client;
        try_files $uri $uri/ /index.html;
        expires 7d;
        add_header Cache-Control "public, no-transform";
    }

    # Hashed static assets — cache aggressively
    location /assets/ {
        root /var/www/las-flores-client;
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }

    # API reverse proxy (same-origin → cookies just work)
    location /api/ {
        proxy_pass http://las-flores-server:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 9.2 Dual CDN: SFW (AWS S3 + CloudFront) vs NSFW (Pushr.io / private bucket)

| Path prefix | Destination | Access |
|---|---|---|
| `cdn.lasflores2077.com/public/scenes/*` | S3 public bucket → CloudFront | Public read |
| `cdn.lasflores2077.com/public/portraits/*` | S3 public bucket → CloudFront | Public read |
| `cdn.lasflores2077.com/secure/vault/*` | Private bucket → Pushr.io | Signed-URL only (Task 4.4 `StorageService`) |

**Public SFW bucket policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::las-flores-public-assets/*"
  }]
}
```

**Private NSFW bucket policy** (deny all unsigned access — Pushr.io enforces equivalent under "Secure Tokens / Hotlink Protection"):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyUnsignedAccess",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::las-flores-secure-vault/*"
  }]
}
```

Access to `/secure/vault/*` is mediated exclusively through the existing signed-URL service in `server/src/services/StorageService.ts` (unchanged by this task).

### 9.3 Follow-Up Prompt (paste back to the agent when ready)

> **Task 6.6 — Production Deployment Infra.** Implement the deferred deployment work documented in `docs/superpowers/specs/2026-06-19-production-hardening-design.md` §9: (1) add `nginx/production.conf` with Brotli + Gzip + `/api` reverse proxy + asset cache headers, plus a client Dockerfile and a `docker-compose.prod.yml` that wires client + nginx + server; (2) provision the dual CDN — S3 public bucket + CloudFront for SFW assets, private bucket + Pushr.io for NSFW, matching the `/public/*` vs `/secure/*` path convention; (3) set `CLIENT_ORIGIN_URL`, `CDN_BASE_URL`, and TLS secrets in the production environment. The auth + build work from Task 6.5 is already complete and must not be regressed.
