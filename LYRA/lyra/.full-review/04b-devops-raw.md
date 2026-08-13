# Step 4B — CI/CD & DevOps Practices Review (raw agent output)

# DevOps / CI-CD Operational Review — LYRA (2026-08-13)

## Scope and method

Read directly: `.github/workflows/deploy.yml`, `.github/workflows/crons.yml`, `netlify.toml` (repo root), `railway.toml`, `vercel.json`, `Dockerfile.worker`, `scripts/cron/trigger.mjs`, `app/api/health/route.ts`, `.github/CODEOWNERS`, `prisma/migrations/` + `migrations-sql/`, `LYRA-Handover.md` (incident entry), `LYRA-Security.md` (§14-16), `README.md`.

---

## Finding 1 — CI never gates what reaches production (Critical)

**Verified directly.** `.github/workflows/deploy.yml` runs `lint-and-typecheck` → `test` → `build`, in dependency order, with no fourth job that deploys anything. Lines 120-131 explicitly confirm this is deliberate: Netlify and Railway both watch `main` via their own native GitHub App integrations and deploy the instant a push lands, in parallel with (not after) the Actions workflow. A previously-existing redundant `railway up` CLI deploy step was removed specifically because it always lost the race to the native integration — the fix addressed the symptom (noisy CI) but left the actual gating gap in place.

**Operational risk:** any commit that breaks the type-check, fails a test, or fails to build is live in production regardless. No repo artifact (no CODEOWNERS-enforced check-tied review requirement, no merge queue) evidences branch protection preventing a direct push to `main` from deploying broken code to a live multi-tenant SaaS handling customer social accounts and billing.

**What would concretely need to change to close this gap:**
1. **Branch protection on `main`** (GitHub repo settings, not a file) — require `lint-and-typecheck`/`test`/`build` status checks before merge, disallow direct pushes.
2. Confirm Netlify/Railway aren't also configured to build on arbitrary branches or force-pushes once (1) is in place.
3. Alternative: make the deploy platforms explicitly wait on the Actions run via native "wait for CI" settings (Netlify supports this per-context; Railway's CLI has no useful hook per the deploy.yml's own comment) — branch protection is the more reliable lever since it doesn't depend on two third-party platforms honoring a CI signal correctly.
4. None of this requires new workflow jobs — the existing three-job pipeline is already the right gate, it just needs to be wired to actually block the merge.

---

## Finding 2 — Dead Vercel config still present, and now up to 3 overlapping trigger sources during the cron migration (Low)

`vercel.json` declares 3 cron jobs targeting Vercel, a platform this app doesn't deploy to. Independently, `.github/workflows/crons.yml` (GitHub Actions native `schedule:` triggers) *also* declares overlapping cron jobs for the same 3 routes plus a `publish-due-posts` backstop — a third, still-live parallel trigger path, on top of the now-primary Railway cron-trigger services and the old cron-job.org entries the handover says are being kept running in parallel for a comparison window. As of this review there are potentially **three simultaneous trigger sources** for some routes (Railway, GitHub Actions schedule, cron-job.org) — not a correctness risk since the routes are idempotent/authenticated, but a redundancy/clarity problem of the same shape as Finding 3.

**Recommendation:** delete `vercel.json`. Once the Railway cron migration's comparison window closes, remove or repurpose `crons.yml`'s overlapping jobs and the cron-job.org entries.

---

## Finding 3 — Config drift is a systemic pattern here, not four isolated issues (High)

This project has the same root cause showing up in at least 5 places: the thing that's true in the dashboard/live environment and the thing declared in version control disagree, silently, with no automated check that would catch the divergence.

1. **Railway worker Start Command vs. dashboard reality** — `railway.toml` declares one value; during this session's cron migration, the live dashboard value for the same field was manually overwritten to something else entirely, and nothing but a human noticing "CRASHED" status caught it. The Railway CLI has no way to set or diff Start Command/Cron Schedule against the repo file at all (confirmed in the Handover doc).
2. **The 5 new Railway cron-trigger services exist nowhere in version control.** `railway.toml` has one `[deploy]` block for the main worker service only — the 5 `cron-*` services' Start Command, Cron Schedule, and env vars were all set by hand in the dashboard and are not declared, diffable, or reviewable in any repo file. There is no IaC artifact for the exact service class that just caused a real production incident.
3. **`Dockerfile.worker` vs. actual deploy mechanism** — its own header states it is not used by the live deployment; a committed, maintained-looking Dockerfile that silently doesn't describe production is exactly the artifact a future engineer or AI agent would reasonably trust and be wrong to.
4. **Prisma migration ledger vs. live DB schema** — the baseline migration was never marked applied; 8 hand-applied SQL files sit outside the ledger. `prisma migrate status`/`deploy` cannot be trusted to reflect the real schema.
5. **`vercel.json` vs. actual deploy target**, and `crons.yml`'s stale comments — smaller instances of the same shape.

**Root cause:** every one of these is a case where the authoritative state lives in a vendor dashboard rather than in a file Git can diff, review, and alert on. Nothing in this repo's CI diffs dashboard state against declared state.

