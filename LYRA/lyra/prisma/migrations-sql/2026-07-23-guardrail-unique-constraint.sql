-- Guardrail uniqueness — prevent duplicate (workspaceId, type, value) rows,
-- e.g. two near-simultaneous approve requests for the same new crisis
-- keyword both racing a find-then-create and both succeeding.
-- If duplicate rows already exist, this will fail -- check for and remove
-- duplicates first (keep the oldest by createdAt) before re-running.
CREATE UNIQUE INDEX IF NOT EXISTS "Guardrail_workspaceId_type_value_key" ON "Guardrail"("workspaceId", "type", "value");
