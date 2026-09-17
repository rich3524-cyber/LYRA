# LYRA

**lyraonline.ai** — AI-powered social media intelligence platform

> Schedule. Publish. Converse. The only social media platform where AI responds to comments on your behalf.

---

## Quick Start for Developers

### 1. Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- VS Code with Claude Code extension

### 2. Clone and Install

```bash
git clone <repo-url> lyra
cd lyra
npm install
```

### 3. Environment Setup

Copy `.env.example` to `.env.local` and fill in all values:

```bash
cp .env.example .env.local
```

Required services to set up:
- **Auth0** — create a tenant at auth0.com, configure callback URLs
- **Stripe** — create products and prices for Starter/Pro/Agency tiers
- **AWS S3** — create bucket `lyra-assets` in ap-southeast-2
- **Anthropic** — API key from console.anthropic.com
- **Facebook Developer** — app with pages_manage_posts permissions
- **Google Cloud** — OAuth credentials for Business Profile API
- **LinkedIn Developer** — app with r_emailaddress, w_member_social scopes

### 4. Database Setup

```bash
npx prisma generate
npx prisma db push
```

### 5. Run Development Server

```bash
npm run dev
# App running at http://localhost:3000
```

### 6. Run Background Workers (separate terminal)

```bash
npx ts-node workers/post-publisher.worker.ts
```

---

## Claude Code Instructions

**Read CLAUDE.md first.** It contains the complete design system, architecture patterns, file structure, and coding standards. Claude Code reads this automatically.

When starting a new Claude Code session:
1. Open the project in VS Code
2. Open Claude Code
3. Say: **"Read CLAUDE.md and tell me what task we're working on next from the implementation plan in docs/specs/"**

Claude Code will orient itself and continue from where the last session left off.

---

## Key Documentation

| Document | Location | Purpose |
|---|---|---|
| Claude Code intelligence | `CLAUDE.md` | Architecture, design system, coding standards |
| Scope document | `docs/specs/lyra-scope-document.md` | Full product requirements |
| Implementation plan | `docs/specs/lyra-implementation-plan.md` | 15-task build plan with code |
| Database schema | `prisma/schema.prisma` | Full data model |
| Design tokens | `lib/design-tokens.ts` | Colour, typography, spacing reference |

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────┐
│                  LYRA Platform                   │
├─────────────────┬───────────────────────────────┤
│   Next.js App   │        Background Workers      │
│   (Vercel)      │        (Railway)               │
│                 │                                │
│  ┌───────────┐  │  ┌────────────────────────┐   │
│  │  App UI   │  │  │ post-publisher.worker  │   │
│  │ shadcn/ui │  │  │ comment-monitor.worker │   │
│  │  Tailwind │  │  │ ai-responder.worker    │   │
│  │  Framer   │  │  │ brand-sync.worker      │   │
│  └─────┬─────┘  │  └──────────┬─────────────┘   │
│        │        │             │                  │
│  ┌─────▼─────┐  │  ┌──────────▼─────────────┐   │
│  │ API Routes│  │  │       BullMQ           │   │
│  │(Next.js)  │  │  │    + Redis Queue       │   │
│  └─────┬─────┘  │  └────────────────────────┘   │
└────────│────────┴────────────────────────────────┘
         │
    ┌────┴─────────────────────────────────┐
    │           External Services          │
    │                                      │
    │  PostgreSQL   Anthropic Claude API   │
    │  Auth0        Stripe                 │
    │  AWS S3       Social Platform APIs   │
    └──────────────────────────────────────┘
```

---

## Design System Summary

| Element | Value |
|---|---|
| Background | `#080808` — near-black, ALL authenticated pages |
| Primary text | `#e2e2e2` — platinum |
| Secondary text | `#888888` |
| Borders | `#222222` subtle / `#333333` mid |
| Font — UI | DM Sans (300, 400, 500) |
| Font — Display | Instrument Serif (headings only) |
| Font — Data | Geist Mono (metrics, counts, IDs) |
| Animation | 150–300ms, cubic-bezier(0.16, 1, 0.3, 1) |
| Icons | Lucide React ONLY |

---

## Contributing

1. Read `CLAUDE.md` completely before writing any code
2. Run `npm run type-check` before every commit
3. Run `npm run lint` before every commit
4. Follow the pre-delivery UI checklist in `CLAUDE.md`
5. Commit messages: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`

---

*LYRA — Social, at signal strength.*
