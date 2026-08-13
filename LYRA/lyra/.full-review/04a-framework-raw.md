# Step 4A — Framework & Language Best Practices (raw agent output)

# Framework, Language & Dependency Review — LYRA (2026-08-13)

Scope: `app/`, `components/`, `services/`, `workers/`, `lib/`, `prisma/schema.prisma`. Stack confirmed: Next.js `^16.3.0` (App Router), React `19.2.4`, TypeScript `^5`, Tailwind `^4`, Prisma `^6.19.3`, BullMQ `^5.76.8`, Zod `^4.4.3`.

## Summary

The codebase is written in clean, modern TypeScript with no legacy-React or Pages-Router residue, and several things are done well. The two real gaps are: (1) the App Router's request-lifecycle conventions — `error.tsx`, `loading.tsx`, `not-found.tsx`, `<Suspense>` — are entirely unused across the whole tree, and a meaningful slice of pages fetch data client-side with `useEffect` instead of using Server Components; and (2) several dependencies, including the Anthropic SDK the product's core AI features run on, are materially behind latest.

| # | Finding | Severity |
|---|---|---|
| 1 | No `error.tsx`/`loading.tsx`/`not-found.tsx`/`<Suspense>` anywhere in `app/` | High |
| 2 | Full page components fetch data via `useEffect`+`fetch` instead of Server Components | Medium |
| 3 | Dependencies materially behind latest, including `@anthropic-ai/sdk` and `@auth0/nextjs-auth0` | Medium |
| 4 | Deprecated `unstable_noStore` + redundant triple dynamic-opt-out in one route | Low |
| 5 | React 19's `useActionState`/`useTransition` unused; manual loading-state boilerplate instead | Low |
| 6 | No `viewport` export in root layout | Low |

## 1. No error/loading/not-found boundaries or Suspense anywhere — High

Zero `error.tsx`, zero `loading.tsx`, zero `not-found.tsx`, zero `<Suspense>` boundaries anywhere in `app/` (28 `page.tsx` files, dozens of route segments). Without them: a thrown error in any Server Component crashes the entire route to Next's default unstyled error screen instead of a scoped boundary; every navigation is all-or-nothing (nothing streams progressively, so a route doing multiple sequential Prisma calls blocks the full page paint); a bad `workspaceId` falls through to a generic 404 instead of a routed `not-found.tsx`.

**Recommendation:** at minimum add root-level `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, and `app/(dashboard)/loading.tsx`, then push `loading.tsx`/`error.tsx` into the heavier route segments (brand, settings, analytics) that do multiple sequential DB round-trips server-side.

## 2. Full pages doing client-side `useEffect`+`fetch` instead of Server Components — Medium

16 components/pages use `useEffect`+`fetch()` for initial data load, including whole page-level components (e.g. the competitors page is fully `'use client'`, fetches on mount, hand-rolls a loading skeleton) — despite the settings and brand pages in the same codebase already correctly being `async` Server Components reading `prisma` directly. The `useEffect` version costs an extra client→server round trip on every navigation, a hand-rolled loading skeleton instead of the framework's `loading.tsx`, no router prefetch/streaming, and duplicated auth/workspace-scoping logic the Server Component version gets for free from the layout.

**Recommendation:** convert list/detail pages that don't need per-keystroke interactivity to Server Components, keeping `'use client'` scoped to the interactive leaf only. Apply to the competitors page, the calendar, the response inbox, and the performance dashboard, which all share this shape.

## 3. Dependency currency — Medium

| Package | Current | Latest | Gap |
|---|---|---|---|
| `@anthropic-ai/sdk` | 0.95.2 | 0.116.0 | 21 minors — the SDK for the product's core AI features |
| `@auth0/nextjs-auth0` | 4.20.0 | 4.26.0 | 6 minors — auth library, security-relevant |
| `@prisma/client`/`prisma` | 6.19.3 | 7.9.1 | 1 major |
| `bullmq` | 5.76.8 | 6.1.0 | 1 major — the worker queue engine everything on Railway runs on |
| `ioredis` | 5.10.1 | 6.0.0 | 1 major |
| `react-dropzone` | 15.0.0 | 20.1.0 | 5 majors |
| `eslint` | 9.39.4 | 10.8.1 | 1 major |
| `framer-motion` | 12.38.0 | 13.1.0 | 1 major |
| `typescript` | 5.9.3 | 7.0.2 | 2 majors |
| `@tiptap/*` | 3.23.2 | 3.30.0 | several minors |

`@anthropic-ai/sdk` and `@auth0/nextjs-auth0` carry the most real risk — the Anthropic SDK gates newer model capabilities and ~20 releases of bugfixes, and the Auth0 SDK is the authentication boundary for a system this same session's security review already flagged for an MCP OAuth account-takeover chain, so staying current with upstream session-handling fixes isn't optional. Prisma/BullMQ major gaps are lower urgency but worth planning for since both are load-bearing infrastructure.

**Recommendation:** prioritize `@auth0/nextjs-auth0` (minor, low-risk, security-relevant) and `@anthropic-ai/sdk` (check changelog given 0.x semver) near-term. Track Prisma 7 and BullMQ 6 as planned migrations, not urgent patches.

## 4. Deprecated `unstable_noStore` + redundant dynamic opt-outs — Low

`brand/page.tsx` sets `export const dynamic = 'force-dynamic'`, `export const revalidate = 0`, AND imports `unstable_noStore` — all three do the same thing, and `unstable_noStore` is Next's own "legacy" API as of the v16 docs (superseded by `connection()` or per-fetch `cache: 'no-store'`). `force-dynamic` alone is sufficient and already applied.

**Recommendation:** drop `unstable_noStore` and `revalidate = 0`; keep `force-dynamic` only.

## 5. React 19 hooks available but unused — Low

`useActionState`, `useFormStatus`, `useOptimistic`, `useTransition` appear in exactly one file. At least 9 components hand-roll the equivalent state machine (a `useState(false)` loading flag + try/catch/finally + manual re-enable). Cosmetic/consistency-level, not a correctness bug.

**Recommendation:** adopt `useTransition` for the simple fetch-then-navigate mutation pattern seen repeatedly (example given: delete-workspace-button.tsx).

## 6. No `viewport` export in root layout — Low

`app/layout.tsx` exports `metadata` correctly but has no `viewport` export. Not a deprecated-pattern issue, just an omission; low priority.

## What's already idiomatic (no action needed)

All 21+ dynamic API routes correctly type and `await` `params: Promise<{...}>` — fully aligned with the async-params model, zero stragglers on the old sync signature. `lib/auth0.ts` uses the modern class-based Auth0 v4 SDK, not the legacy v3 API. Tailwind v4 is fully migrated to the CSS-first `@theme` model with no leftover config file. Zero `any` in production code (all 21 occurrences are Vitest mock casts in test files). The only 3 raw `<img>` tags are all correctly `eslint-disable`d with a legitimate reason (external, unconfigured-domain sources). `lib/safe-fetch.ts` correctly uses `undici`'s `Agent` with custom DNS resolution rather than a stale `node-fetch` holdover. No deprecated Zod v4 chained-validator usage anywhere. Zero real `var` usage.
