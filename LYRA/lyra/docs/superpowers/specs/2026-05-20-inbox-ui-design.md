# Comment Inbox UI Design

**Date:** 2026-05-20  
**Status:** Approved

---

## Goal

Complete the Comment Inbox so that approved AI responses are published live to Facebook and Instagram, the UI respects the workspace's AI response mode, and users can filter comments by platform.

---

## Architecture

### New: `POST /api/comments/[id]/reply`

Accepts `{ response: string }`. Server-side flow:

1. Fetch comment by ID, verify workspace access
2. Confirm comment is not already RESPONDED
3. Fetch `socialAccount` (platform + platformCommentId + encrypted accessToken)
4. Decrypt access token
5. Call `replyToComment()` from `services/social/facebook.ts`
6. On success: update comment → `status: RESPONDED`, `finalResponse: response`, `respondedAt: now()`
7. On platform API failure: return 502 with error message, leave comment status unchanged

Only Facebook and Instagram are supported. Attempts to reply on other platforms return 400.

### New: `replyToComment()` in `services/social/facebook.ts`

```typescript
export async function replyToComment(
  platformCommentId: string,
  message: string,
  accessToken: string
): Promise<void>
```

Calls `POST https://graph.facebook.com/v19.0/{platformCommentId}/comments` with `{ message, access_token }`. Throws on API error. Works for both Facebook and Instagram (same Graph API endpoint).

Also called by `workers/ai-responder.worker.ts` when `autoPost: true` (FULL autonomy mode).

### Modified: `services/ai/response-generator.ts`

Fix model ID: change `claude-sonnet-4-20250514` → `claude-sonnet-4-6` to match project standard.

---

## UI

### Page: `app/(dashboard)/workspace/[workspaceId]/inbox/page.tsx`

Fetch `aiResponseMode` and `plan` from the workspace Prisma select. Pass both to `<ResponseInbox>`.

### Component: `response-inbox.tsx`

**Props added:** `aiResponseMode: 'OFF' | 'DRAFT_APPROVE' | 'FULL'`, `plan: 'STARTER' | 'PRO' | 'AGENCY'`

**Platform filter:** A compact filter row above the tabs. Derives available platforms from the loaded comments (only show chips for platforms that have at least one comment). Chips: **All · FB · IG** (using existing `PLATFORM_LABELS` abbreviations). "All" selected by default. Selection filters all three tabs simultaneously — client-side, no refetch.

Pass `aiResponseMode` and `plan` down to each `<CommentCard>`.

### Component: `comment-card.tsx`

**Props added:** `aiResponseMode: 'OFF' | 'DRAFT_APPROVE' | 'FULL'`, `plan: 'STARTER' | 'PRO' | 'AGENCY'`

**Three UI states:**

**STARTER or `aiResponseMode === 'OFF'`**
- No AI draft section
- No Generate button
- Plain textarea for manual response (placeholder: "Write a reply.")
- "Send reply" button calls `POST /api/comments/[id]/reply`
- Escalate and Ignore buttons remain

**PRO / `aiResponseMode === 'DRAFT_APPROVE'`**
- AI draft section with character counter
- Generate / Re-generate button calls `POST /api/ai/respond`
- "Approve & send" button calls `POST /api/comments/[id]/reply` (not a bare PATCH as today)
- Escalate and Ignore buttons remain

**AGENCY / `aiResponseMode === 'FULL'`**
- RESPONDED comments show in Done tab with `finalResponse` text and "Auto-sent" label (Sparkles icon, `text-text-secondary`)
- Manual override still available for PENDING comments (same as DRAFT_APPROVE flow — agent may have failed to auto-post)
- Escalated comments unchanged

**"Send reply" / "Approve & send" flow:**
1. Disable button, show spinner
2. `POST /api/comments/[id]/reply` with `{ response: draft }`
3. On success: call `onUpdate()` to move card to Done tab. Show toast: "Reply sent."
4. On failure: show toast with server error message. Leave card in place.

---

## Worker: `workers/ai-responder.worker.ts`

Wire up the existing `// TODO: publish to platform via social API` block for `autoPost: true`:

1. After generating the response, fetch the `socialAccount` for the comment
2. Decrypt the access token
3. Call `replyToComment(comment.platformCommentId, result.response, token)`
4. On success: update comment to `RESPONDED` with `finalResponse` and `respondedAt`
5. On failure: update comment to `AI_DRAFTED` (fall back to human review) and log error

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Platform API rejects reply (deleted comment, expired token, etc.) | 502 from reply route; toast shows server message; comment stays in Pending |
| Comment already RESPONDED | 400 from reply route; toast: "Already responded." |
| Platform is not Facebook or Instagram | 400 from reply route; toast: "Platform not supported for live replies." |
| No response text | Client-side guard: Send button disabled when textarea is empty |
| Worker autoPost fails | Comment falls back to AI_DRAFTED; available for manual approval in Pending tab |

---

## Files

| File | Change |
|---|---|
| `services/social/facebook.ts` | Add `replyToComment()` |
| `app/api/comments/[id]/reply/route.ts` | New POST handler |
| `app/api/comments/route.ts` | No change needed — all Comment fields returned already |
| `services/ai/response-generator.ts` | Fix model ID to `claude-sonnet-4-6` |
| `app/(dashboard)/workspace/[workspaceId]/inbox/page.tsx` | Add `aiResponseMode` + `plan` to workspace select; pass to ResponseInbox |
| `components/lyra/inbox/response-inbox.tsx` | Platform filter chips; accept + thread mode/plan props |
| `components/lyra/inbox/comment-card.tsx` | Mode-aware UI; call `/reply` endpoint on approve/send |
| `workers/ai-responder.worker.ts` | Implement autoPost platform publishing |

---

## Out of Scope

- LinkedIn, TikTok, Twitter reply publishing (API restrictions / not yet connected)
- Google Business review replies (separate API — future feature)
- Sentiment filter (not requested)
- Inbox notifications / real-time updates (future)
- De-escalation flow (future)
