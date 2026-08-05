# Migration ledger — adoption status

Started 2 Aug 2026. LYRA previously had no `prisma/migrations` directory at all — every
schema change since project start was applied by hand-running ad-hoc SQL (see
`prisma/migrations-sql/`) directly against Supabase, with no ledger, no drift detection,
and no CI gating. This directory adopts Prisma's real migration system going forward.

## What's done

`20260802000000_baseline/migration.sql` was generated locally via:
```
npx prisma migrate diff --from-empty --to-schema-datamodel=prisma/schema.prisma --script
```
This is a pure schema-file operation — it needs no database connection, and none was made.
It produces the SQL that would recreate the *current* `schema.prisma` from nothing, i.e. a
snapshot of where the live database already is today (confirmed: it already matches
`schema.prisma`, since every prior change was hand-applied to keep them in sync).

## What's NOT done — needs to run from an environment that can reach the direct DB connection

The live database is only reachable from here via Supabase's pooled connection
(`DATABASE_URL`, port 6543) — the direct connection Prisma Migrate needs (`DIRECT_URL`,
`db.votuufwukkhojunzrjoa.supabase.co:5432`) timed out from this machine when tested during
this session (`P1001: Can't reach database server`). This is almost certainly why past
sessions found `prisma migrate dev`/`db push` "hang" here — they're not hanging, they're
failing to reach the direct endpoint at all, likely an IPv4/IPv6 routing gap on this network.

Once run from somewhere that *can* reach `DIRECT_URL` (e.g. Railway's environment, or a
machine/network with proper IPv6, or after enabling Supabase's IPv4 add-on), the baseline
needs to be marked as already-applied — **not executed** — since the database already has
this schema:

```
npx prisma migrate resolve --applied 20260802000000_baseline
```

This writes one row to Prisma's own `_prisma_migrations` tracking table. It does not run
any DDL and does not modify the schema — it only tells Prisma Migrate "this migration's
changes already exist in the database, don't try to apply them." Verify afterward with
`npx prisma migrate status`, which should report the database is up to date.

## Going forward, once baselined

New schema changes should go through `npx prisma migrate dev --name <description>` (from an
environment that can reach `DIRECT_URL`) instead of hand-writing SQL into
`prisma/migrations-sql/`. That directory can be retired once this transition is complete —
until then, keep using it for changes made from this machine, and fold them into a real
migration file (via `prisma migrate dev` or `prisma db pull` + `migrate diff`) from wherever
migrations end up actually running.

## Known drift since the baseline

`prisma/migrations-sql/2026-08-05-mcp-audit-log.sql` (the `McpAuditLog` table) is a **pending**
hand-applied change, to be run via the Supabase SQL Editor (see the Phase 2 plan, Task 16 Step 1)
after `20260802000000_baseline`, and is not yet folded into a real migration file. Once applied,
it must be incorporated before this ledger can be trusted as a complete record of the live schema.
