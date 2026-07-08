# ContextHub — Frontend

Next.js 16 (App Router, Turbopack) + React 19 + Tailwind v4. A smooth, animated
UI for the ContextHub RAG knowledge workspace.

## Run

```bash
npm run dev      # http://localhost:3001  (matches backend WEB_URL for OAuth)
```

By default it runs against an **in-memory mock backend**, so the whole app is
usable without the NestJS server. Seeded with demo workspaces, documents (in
various processing states) and cited conversations. Sign in with any email +
password (min 6 chars).

## Connecting the real backend (later)

Everything already speaks the backend's contract (`/api/v1`, JWT access+refresh,
workspace-scoped routes). To go live, edit `.env.local`:

```bash
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

Then enable CORS in the NestJS app (`main.ts`) for `http://localhost:3001`.
No component changes needed — `lib/api/index.ts` swaps the mock for `real.ts`.

## Structure

```
app/
  auth/                     Login, register, magic-link, OAuth callback (/auth/*)
  (app)/                    Signed-in surfaces (auth-gated)
    workspaces/             Workspace picker
    settings/profile/       Account profile
    w/[workspaceId]/        Workspace shell (sidebar + context)
      chat/                 Conversation rail + chat view (streaming + citations)
      documents/            Upload, live status, collections filter
      members/              Members + invites
      settings/             Workspace settings + danger zone

components/
  ui/          Design-system primitives (button, input, modal, toast, …)
  layout/      Sidebar, top bars, workspace switcher, user menu
  chat/        Composer, message bubbles, citations, scope selector
  documents/   Upload modal, status badge, file icons
  workspace/   Create/invite modals

lib/
  api/         Typed client — contract.ts + real.ts (live) + config
  mock/        In-memory backend (seed.ts + mock-api.ts)
  store/       auth-store (zustand), workspace-context
  hooks/       use-async, use-documents (with live polling)
  types.ts     Domain types mirroring the backend
```

## Design notes

- **Live document status** — processing docs poll until `READY`/`FAILED` with an
  animated badge (`use-documents.ts`).
- **Streaming answers** — assistant replies reveal via a typewriter, then
  citations fade in as clickable source chips (`components/chat`).
- **Theming** — light/dark/system via `next-themes`; tokens in `globals.css`.
- **Motion** — Framer Motion micro-interactions throughout (150–300ms).