**Recommendation (one fix class, not five):** where the platform supports it, move dashboard-only settings into version control (check whether Railway's config-as-code can now declare per-service Start Command/Cron Schedule for all 6 services). Where it genuinely can't, add a lightweight periodic drift check — a scheduled Action reading each service's live config via the Railway API/CLI and failing loudly against a checked-in expected-value manifest would have caught this exact incident in seconds rather than 15 minutes. Reconcile the Prisma ledger properly. Delete or clearly quarantine `Dockerfile.worker` and `vercel.json`.

---

## Finding 4 — The incident: what would have caught it faster, and what's still missing (High)

Read directly from `LYRA-Handover.md`: reconfiguring 5 new Railway cron services by hand, a paste landed on the wrong service, and the main worker fleet's Start Command was overwritten, crash-looping in production for ~15 minutes before a human noticed and fixed it (verified via actual runtime logs, not just dashboard status — good practice, but it only happened because a person was actively watching).

**What actually caught it: a human, mid-session, noticing. There was no automated detection.**

**Verified gaps:**
1. **No uptime/liveness monitoring on the worker fleet exists at all.** `app/api/health/route.ts`'s own comment states plainly the worker fleet has no HTTP server to expose an equivalent check on, and that previously there was no way to know it was degraded except a customer reporting it — a direct, first-party admission that this exact failure mode has no automated detection path today.
2. **`LYRA-Security.md` §15 independently confirms this as an already-known, accepted gap**: no SIEM/centralized monitoring, no error tracking, no structured log aggregation, no uptime monitoring anywhere in this stack, for any service.
3. **No staging environment to rehearse dashboard changes against.** `netlify.toml` explicitly disables deploy-preview/branch-deploy builds because they'd share production's real DATABASE_URL/STRIPE_SECRET_KEY/AUTH0 tenant. Railway has no visible staging environment either. Every dashboard change happens directly against the only environment that exists: production.
4. **No change-review step for infrastructure/dashboard config changes.** `CODEOWNERS` protects checked-in files like `railway.toml`, but the actual change that caused the incident (a Start Command field in the Railway web UI) has no review gate of any kind, because it isn't a file — ties directly to Finding 3 item 2.

**Concrete recommendations, ranked by leverage:**
- Add a minimal HTTP health listener to `workers/index.ts` (the existing code comment already names this as the missing piece) and point an external uptime monitor at it alongside `/api/health`, with real alerting. This single change would have cut the incident from "~15 minutes, caught by luck" to "caught within a 1-5 minute check interval, with an active alert" — the highest-leverage fix here.
- Configure Railway's own deployment/crash notifications (project-level webhook/Slack, no new code) — would have flagged the CRASHED status the moment it happened.
- Treat the Finding 3 drift-check as incident prevention, not just hygiene — it directly targets this failure class.
- A staging environment is the right long-term answer but a bigger lift, reasonable to sequence after the two cheaper items above.

---

## Finding 5 — No dependency or secret scanning in CI (Medium)

Neither workflow file runs `npm audit`, Dependabot, CodeQL, or secret-scanning. No `dependabot.yml` exists for this project (one exists for an unrelated sibling project in the same OneDrive tree, not LYRA). Given LYRA handles customer PII, OAuth tokens, and Stripe billing, an undetected vulnerable dependency or accidentally committed secret currently relies entirely on manual review.

**Recommendation:** enable GitHub's native Dependabot alerts (zero-config), add `npm audit --audit-level=high` to the existing lint job (non-blocking initially, same pattern as lint), add a lightweight secret-scan step (e.g. gitleaks).

---

## Finding 6 — Lint is permanently non-blocking, with a stated but unenforced intent to fix (Low)

`deploy.yml` runs lint with `continue-on-error: true` and an honest comment explaining why (762 pre-existing errors) plus an intent to remove the escape hatch once paid down — but no tracking issue, no ratchet, no date attached. Exactly the kind of "temporary" exception that becomes permanent.

**Recommendation:** add a lint-error-count ratchet (fail CI if the count increases from a committed baseline) or track the paydown as an explicit backlog item with a target.

---

## Finding 7 — Rollback is entirely manual and ad hoc (Medium)

No blue-green/canary/automated rollback for either platform (not unusual for this platform type). The Handover doc documents at least two real production outages from local `netlify deploy --prod` runs, caught and rolled back immediately — by a human noticing and manually re-deploying, not an automated trigger. Netlify's one-click "publish previous deploy" is the de facto rollback path but is undocumented as a runbook step anywhere in-repo.

**Recommendation:** document the actual rollback procedure as a short runbook. Given Finding 4's monitoring gaps, pairing this with real alerting is more urgent than the rollback mechanism itself — there's currently no reliable trigger to rollback *from*.

---

## Summary table

| # | Finding | Severity | Category |
|---|---|---|---|
| 1 | CI does not gate what Netlify/Railway deploy to production | Critical | CI/CD pipeline |
| 3 | Config drift is a systemic pattern (Railway dashboard vs. railway.toml, Prisma ledger vs. live DB, Dockerfile.worker/vercel.json vs. actual deploy target) | High | IaC / environment management |
| 4 | No monitoring/alerting on worker-fleet liveness; no staging env; no review gate on dashboard-only config | High | Monitoring & incident response |
| 5 | No dependency or secret scanning in CI | Medium | CI/CD pipeline (security) |
| 7 | Rollback is manual/undocumented, no automated trigger to invoke it | Medium | Deployment strategy |
| 2 | Dead vercel.json; overlapping/redundant cron trigger sources during migration | Low | IaC hygiene |
| 6 | Lint permanently non-blocking with no ratchet or tracked paydown | Low | CI/CD pipeline |

**Overall assessment:** the team has good instincts — comments throughout this repo are unusually candid about known gaps (Dockerfile.worker's header, netlify.toml's staging comment, the health-check route's comment, LYRA-Security.md §15) — but almost none of these documented gaps have been closed with automation. The through-line: the thing that's actually true in production lives in a vendor dashboard or a human's memory, not in a file Git can diff and CI can check. The highest-leverage next steps are the cheapest ones: branch protection on `main`, a worker-fleet health endpoint plus an external uptime monitor with alerting, and Dependabot — all dashboard/config changes with no new application code required.
