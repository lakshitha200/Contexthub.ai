# ContextHub Backend — Finished Modules

Status of the NestJS backend as of this document. Everything below is **implemented and wired** into `AppModule`.

- **Base URL:** all routes are prefixed with `/api/v1` (set in [main.ts](src/main.ts)).
- **Validation:** global `ValidationPipe` with `whitelist + forbidNonWhitelisted + transform`. Unknown body fields are rejected with `400`.
- **Auth model:** a global `JwtAuthGuard` (registered as `APP_GUARD`) protects **every** route by default. Routes marked `@Public()` skip it. So unless a route says *Public*, it needs a valid `Authorization: Bearer <accessToken>`.

| Module | Responsibility |
|--------|----------------|
| Auth | Register/login, JWT access+refresh, magic link, Google OAuth, profile, sessions |
| Workspace | Workspaces, members, roles (OWNER/ADMIN/MEMBER), invites |
| Collection | Folders inside a workspace that group documents |
| Document | File upload/list/download/delete into a collection |
| Storage | Low-level file persistence (local FS today, S3-swappable) |
| Prisma | DB access layer shared by all modules |

---

## 1. Auth module

Files: [auth.controller.ts](src/auth/auth.controller.ts), [auth.service.ts](src/auth/services/auth.service.ts), [token.service.ts](src/auth/services/token.service.ts), [mail.service.ts](src/auth/services/mail.service.ts).

**What it does:** issues a short-lived **access token** (default 15m) and a long-lived **refresh token** (default 7d). Refresh tokens are stored **hashed (SHA-256)** in the DB with `userAgent`/`ipAddress` so each is a revocable "session". Passwords are hashed with **bcrypt** (12 rounds default).

### Endpoints (`/api/v1/auth`)

| Method | Path | Access | What it does |
|--------|------|--------|--------------|
| POST | `/register` | Public | Create user (email + password, optional name). Returns `{ user, tokens }`. `409` if email exists. |
| POST | `/login` | Public | Verify password, issue tokens. `401` on bad credentials. |
| POST | `/refresh` | Public + refresh guard | Rotates tokens: old refresh token is revoked, new pair issued. **Reuse of an already-used/revoked token revokes the whole user's sessions** (theft detection). |
| POST | `/logout` | Authed | Revokes the given `refreshToken`. |
| GET | `/me` | Authed | Current user profile. |
| PATCH | `/me` | Authed | Update `name` / `avatarUrl`. |
| POST | `/change-password` | Authed | Verify current password, set new one, **revoke all sessions**. |
| POST | `/magic-link/request` | Public | Email a one-time login link. Creates the user if new. Always returns success (no email enumeration). |
| GET | `/magic-link/verify?token=` | Public | Consume the link, mark email verified, issue tokens. |
| GET | `/google` | Public | Starts Google OAuth redirect. |
| GET | `/google/callback` | Public | On success, redirects to `WEB_URL/auth/callback?accessToken=…&refreshToken=…`. |

**Key rules baked in:**
- Refresh tokens are single-use (rotated on every `/refresh`).
- Magic-link & OAuth users may have **no password** → `change-password` returns a clear `400`.
- Token verification details live in the JWT strategies ([strategies/](src/auth/strategies/)).

---

## 2. Workspace module

Files: [workspace.controller.ts](src/workspace/workspace.controller.ts), [workspace.service.ts](src/workspace/workspace.service.ts), [workspace.guard.ts](src/workspace/guards/workspace.guard.ts).

**What it does:** multi-tenant container. Every workspace has members with a **role** (`OWNER`, `ADMIN`, `MEMBER`). The creator becomes `OWNER`. A unique URL `slug` is auto-generated from the name.

**Access control** — `WorkspaceGuard` runs on `:id` routes: it confirms the caller is a member, optionally enforces `@Roles(...)`, and attaches `request.membership`.

### Endpoints (`/api/v1/workspaces`)

| Method | Path | Min role | What it does |
|--------|------|----------|--------------|
| POST | `/` | any authed | Create workspace; caller becomes OWNER. |
| GET | `/` | any authed | List workspaces the caller belongs to (+ member/doc counts). |
| POST | `/invites/accept` | any authed | Accept an invite by token (email must match). |
| GET | `/:id` | member | Workspace details + counts. |
| PATCH | `/:id` | OWNER | Update name/description. |
| DELETE | `/:id` | OWNER | Delete workspace (cascades). |
| GET | `/:id/members` | member | List members with user info. |
| POST | `/:id/invite` | OWNER/ADMIN | Email an invite (role ADMIN or MEMBER only). Upserts existing invite. |
| PATCH | `/:id/members/:userId` | OWNER | Change a member's role. |
| DELETE | `/:id/members/:userId` | OWNER/ADMIN | Remove a member. |
| POST | `/:id/leave` | member | Leave the workspace. |

