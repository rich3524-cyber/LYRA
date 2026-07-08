-- Zernio bridge Phase 3 — correct mislabeled provider column.
-- Phase 1's schema migration defaulted every existing SocialAccount row to
-- provider='ZERNIO' (a DB-level DEFAULT applied retroactively to already-native
-- accounts). Confirmed 2026-07-08: all 13 production rows have provider='ZERNIO',
-- zernioAccountId IS NULL, accessToken IS NOT NULL -- i.e. every one is actually
-- native. Correct them before Phase 3 wires up getProvider() dispatch for real
-- publishing, or every existing publish would misroute to Zernio and throw.
-- Idempotent: safe to run more than once (WHERE clause only matches unfixed rows).
UPDATE "SocialAccount"
SET "provider" = 'NATIVE'
WHERE "provider" = 'ZERNIO' AND "zernioAccountId" IS NULL;
