# ContextHub AI — UI Guide & Figma Blueprint

**Version:** 1.0
**Date:** 2026-05-10
**Companion to:** `PROJECT_REQUIREMENTS.md`
**Purpose:** Complete UI specification for the MVP. Use this as the source of truth when building Figma files. Every page, state, and component in the MVP is described here.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Brand & Visual Identity](#2-brand--visual-identity)
3. [Design Tokens](#3-design-tokens)
4. [Typography](#4-typography)
5. [Iconography & Imagery](#5-iconography--imagery)
6. [Component Library](#6-component-library)
7. [Layout & App Shell](#7-layout--app-shell)
8. [Page Specifications](#8-page-specifications)
9. [Key UX Flows](#9-key-ux-flows)
10. [Empty / Loading / Error States Catalog](#10-empty--loading--error-states-catalog)
11. [Responsive Breakpoints](#11-responsive-breakpoints)
12. [Accessibility (WCAG 2.1 AA)](#12-accessibility-wcag-21-aa)
13. [Motion & Micro-interactions](#13-motion--micro-interactions)
14. [Figma File Structure](#14-figma-file-structure)
15. [Build Order for Figma](#15-build-order-for-figma)
16. [Asset Checklist](#16-asset-checklist)

---

## 1. Design Principles

ContextHub AI sits between **Notion**, **Linear**, and **ChatGPT Enterprise**. The visual language must read as: *trustworthy, fast, professional, AI-native*.

| Principle | What it means |
|---|---|
| **Content-first** | Documents and answers are the product. Chrome must never compete with content. |
| **Calm density** | Show a lot of information without feeling cluttered — Linear-style information density. |
| **Trust by citation** | Every AI answer makes its sources obvious. Citation chips are first-class UI. |
| **Predictable states** | Every async operation (upload, ingestion, chat) has a visible state — never "silent". |
| **Keyboard-first** | Power users live in `Cmd+K`. Every primary action has a shortcut. |
| **Dark mode parity** | Dark mode is not an afterthought. Both modes must ship together. |

---

## 2. Brand & Visual Identity

### Logo concept
- Wordmark: `ContextHub` in Inter Semibold + `AI` in lighter weight
- Mark: a simple geometric **hub** glyph — three connected dots forming a triangle, suggesting linked context. Square-cropped on a soft gradient background for the favicon and app icon.

### Voice & tone
- **Microcopy:** terse, plainspoken, action-first. ("Upload documents", not "Begin the document upload process".)
- **Empty states:** friendly with a clear next action. Never just "No data".
- **Errors:** describe what failed and what to do, not just an error code.
- **AI refusal:** "I couldn't find this in your documents." — calm, not apologetic.

---

## 3. Design Tokens

Use Figma **Variables** (not just styles) so light/dark switch works on a single component.

### 3.1 Color — Light mode

| Token | Hex | Usage |
|---|---|---|
| `--bg-canvas` | `#FAFAFA` | Outer page background |
| `--bg-surface` | `#FFFFFF` | Cards, modals, inputs |
| `--bg-subtle` | `#F4F4F5` | Hover rows, sidebar panels, code blocks |
| `--bg-muted` | `#E4E4E7` | Dividers between sections |
| `--border-default` | `#E4E4E7` | 1px borders |
| `--border-strong` | `#D4D4D8` | Inputs, focused borders |
| `--text-primary` | `#09090B` | Headings, primary text |
| `--text-secondary` | `#52525B` | Body text, labels |
| `--text-tertiary` | `#A1A1AA` | Hints, placeholders, timestamps |
| `--text-inverse` | `#FAFAFA` | Text on dark/colored surfaces |

### 3.2 Color — Dark mode

| Token | Hex | Usage |
|---|---|---|
| `--bg-canvas` | `#09090B` | Outer page background |
| `--bg-surface` | `#18181B` | Cards, modals, inputs |
| `--bg-subtle` | `#27272A` | Hover rows, sidebar panels |
| `--bg-muted` | `#3F3F46` | Dividers |
| `--border-default` | `#27272A` | 1px borders |
| `--border-strong` | `#3F3F46` | Inputs, focused borders |
| `--text-primary` | `#FAFAFA` | Headings |
| `--text-secondary` | `#D4D4D8` | Body |
| `--text-tertiary` | `#71717A` | Hints |

### 3.3 Brand & semantic colors (shared)

| Token | Hex | Usage |
|---|---|---|
| `--brand-500` | `#6366F1` | Primary buttons, brand accents (Indigo) |
| `--brand-600` | `#4F46E5` | Hover state |
| `--brand-100` | `#E0E7FF` | Citation chips background, subtle brand fills |
| `--brand-50` | `#EEF2FF` | Hover backgrounds for brand items |
| `--success-500` | `#10B981` | READY status, success toasts |
| `--success-100` | `#D1FAE5` | Success badge bg |
| `--warning-500` | `#F59E0B` | PARSING/CHUNKING/EMBEDDING in-progress |
| `--warning-100` | `#FEF3C7` | Warning bg |
| `--danger-500` | `#EF4444` | FAILED, destructive actions |
| `--danger-100` | `#FEE2E2` | Danger bg |
| `--info-500` | `#0EA5E9` | Info banners, "did you know" hints |

### 3.4 Spacing scale (4px base)

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96`

Use names: `space-1` (4) through `space-24` (96). The most-used values are `space-2` (8), `space-3` (12), `space-4` (16), `space-6` (24).

### 3.5 Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 4px | Badges, tags, citation chips |
| `radius-md` | 8px | Buttons, inputs, dropdowns |
| `radius-lg` | 12px | Cards, modals |
| `radius-xl` | 16px | Hero panels, marketing surfaces |
| `radius-full` | 9999px | Avatars, pills |

### 3.6 Shadows (light mode)

| Token | Value |
|---|---|
| `shadow-xs` | `0 1px 2px rgba(9,9,11,0.04)` |
| `shadow-sm` | `0 1px 3px rgba(9,9,11,0.08), 0 1px 2px rgba(9,9,11,0.04)` |
| `shadow-md` | `0 4px 12px rgba(9,9,11,0.08)` (cards on hover, dropdowns) |
| `shadow-lg` | `0 12px 32px rgba(9,9,11,0.12)` (modals, popovers) |
| `shadow-focus` | `0 0 0 3px rgba(99,102,241,0.32)` (focus ring) |

In dark mode, shadows become almost invisible — rely on borders + `--bg-subtle` instead.

---

## 4. Typography

**Primary font:** Inter (Variable). **Mono font:** JetBrains Mono (for code, chunk IDs, file names in source viewer).

| Token | Size / Line height | Weight | Usage |
|---|---|---|---|
| `display` | 48 / 56 | 600 | Landing hero only |
| `h1` | 32 / 40 | 600 | Page titles (Workspace home, Settings) |
| `h2` | 24 / 32 | 600 | Section titles |
| `h3` | 20 / 28 | 600 | Card titles, modal titles |
| `h4` | 16 / 24 | 600 | List headers, small section titles |
| `body-lg` | 16 / 24 | 400 | Chat messages, primary reading text |
| `body` | 14 / 20 | 400 | Default body, table cells, form labels |
| `body-sm` | 13 / 18 | 400 | Secondary text, breadcrumbs |
| `caption` | 12 / 16 | 500 | Badges, timestamps, citation chips |
| `code` | 13 / 20 | 500 (mono) | Inline code, chunk IDs |
| `code-block` | 13 / 20 | 400 (mono) | Multi-line code in source viewer |

**Headings always use `--text-primary`. Body defaults to `--text-secondary`.** Don't bold body text for emphasis — use color shift to primary instead.

---

## 5. Iconography & Imagery

- **Icon set:** Lucide (matches shadcn/ui). 20px default, 16px in dense rows, 24px in nav.
- **Stroke weight:** 1.5px (Lucide default).
- **Icon color:** inherits `currentColor` so it picks up text color tokens.
- **File-type icons:** custom set for `.pdf`, `.md`, `.txt`, `.docx`, `.csv`, `.code` (generic). Each is a rounded square with a colored top-left corner — PDF=red, MD=indigo, TXT=zinc, DOCX=blue, CSV=green, code=violet.
- **Avatars:** initials on a deterministic colored gradient (hash of user ID). Always circular.
- **Illustrations:** for empty states, use simple geometric line illustrations on `--bg-subtle`. No stock photography.

---

## 6. Component Library

Each component below should be a **Figma component with variants** so the dev team can map it 1:1 to shadcn/ui.

### 6.1 Buttons

**Variants:** `primary`, `secondary`, `ghost`, `outline`, `destructive`, `link`
**Sizes:** `sm` (32h), `md` (36h), `lg` (40h), `icon` (square)
**States:** default, hover, active, focused (visible focus ring), disabled, loading (spinner replaces label)

```
Primary:    bg=brand-500    text=white       hover=brand-600
Secondary:  bg=bg-subtle    text=primary     hover=bg-muted
Ghost:      bg=transparent  text=secondary   hover=bg-subtle
Outline:    bg=transparent  border=strong    hover=bg-subtle
Destructive bg=danger-500   text=white       hover=danger-600
Link:       bg=none         text=brand-500   hover=brand-600 underline
```

Loading state shows a 16px spinner left of label; label dims to 50% opacity. Disabled = 50% opacity, no hover.

### 6.2 Inputs

- **Text input:** 36h, 12px horizontal padding, 1px border `--border-strong`, 8px radius. Focus ring: 3px `--brand-500/32%`.
- **Textarea:** auto-grow up to 8 rows, then scrollable. Used in chat composer.
- **Select / Combobox:** same height as input; chevron right; popover with searchable list.
- **Checkbox & Radio:** 16px square, brand-500 fill when checked.
- **Switch:** 36×20, brand-500 when on.
- **Slider:** for `top-k` and `temperature` in admin settings.

All inputs have:
- Label (above, body-sm, primary)
- Optional helper text (below, caption, tertiary)
- Error state: border `--danger-500`, helper text becomes danger

### 6.3 Cards

Three card variants:
- **Plain card:** `bg-surface`, 1px `border-default`, `radius-lg`, `space-6` padding
- **Hoverable card:** plain + `shadow-sm` on hover, cursor pointer (used for chat list, document grid)
- **Stat card:** plain + larger numeric, used in admin dashboard

### 6.4 Badges & Pills

| Variant | Use |
|---|---|
| `neutral` | Default tag |
| `brand` | Active workspace, "AI" labels |
| `success` | `READY`, "Indexed" |
| `warning` | `PARSING / CHUNKING / EMBEDDING` (with mini spinner) |
| `danger` | `FAILED` |
| `info` | `UPLOADED` (queued) |
| `outline` | Role badges (Owner/Admin/Member) |

Size: 20h, `radius-sm`, caption text.

### 6.5 Citation chip (custom, important)

A small inline pill that appears inside AI chat messages.

```
[1]  ← circular brand-100 bg, brand-600 text, mono, 11px
```

- Hover: shows a 320px popover with `{ document name, page, snippet (3 lines), score }` and a "Open source" link.
- Click: opens the **Source Viewer** side panel scrolled to the chunk.
- Numbers count up across a single message ([1], [2], [3] …).

### 6.6 Avatar

- Sizes: `xs` (20), `sm` (24), `md` (32), `lg` (40), `xl` (64)
- Stack variant: overlapping avatars with a `+N` overflow chip (used in member previews)

### 6.7 Tooltip / Popover / Dropdown menu

- **Tooltip:** dark surface, white text, 200ms delay, 12px caption. Used everywhere on icon-only buttons.
- **Dropdown menu:** 200–240px wide, 8px padding, 4px radius items, separators between groups, keyboard navigable.
- **Popover:** larger than tooltip, can contain interactive content (citation preview, member quick-view).

### 6.8 Modal / Dialog

- 480px wide (default), 600px (medium), 800px (large for upload).
- Header: title + close X.
- Body: `space-6` padding.
- Footer: right-aligned actions, secondary on the left.
- Backdrop: `rgba(9,9,11,0.5)` light / `rgba(0,0,0,0.7)` dark.
- Animation: fade + scale-up from 96% (180ms ease-out).

### 6.9 Toast / Notification

- Top-right stack, 360px wide, auto-dismiss after 5s (errors persist).
- Icon (left) + title + optional description + close (right).
- Variants: success (emerald), error (rose), info (sky), warning (amber).

### 6.10 Tabs

Two variants:
- **Underline tabs:** for in-page navigation (Settings tabs)
- **Segment tabs:** pill group on `--bg-subtle` (filters in document list)

### 6.11 Table

- Row height: 48px.
- Header: `body-sm` 600 weight, `--text-tertiary`, sticky on scroll.
- Hover: `--bg-subtle`.
- Selected row: `--brand-50`.
- Columns: sortable (chevron icon next to header), filterable (filter icon).
- Empty row: shown if a workspace has 0 docs.

### 6.12 File row & file grid card

Two display modes for documents:
- **Grid card** (220×180): file-type icon (large), filename (2 lines clamped), status pill, last-updated time.
- **List row** (full width, 56h): icon, filename, collection, uploader avatar, size, status pill, kebab menu.

### 6.13 Progress

- **Linear:** for upload progress per file (4h, full width of row, brand-500 fill).
- **Circular:** for ingestion stages (24px, with stage label below).
- **Indeterminate shimmer:** skeleton loaders.

### 6.14 Command palette (`Cmd+K`)

A modal overlay (640w × auto) with:
- Search input (autofocus)
- Grouped results: Pages · Documents · Chats · Actions
- Keyboard nav, Enter to execute
- Recent items at top when query is empty

### 6.15 Skeleton loaders

For each major content type, define a skeleton variant:
- Chat message skeleton (3 rows of varying widths)
- Document grid card skeleton
- Member row skeleton
- Source viewer skeleton

---

## 7. Layout & App Shell

The authenticated app uses a **two-pane layout**: persistent sidebar (left) + main content (right). Some pages overlay a third pane (Source Viewer) on the right.

### 7.1 Sidebar (persistent)

**Width:** 260px (collapsible to 64px icons-only).

```
┌──────────────────────────┐
│ [Logo] ContextHub AI ▼   │  ← Workspace switcher (click for dropdown)
├──────────────────────────┤
│ ⌘K  Search…              │  ← Cmd+K trigger button
├──────────────────────────┤
│ 🏠  Home                 │
│ 💬  Chats           [+]  │
│ 📁  Collections     [+]  │
│ 🔍  Search               │
│ 📄  All Documents        │
├──────────────────────────┤
│ Recent chats             │  ← scrollable
│  • Onboarding Q&A        │
│  • API design RFC        │
│  • Pricing memo          │
│  ...                     │
├──────────────────────────┤
│ ⚙️  Settings             │
│ [Avatar] John Doe ▼      │  ← user menu
└──────────────────────────┘
```

Sidebar items: 36h, 12px radius on hover, brand-50 bg + brand-600 text when active.

### 7.2 Top bar (per page)

Top bar sits inside the main content pane, not above the sidebar. Height: 56px. Contains:
- Breadcrumb (left): `Workspace › Collection › Document.pdf`
- Page-specific actions (right): primary CTA, kebab menu, view toggles

### 7.3 Source Viewer side panel

Slides in from the right when a citation is clicked. Width: 480px (resizable down to 360, up to 720). Pushes main content left or overlays it on tablet/mobile.

```
┌──────────────────┬────────────────┐
│                  │ handbook.pdf   │
│   Chat / Page    │ Page 4 of 28 ✕ │
│                  ├────────────────┤
│                  │ [PDF render]   │
│                  │  ...           │
│                  │  ▓▓▓▓▓▓▓▓ ←   │
│                  │  highlighted   │
│                  │  ...           │
└──────────────────┴────────────────┘
```

---

## 8. Page Specifications

For each page below: **Goal · Wireframe · Components · States · Behavior · Responsive notes.**

### 8.1 Landing page (`/`)

**Goal:** convert visitors to register. One scroll-length, marketing-style.

```
┌──────────────────────────────────────────────────┐
│ [Logo]              Features  Pricing   Login  Sign up │
├──────────────────────────────────────────────────┤
│                                                  │
│        Your team's knowledge,                    │
│        answered.                                 │
│                                                  │
│   Upload your docs. Ask anything.                │
│   Get cited answers in seconds.                  │
│                                                  │
│        [ Start free → ]   [ Watch demo ]         │
│                                                  │
│        [ Hero illustration: chat + citation ]    │
│                                                  │
├──────────────────────────────────────────────────┤
│   3-up feature row:                              │
│   📥 Upload anything   🔎 Semantic search   💬 Chat with citations │
├──────────────────────────────────────────────────┤
│   "How it works" — 4 steps with icons            │
├──────────────────────────────────────────────────┤
│   Logos strip (placeholder for future)           │
├──────────────────────────────────────────────────┤
│   FAQ accordion                                  │
├──────────────────────────────────────────────────┤
│   CTA repeat + Footer                            │
└──────────────────────────────────────────────────┘
```

**Components:** marketing nav, hero, feature card (3×), step row (4×), FAQ accordion, footer.
**States:** default only. Mobile: nav collapses to hamburger.

### 8.2 Login (`/login`)

**Goal:** authenticate existing user.

```
┌─────────────────────────────────────┐
│                                     │
│           [Logo + name]             │
│                                     │
│         Welcome back                │
│   Sign in to your workspace         │
│                                     │
│   ┌─────────────────────────────┐   │
│   │ Email                       │   │
│   ├─────────────────────────────┤   │
│   │ Password         👁         │   │
│   └─────────────────────────────┘   │
│                                     │
│   [ Sign in →            ]          │
│                                     │
│   Forgot password?                  │
│                                     │
│   ─── or ───                        │
│   (post-MVP: SSO buttons)           │
│                                     │
│   No account? Sign up               │
│                                     │
└─────────────────────────────────────┘
```

**Centered card** (400w) on `--bg-canvas`. **States:** default, loading (button spinner), error (red banner above form: "Invalid email or password").

### 8.3 Register (`/register`)

Same layout as Login. Fields: Name · Email · Password (with strength meter) · Confirm password · "I accept terms" checkbox.

**States:** default, loading, field-level errors (under each input), success → redirect.

### 8.4 Forgot password (`/forgot-password`)

Same layout. Single email field → submit → success state replaces form: "Check your inbox at john@…" with "Resend" link (60s cooldown).

### 8.5 Workspace switcher / first-run (`/`)

**Goal:** pick a workspace, or create the first one.

```
┌────────────────────────────────────────────────┐
│  [Logo]  ContextHub AI                  [Avatar ▼] │
├────────────────────────────────────────────────┤
│                                                │
│              Your workspaces                   │
│                                                │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│   │ Acme Co  │  │ Side proj│  │  +       │    │
│   │ 12 docs  │  │ 3 docs   │  │ Create   │    │
│   │ Owner    │  │ Member   │  │ workspace│    │
│   └──────────┘  └──────────┘  └──────────┘    │
│                                                │
│   Recent chats across workspaces (optional)    │
│                                                │
└────────────────────────────────────────────────┘
```

**States:**
- **Empty (first-run):** large illustration + "Create your first workspace" CTA centered.
- **Populated:** grid of workspace cards.
- **Create modal:** name + slug (auto-derived, editable) + description (optional) → Create.

### 8.6 Workspace home (`/w/[slug]`)

**Goal:** quick access to recent activity + jump-off points.

```
┌──────────┬────────────────────────────────────────────┐
│          │ Acme Co                          [Cmd+K]   │
│ SIDEBAR  ├────────────────────────────────────────────┤
│          │                                            │
│          │ Welcome back, John 👋  (no emoji unless asked)│
│          │                                            │
│          │ ┌──────────────────────────────────────┐  │
│          │ │ Ask anything…                   [→]  │  │
│          │ └──────────────────────────────────────┘  │
│          │ Suggestions: "Summarize the Q3 plan",     │
│          │ "What's our deploy process?"              │
│          │                                            │
│          │ ── Recent chats ────────────── See all →   │
│          │ [chat card] [chat card] [chat card]        │
│          │                                            │
│          │ ── Collections ────────────── New +        │
│          │ [collection card] [collection card] [+]    │
│          │                                            │
│          │ ── Recently uploaded ────── See all →      │
│          │ [doc row] [doc row] [doc row]              │
│          │                                            │
└──────────┴────────────────────────────────────────────┘
```

**Components:** Quick-ask bar (large input → starts a new chat), chat cards (title, last message preview, time), collection cards (name, doc count, avatar stack of contributors), doc rows.

**States:**
- **Empty:** all three sections show empty states with illustrations: "No chats yet — Ask your first question", "No collections — Create one to organize docs", "No documents — Upload to get started".

### 8.7 Collection detail (`/w/[slug]/collections/[id]`)

**Goal:** browse, upload, and manage documents in a collection.

```
┌──────────┬────────────────────────────────────────────┐
│          │ Acme › Engineering Docs              [Chat]│
│ SIDEBAR  ├────────────────────────────────────────────┤
│          │ [Search docs…]  [Filter: all ▼] [Grid|List]│
│          │                                            │
│          │ ┌──── Drag-and-drop zone (visible at top) ──┐ │
│          │ │  ⬆  Drop files here, or click to browse  │ │
│          │ │  PDF · MD · TXT · DOCX · code   ≤ 25MB    │ │
│          │ └────────────────────────────────────────────┘ │
│          │                                            │
│          │ Documents (24)                             │
│          │ [card] [card] [card] [card]                │
│          │ [card] [card] [card] [card]                │
│          │ ...                                        │
│          │                                            │
└──────────┴────────────────────────────────────────────┘
```

**Components:** breadcrumb, search-in-collection, view toggle (grid/list), upload zone, doc cards with status pill, kebab (Re-index, Move, Delete).

**States:**
- **Empty collection:** large dropzone centered with illustration + "Upload your first document".
- **Uploading:** dropzone replaced with upload progress list (one row per file with progress bar + status: Uploading / Parsing / Chunking / Embedding / Ready). Failed files show error pill + Retry button.
- **Filtered:** if no results, show "No docs match this filter" with Reset button.

### 8.8 Document viewer (`/w/[slug]/documents/[id]`)

**Goal:** read the full document, see chunks, jump to a citation.

Two layouts depending on file type:

**PDF layout:**
```
┌──────────┬────────────────────────────────────────────┐
│ SIDEBAR  │ handbook.pdf                  [Chat] [⋯]   │
│          ├────────────────┬───────────────────────────┤
│          │ Outline        │ [Page 1 / 28]  Zoom: 100%│
│          │ • Intro        │ ┌───────────────────────┐│
│          │ • Engineering  │ │                       ││
│          │ • HR           │ │   PDF page render     ││
│          │ • ...          │ │                       ││
│          │                │ │   ▓▓▓ chunk highlight ││
│          │ Chunks (142)   │ │                       ││
│          │ #abc123 p.1    │ │                       ││
│          │ #def456 p.2    │ └───────────────────────┘│
│          │ ...            │ ◀ Page nav ▶              │
└──────────┴────────────────┴───────────────────────────┘
```

**Markdown / text / code layout:** same shell, but center pane uses `react-markdown` (or syntax-highlighted code) and the chunk list highlights the active range.

**States:**
- **Loading:** skeleton on both panes.
- **Failed extraction:** banner: "We couldn't extract text from this file. [Re-index]".
- **No chunks yet (still indexing):** banner with progress.

### 8.9 Chat / new conversation (`/w/[slug]/chat`)

**Goal:** start a new chat. Empty conversation with composer.

```
┌──────────┬────────────────────────────────────────────┐
│ SIDEBAR  │ New chat                       [Scope: ▼]  │
│          ├────────────────────────────────────────────┤
│          │                                            │
│          │           [ Mark / illustration ]          │
│          │                                            │
│          │       Ask anything about your docs         │
│          │                                            │
│          │   Suggested prompts (chips):               │
│          │   • Summarize the latest RFC               │
│          │   • What's our refund policy?              │
│          │   • Show the deploy steps                  │
│          │                                            │
│          ├────────────────────────────────────────────┤
│          │ ┌────────────────────────────────────────┐ │
│          │ │ Type a question…                  [↑] │ │
│          │ └────────────────────────────────────────┘ │
│          │ Scope: All collections  ·  Model: gpt-4o-mini│
└──────────┴────────────────────────────────────────────┘
```

**Components:** scope dropdown (All collections / specific), suggested-prompt chips, composer (auto-grow textarea, send button, attachment is post-MVP).

**Composer behaviors:**
- Enter sends; Shift+Enter newline
- Disabled while streaming, "Stop" button replaces send
- Shows the model name + scope as a quiet caption beneath

### 8.10 Conversation (`/w/[slug]/chat/[conversationId]`)

**Goal:** the active chat — the most important page.

```
┌──────────┬────────────────────────────────────────────┐
│ SIDEBAR  │ Onboarding Q&A         [📌 Pin] [✎] [⋯]    │
│          ├────────────────────────────────────────────┤
│          │ ┌────────────────────────────────────────┐ │
│          │ │ ◯  How do I provision a new env?       │ │
│          │ │                                Just now│ │
│          │ └────────────────────────────────────────┘ │
│          │ ┌────────────────────────────────────────┐ │
│          │ │ ✦ ContextHub AI                        │ │
│          │ │                                        │ │
│          │ │  Use the `infra/provision.sh` script,  │ │
│          │ │  passing the env name [1]. Make sure   │ │
│          │ │  AWS creds are loaded [2].             │ │
│          │ │                                        │ │
│          │ │  Sources:                              │ │
│          │ │  [1] runbook.md p.3                    │ │
│          │ │  [2] aws-setup.md                      │ │
│          │ │                                        │ │
│          │ │  [👍] [👎] [Copy] [Regenerate]         │ │
│          │ └────────────────────────────────────────┘ │
│          │ ...                                        │
│          ├────────────────────────────────────────────┤
│          │ [composer same as 8.9]                     │
└──────────┴────────────────────────────────────────────┘
```

**Message bubble specs:**
- **User message:** right-aligned, `--bg-brand-50` (light) / `--bg-subtle` (dark), max-width 720px, `radius-lg`, `space-4` padding.
- **AI message:** left-aligned, no bg (full width readable text), avatar = small AI mark.
- **Citation chips** rendered inline as `[1]` `[2]`, with a "Sources:" footer that lists each chip with doc name + page.

**States:**
- **Streaming:** "✦ thinking…" with three animated dots before first token. As tokens arrive, the avatar shows a pulsing ring. Stop button shown in composer.
- **Refusal:** AI message body becomes: *"I couldn't find this in your documents."* with a muted info icon and a CTA: "Try rephrasing or upload more docs".
- **Error:** red banner under the failed message: "Something went wrong. [Retry]".
- **Empty (just opened convo with messages):** scrolled to bottom, last message visible.

**Header actions:** rename (inline edit), pin (toggle), kebab → Delete · Export · Change scope.

### 8.11 Search (`/w/[slug]/search`)

**Goal:** semantic + keyword search across the workspace, independent of chat.

```
┌──────────┬────────────────────────────────────────────┐
│ SIDEBAR  │ Search                                     │
│          ├────────────────────────────────────────────┤
│          │ ┌────────────────────────────────────────┐ │
│          │ │ 🔍 Search documents…              [↵]  │ │
│          │ └────────────────────────────────────────┘ │
│          │ Filters: [Collection ▼] [Type ▼] [Date ▼]  │
│          │                                            │
│          │ 142 results · 0.18s                        │
│          │ ┌────────────────────────────────────────┐ │
│          │ │ runbook.md  · Engineering · p.3   0.92 │ │
│          │ │ "...the provision.sh script supports   │ │
│          │ │  --env flag for staging / production…" │ │
│          │ │ [Open source] [Ask about this]         │ │
│          │ └────────────────────────────────────────┘ │
│          │ ...                                        │
└──────────┴────────────────────────────────────────────┘
```

**Components:** search input (full width), filter row, result row (file name, collection, page, score, snippet with query terms highlighted, two action buttons).

**States:**
- **Empty (no query):** show "Try semantic search" hint + recent searches.
- **No results:** illustration + "No matches. Try broader terms."
- **Loading:** skeleton rows.

### 8.12 Settings (`/w/[slug]/settings`)

**Goal:** workspace admin — tabbed page.

```
┌──────────┬────────────────────────────────────────────┐
│ SIDEBAR  │ Settings                                   │
│          ├────────────────────────────────────────────┤
│          │ [General] [Members] [AI] [Usage] [Danger]  │  ← Underline tabs
│          ├────────────────────────────────────────────┤
│          │ (tab content)                              │
└──────────┴────────────────────────────────────────────┘
```

**Tab: General**
- Workspace name (editable, save on blur)
- Slug (editable, with availability check)
- Description (textarea)
- Workspace avatar/initial color
- Default model (Select: gpt-4o-mini / llama3 / mistral)
- Default top-k (Slider, 1–20, default 8)

**Tab: Members**
- Invite row: email input + role select + Invite button
- Pending invites table: email · role · status · resend · revoke
- Members table: avatar · name · email · role (editable for Owner) · joined date · kebab (Remove)
- Empty state: "Invite your first teammate"

**Tab: AI**
- Model selector
- Embedding model (read-only display, dev info)
- Confidence threshold slider (refusal cutoff)
- "Enable reranker" switch (post-MVP — show as disabled with "Coming soon")

**Tab: Usage** (Owner/Admin only)
```
[Stat: Documents] [Stat: Chats] [Stat: Members] [Stat: Storage]
[Chart: chats over last 30 days — line]
[Chart: storage used over time — area]
[Table: recent jobs — type, status, duration, error]
```

**Tab: Danger zone**
- Card: Delete workspace — red outline, "This permanently deletes …" + button (opens confirm modal that asks the user to type the workspace name).

### 8.13 User profile menu

Triggered from the avatar in the sidebar. Dropdown menu items:
- View profile
- Account settings
- Theme: Light / Dark / System (radio)
- Help & docs
- Log out

### 8.14 Account settings (`/account`)

Cross-workspace settings (separate from workspace settings).

Sections (single-page, anchored):
- Profile (name, email — read-only with "Change email" link, avatar upload)
- Password (change password form)
- Sessions (active devices, revoke)
- Danger zone (Delete account)

---

## 9. Key UX Flows

These flows must be storyboarded in Figma — one frame per step.

### 9.1 Upload → indexing flow

1. User drags 3 PDFs into the upload zone.
2. Zone transforms into upload list with 3 rows. Each row: file icon + name + size + linear progress (0–100%).
3. Upload completes → progress bar fills, status pill switches to `UPLOADED → PARSING → CHUNKING → EMBEDDING → READY` (animated through stages, 2–60s typical).
4. On `READY`: green check appears, row collapses into the document grid.
5. On `FAILED`: red pill, error tooltip on hover, Retry button visible.

**Key states to design:** queued, uploading, parsing, chunking, embedding, ready, failed.

### 9.2 Chat with citation flow

1. User types question, presses Enter.
2. Their message appears immediately (right-aligned).
3. AI message bubble appears with "✦ thinking…" indicator (~1–3s).
4. Tokens stream in, left-aligned, monospace caret blinking at the tail.
5. As streaming completes, citation chips `[1]`, `[2]` appear inline; "Sources:" footer renders.
6. User hovers `[1]` → popover shows snippet + score.
7. User clicks `[1]` → Source Viewer slides in from the right with PDF scrolled to page, chunk highlighted in `--brand-100`.
8. User can close source viewer (X) or jump to next citation (↓).

### 9.3 First-run experience

1. After register → `/` workspace page is empty.
2. Modal opens automatically: "Create your first workspace" — name + description.
3. Submit → redirected to `/w/[slug]` with a checklist card:
   - [ ] Upload your first document
   - [ ] Try asking a question
   - [ ] Invite a teammate
4. Each completed item checks off. Card auto-dismisses when all 3 are done (or user X's it).

### 9.4 Member invite flow

1. Settings → Members tab → enter email + select role → Invite.
2. Toast: "Invitation sent to email@…".
3. Invitee receives email → clicks link → lands on `/register?invite=…` with workspace pre-filled.
4. After register → auto-joined to workspace, lands on workspace home with welcome toast.

### 9.5 Source viewer flow

Source viewer can be triggered from:
- Citation chip in chat
- "Open source" in search results
- "View" on a document grid card

Behavior is the same: slide in from right (480w), pushes content. Clicking outside the panel does **not** close it (prevents losing context). Only the X button or `Esc` closes.

---

## 10. Empty / Loading / Error States Catalog

Every page that fetches data needs **all four** states designed:

| State | When | Treatment |
|---|---|---|
| **Empty** | No data exists | Illustration + headline + CTA button |
| **Loading** | Initial fetch | Skeleton matching final layout (not a spinner) |
| **Error** | Fetch failed | Card with error icon + plain-language message + Retry |
| **Populated** | Data present | Final design |

**Specific empty states to design:**

| Page | Empty headline | CTA |
|---|---|---|
| Workspace list | "No workspaces yet" | Create workspace |
| Workspace home — chats | "No chats yet" | Ask your first question |
| Workspace home — collections | "No collections yet" | Create collection |
| Workspace home — docs | "No documents yet" | Upload documents |
| Collection | "This collection is empty" | Drag files or click to upload |
| Chat list | "No conversations" | Start chatting |
| Search | "Try semantic search" | (suggested queries) |
| Search — no results | "No matches" | Broaden filters |
| Members | "Just you for now" | Invite a teammate |
| Document viewer — bad PDF | "We couldn't extract text" | Re-index |
| Refusal in chat | "I couldn't find this in your documents." | Try rephrasing / Upload more |

---

## 11. Responsive Breakpoints

| Breakpoint | Width | Behavior |
|---|---|---|
| `mobile` | < 640px | Sidebar collapses to bottom nav (Home · Chat · Search · Settings). Source viewer becomes full-screen overlay. Chat composer stays bottom-fixed. |
| `tablet` | 640–1024 | Sidebar collapses to icons-only by default, expandable. Source viewer overlays content (not push). |
| `desktop` | 1024–1440 | Default layout. Sidebar 260w. |
| `wide` | > 1440 | Max content width 1200px centered; sidebar stays 260w; chat width caps at 880px for readability. |

**Mobile-specific frames to design:**
- Workspace home (mobile)
- Chat (mobile, with bottom-fixed composer)
- Document viewer (mobile, full-screen)
- Source viewer (mobile, full-screen sheet sliding up)
- Settings (mobile, tabs become a select)

---

## 12. Accessibility (WCAG 2.1 AA)

- **Contrast:** all text against background ≥ 4.5:1; UI elements ≥ 3:1. The brand-500 + white passes; brand-500 + bg-canvas does not — use brand-600 for text on light bg.
- **Focus states:** visible 3px focus ring (brand-500 at 32% opacity) on every interactive element. Don't `outline: none` without a replacement.
- **Keyboard:** every action reachable via Tab; modals trap focus; `Esc` closes overlays.
- **ARIA:** chat messages have `role="log" aria-live="polite"` so screen readers announce streaming. Citation chips have aria-label "Source 1, page 4 of handbook.pdf".
- **Reduced motion:** respect `prefers-reduced-motion` — disable streaming caret animation, use instant transitions.
- **Color is never the only signal** — status pills always pair color + text + icon.

---

## 13. Motion & Micro-interactions

| Interaction | Duration | Easing |
|---|---|---|
| Hover on button | 120ms | ease-out |
| Modal open | 180ms | ease-out (fade + scale 96→100) |
| Toast slide-in | 220ms | ease-out (translate from right) |
| Source viewer slide-in | 280ms | ease-in-out |
| Chat token stream | per-token | linear (no animation, just append) |
| Streaming caret | 800ms | infinite blink |
| Citation chip hover popover | 120ms after 200ms delay | ease-out |
| Status pill stage transition | 240ms | ease-in-out (color crossfade) |

**Don't animate:** route changes (instant), data updates within tables (instant), text content swaps.

---

## 14. Figma File Structure

Suggested file/page split:

```
ContextHub AI — Design System          ← Figma file 1
├── 📄 Cover
├── 📄 Foundations
│   ├── Colors (light + dark variables)
│   ├── Typography
│   ├── Spacing & Radius
│   ├── Shadows
│   └── Iconography
├── 📄 Components
│   ├── Buttons
│   ├── Inputs
│   ├── Cards
│   ├── Badges & Citation chips
│   ├── Avatars
│   ├── Tooltips/Popovers/Menus
│   ├── Modals & Toasts
│   ├── Tabs & Tables
│   ├── File rows & cards
│   └── Skeletons
└── 📄 Patterns
    ├── App shell (sidebar + topbar)
    ├── Source viewer panel
    ├── Composer
    └── Empty/Error/Loading templates

ContextHub AI — Pages                  ← Figma file 2
├── 📄 Cover + flow map
├── 📄 Marketing
│   └── Landing
├── 📄 Auth
│   ├── Login · Register · Forgot
├── 📄 Onboarding
│   ├── Workspace switcher · Create workspace · First-run checklist
├── 📄 Workspace
│   ├── Home (empty + populated)
│   ├── Collections list (empty + populated)
│   ├── Collection detail (empty + uploading + populated)
│   └── All Documents
├── 📄 Document Viewer
│   ├── PDF · Markdown · Text · Code
├── 📄 Chat
│   ├── New chat · Conversation · Streaming · Refusal · Error · With source viewer open
├── 📄 Search
│   ├── Empty · Results · No results
├── 📄 Settings
│   ├── General · Members · AI · Usage · Danger
├── 📄 Account
└── 📄 Mobile
    └── (key mobile frames)

ContextHub AI — Prototypes             ← Figma file 3 (optional, can live in file 2)
├── 📄 Upload → indexing flow
├── 📄 Chat with citation flow
├── 📄 First-run flow
└── 📄 Invite member flow
```

**Naming conventions:**
- Frames: `Page name / State` (e.g., `Collection / Empty`, `Chat / Streaming`)
- Components: `Component / Variant / State` (e.g., `Button / Primary / Hover`)
- Use Figma Variables for colors, spacing, radius — switch light/dark with one click.

---

## 15. Build Order for Figma

Designing in this order keeps blockers minimal:

1. **Foundations file** — Color variables (light + dark), typography styles, spacing/radius/shadow tokens.
2. **Iconography** — Import Lucide, define file-type icons.
3. **Atomic components** — Button, Input, Badge, Avatar, Tooltip.
4. **Molecule components** — Card, File row, Citation chip, Status pill, Composer, Member row.
5. **Patterns** — Sidebar, Topbar, Source viewer, Modal templates.
6. **App shell skeleton** — Empty authenticated layout (sidebar + main area).
7. **Auth pages** — Login, Register, Forgot (quickest to ship, validates type/spacing tokens).
8. **Workspace home + Collection** — proves the file rendering + empty states.
9. **Chat** — the biggest page; do new-chat, populated, streaming, refusal, error states.
10. **Source viewer** — pair with chat (citation flow).
11. **Search** — reuses chat patterns.
12. **Settings** — tabbed page, smaller scope.
13. **Marketing landing** — last; least likely to change other patterns.
14. **Mobile frames** — derive from desktop after desktop is approved.
15. **Prototype connections** — link key flows for the dev handoff.

---

## 16. Asset Checklist

**Logos & marks**
- [ ] Wordmark (light + dark)
- [ ] Mark only (square, for app icon)
- [ ] Favicon (32 + 16)
- [ ] OpenGraph image (1200×630)

**Illustrations** (one consistent line-style)
- [ ] Empty workspace
- [ ] Empty chats
- [ ] Empty collections
- [ ] Empty documents
- [ ] Search no-results
- [ ] Refusal / "couldn't find this"
- [ ] Error 404 / 500
- [ ] First-run welcome

**Icons**
- [ ] Standard Lucide set (use library)
- [ ] File type icons: PDF, MD, TXT, DOCX, CSV, code (generic), image (post-MVP)
- [ ] AI mark (for assistant avatar)

**Screenshots / dummy content**
- [ ] 5–10 realistic chat conversations (varying lengths, with citations)
- [ ] 3 sample PDFs to render in document viewer mockups
- [ ] 1 markdown file
- [ ] 1 code file (TypeScript)

---

## Notes for the developer handoff

When the Figma is ready, the developer should be able to derive:

- **Tailwind config** directly from Section 3 (colors, spacing, radius, shadows).
- **shadcn/ui theme** from Section 3 + Section 6.
- **Component props** from each variant defined in Section 6 (e.g., `<Button variant="primary" size="md" />`).
- **Page routes** match the URL paths in Section 8 — this is intentional and matches `PROJECT_REQUIREMENTS.md` Section 13.
- **State logic** — every page calls out its empty/loading/error/populated states, which map directly to TanStack Query states.

Keep this document and the Figma in sync. When a component changes, update both.

---

**Document owner:** info@healplace.com
**Companion documents:** `PROJECT_REQUIREMENTS.md` (functional spec)
**Status:** Ready for Figma kickoff