**Safety rules:** you can never demote/remove the **last OWNER**; you must `leave` to remove yourself; only an OWNER can remove another OWNER; invites expire (default 7 days) and are one-time.

---

## 3. Collection module

Files: [collection.controller.ts](src/collection/collection.controller.ts), [collection.service.ts](src/collection/collection.service.ts).

**What it does:** a named folder **inside a workspace** that groups documents (and later, conversations). `WorkspaceGuard` is applied at the controller level, so membership is required for all routes. Every lookup re-checks the collection actually belongs to the workspace in the URL (prevents cross-tenant access).

### Endpoints (`/api/v1/workspaces/:id/collections`)

| Method | Path | Min role | What it does |
|--------|------|----------|--------------|
| POST | `/` | member | Create collection. |
| GET | `/` | member | List collections (+ document/conversation counts). |
| GET | `/:collectionId` | member | Get one collection. |
| PATCH | `/:collectionId` | OWNER/ADMIN | Rename. |
| DELETE | `/:collectionId` | OWNER/ADMIN | Delete (cascades documents). |

---

## 4. Document module

Files: [document.controller.ts](src/document/document.controller.ts), [document.service.ts](src/document/document.service.ts).

**What it does:** upload files into a collection, list/download/delete them. Uses multipart upload (`FileInterceptor('file')`). On upload it **validates type and size**, then writes bytes via `StorageService` and records a `Document` row with status `UPLOADED`.

- **Allowed types:** PDF, TXT, Markdown, HTML, CSV, JSON, DOC, DOCX.
- **Size limit:** `MAX_UPLOAD_MB` (default 25 MB).
- **Status lifecycle (enum):** `UPLOADED → PARSING → CHUNKING → EMBEDDING → READY` / `FAILED` — the later stages are for the upcoming ingestion/RAG pipeline (not built yet).

### Endpoints (`/api/v1/workspaces/:id/collections/:collectionId/documents`)

| Method | Path | Min role | What it does |
|--------|------|----------|--------------|
| POST | `/` | member | Upload a file (`multipart/form-data`, field `file`). |
| GET | `/` | member | List documents; optional `?status=` filter. |
| GET | `/:documentId` | member | Document metadata. |
| GET | `/:documentId/download` | member | Stream the file back (`Content-Disposition: attachment`). |
| DELETE | `/:documentId` | OWNER/ADMIN | Delete DB row + stored file. |

---

## 5. Storage module

File: [storage.service.ts](src/storage/storage.service.ts).

**What it does:** the only code that touches the filesystem. Deliberately narrow (`save / createReadStream / exists / remove`) so it can be swapped for S3/GCS later without changing callers — only the opaque `storageKey` contract matters.

- Files stored under `STORAGE_DIR` (default `./storage`) as `workspaces/<workspaceId>/<uuid>-<sanitized-name>`.
- Filenames are sanitized and paths are **guarded against traversal**.

---

## 6. Prisma / data model

Schema split across [prisma/schema/](prisma/schema/). Core models behind the modules above:

- **User** — `email` (unique), optional `passwordHash` (null for OAuth/magic-link), `emailVerified`, profile.
- **RefreshToken** — hashed token, device meta, `expiresAt`/`revokedAt` (= a session).
- **VerificationToken** — magic-link / email-verify / password-reset tokens (hashed, one-time).
- **OAuthAccount** — linked provider identities (`provider + providerAccountId` unique).
- **Invite** — pending workspace invites (hashed token, expiry, accepted/revoked).
- **Workspace / WorkspaceMember** — tenant + membership with `Role`.
- **Collection** — folder within a workspace.
- **Document** — file metadata + `DocStatus`, linked to workspace/collection/uploader.

> Schemas for `Chunk`, `Conversation`/`chat`, `Job`, and `AuditLog` exist in the Prisma schema but **their service/controller code is not built yet** — they belong to the next phase (ingestion + RAG chat).

---

## Quick mental model

```
User ──member──> Workspace ──> Collection ──> Document ──> (file in Storage)
                    │
                    └─ Invite (email someone in)

Auth issues: accessToken (15m) + refreshToken (7d, rotating, revocable)
Every request: JwtAuthGuard (global) → WorkspaceGuard (per :id) → @Roles check
```

## Relevant env vars

`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_DAYS`, `BCRYPT_ROUNDS`, `MAGIC_LINK_TTL_MIN`, `INVITE_TTL_DAYS`, `MAX_UPLOAD_MB`, `STORAGE_DIR`, `WEB_URL`, Google OAuth (`GOOGLE_*`), and mail settings.
