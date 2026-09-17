# LYRA Creative Studio — Design Spec

**Status:** Post-launch feature — do not build until LYRA has launched and the core comment response product is validated with paying users.

**Goal:** Add a paid Creative Studio add-on that generates brand-consistent AI images, short-form video, and UGC-style ad creative directly inside LYRA — guided by each workspace's existing Brand Intelligence profile.

**Architecture:** Third-party API integrations (Ideogram, FLUX, Higgsfield, Runway, Arcads) behind an internal provider abstraction layer. LYRA is the UX and brand-intelligence orchestration layer, not the generation engine.

---

## Why This Exists

Agencies using LYRA already have a live brand profile for each client — voice, visual style, colour palette, tone. That profile currently drives AI caption generation and comment responses. Creative Studio extends it to visual assets. No other tool does this: Canva, Adobe Firefly, and Midjourney all require the user to re-brief their brand on every generation. LYRA eliminates that.

---

## What It Is

A new **Creative Studio** section in the LYRA sidebar — same pattern as LYRA Assistant — available as a flat monthly add-on per workspace.

### Scope

| Phase | Feature | Providers | Est. Build |
|---|---|---|---|
| 1 | AI image generation | Ideogram v3, FLUX 1.1 Pro (fal.ai) | 3–4 weeks |
| 2 | Short-form video generation | Higgsfield, Runway ML | 5–6 weeks after P1 |
| 3 | UGC-style ad creative | Arcads.ai, HeyGen | Treat as separate product launch |

Phase 3 (UGC/Ads) should be scoped and priced as a standalone product decision when the time comes — it is a fundamentally different UX and pricing category.

---

## Pricing Model

- **Add-on:** Flat monthly fee per workspace
- **Suggested Phase 1 price:** $49/month per workspace
- **Includes:** 150 images + 15 videos (Phase 2) per month
- **Credits reset monthly** — no rollover
- **Approximate API cost at cap:** $15–27/month, leaving healthy margin
- **Phase 2 price:** Step up when video launches — TBD based on video API costs at the time
- **Agency bulk rate:** Consider a discounted per-workspace rate for Agency tier customers with 5+ workspaces

**Margin note:** Video API costs ($0.50–2.00/clip) are significantly higher than images ($0.04–0.08). Price Phase 2 carefully — do not include video in a $49 plan without revisiting the margin math.

---

## How Brand AI Connects

Every generation goes through a three-step prompt pipeline:

1. **Brand AI drafts** — Claude reads the workspace brand profile and generates a structured prompt based on the user's selected content type and context
2. **User refines** — User sees the full prompt (their text in white, Brand AI additions in grey) and can edit or override anything
3. **Brand AI finalises** — Before the API call, Claude wraps the prompt with brand constraints: colour palette, visual style parameters, quality settings, aspect ratio, negative prompts

The user always has full control. The brand profile is never hidden — it's shown explicitly so users understand what's being applied.

---

## Architecture

### Provider Strategy

Two providers per creative type, abstracted behind a single internal service:

- **Images:** Ideogram v3 (primary — best for social graphics and text-in-images) + FLUX 1.1 Pro via fal.ai (secondary — better for photorealistic lifestyle/product shots)
- **Video:** Higgsfield (primary — purpose-built for social content) + Runway ML (secondary)
- **UGC Ads:** Arcads.ai + HeyGen — reassess provider landscape at Phase 3 planning time

The abstraction layer (`services/creative/generator.ts`) takes a finalised prompt + format and returns an asset URL. Swapping or adding providers requires no UX changes.

### Generation Pipeline (Phase 1 — synchronous, 2–8 seconds)

```
User selects content type + format
→ Claude generates prompt draft from brand profile
→ User edits or accepts
→ User clicks Generate
→ Claude finalises prompt with brand constraints
→ API call to Ideogram or FLUX
→ Image returned
→ Stored in S3
→ Saved as CreativeAsset in DB (status: PENDING_APPROVAL)
→ Appears in approval portal
→ On approval: status → APPROVED, available in composer media picker
```

Phase 2 (video) adds async processing via BullMQ — the architecture anticipates this.

### New Database Models

**CreativeAsset**
```
id, workspaceId, type (IMAGE | VIDEO | UGC_AD),
provider (IDEOGRAM | FLUX | HIGGSFIELD | RUNWAY | ARCADS | HEYGEN),
userPrompt, finalPrompt, s3Key,
status (PENDING_APPROVAL | APPROVED | REJECTED | IN_USE),
format (SQUARE | PORTRAIT_4_5 | LANDSCAPE | STORY_9_16),
creditsUsed, createdAt, updatedAt
```

**WorkspaceAddon**
```
id, workspaceId,
addonType (CREATIVE_STUDIO),
isActive, creditsLimit, creditsUsed, billingPeriodStart
```

### New API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/creative/prompt` | POST | Claude generates prompt draft from brand profile |
| `/api/creative/generate` | POST | Calls provider API, saves asset |
| `/api/creative/assets` | GET | Lists workspace creative library |
| `/api/creative/assets/[id]` | PATCH | Approve / reject asset |

### New Page

`app/(dashboard)/workspace/[workspaceId]/creative/page.tsx`

---

## UX

### Layout

Two-panel layout inside the Creative section:

**Left panel — Generate**
- Content type selector (Product shot / Lifestyle / Graphic / Custom)
- Format selector (1:1 / 4:5 / 9:16 / Landscape)
- Prompt area — Brand AI draft button + editable prompt field, Brand AI additions shown in muted text
- Provider selector (Ideogram / FLUX)
- Generate button showing credit cost
- Credits remaining counter

**Right panel — Library**
- Tabs: All / Pending Approval (badged count) / Approved / In Use
- Asset grid — thumbnail, content type label, provider, time ago, status badge
- Click asset to preview full size, see prompt used, approve/reject (if pending)

### Composer Integration

The existing post composer media picker gains a **Creative Library** tab alongside upload. Approved assets appear here, filterable by format. One click attaches to the post. No new workflow required.

### Approval Integration

Generated assets (status: PENDING_APPROVAL) appear in the existing client approval portal alongside post approvals. Clients approve or reject images using the workflow they already know. No new portal or emails needed.

---

## What Phase 1 Intentionally Excludes

- Video (Phase 2)
- Bulk / batch generation
- Template library
- Style presets beyond the brand profile
- Prompt history / favourites
- Usage analytics dashboard

These are all valid future additions. Ship the core first.

---

## Honest Assessment

**The differentiator is real.** Brand-guided prompt generation is genuinely unique in the social media management space. No competitor does this.

**The moat is a feature, not a product.** The AI comment response capability is what makes someone choose LYRA over a competitor. Creative Studio makes LYRA better for existing users — it is not the reason someone signs up. Build it after the core product is validated.

**Timing:** Build when LYRA has 50–100 paying agency clients and at least some of them are asking for it. Do not build speculatively pre-launch.

---

## When to Revisit This Spec

- LYRA has launched and is generating recurring revenue
- The comment response and brand intelligence features are stable
- User feedback includes requests for in-platform creative generation
- At that point: update provider landscape (the AI image/video space moves fast), re-check API pricing, then proceed to implementation planning
