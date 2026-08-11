-- LYRA/lyra/prisma/migrations-sql/2026-08-11-slack-notifications-approval-sla.sql
--
-- Slack notification channels + approval SLA tracking.
-- Apply via the Supabase SQL Editor (DIRECT_URL is unreachable from the dev
-- machine, so `prisma migrate` cannot run this -- see the 2026-08-02 handover
-- entry). Then run `npx prisma generate` locally.

BEGIN;

-- 1. Notification channels ---------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "ChannelType" AS ENUM ('SLACK', 'TEAMS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "NotificationChannel" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "type" "ChannelType" NOT NULL,
  "zernioAccountId" TEXT NOT NULL,
  "label" TEXT,
  "enabledEvents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lastDeliveryAt" TIMESTAMP(3),
  "lastDeliveryError" TEXT,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationChannel_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- One channel per workspace, enforced here rather than in route logic so a
-- concurrent double-connect cannot create two.
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationChannel_workspaceId_key"
  ON "NotificationChannel"("workspaceId");

-- 2. Approval SLA thresholds (per workspace) ---------------------------------

ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "approvalSlaHours" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS "approvalSlaUnscheduledHours" INTEGER NOT NULL DEFAULT 24;

-- 3. Approval SLA clock ------------------------------------------------------

ALTER TABLE "PostApproval"
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "slaAlertedAt" TIMESTAMP(3);

-- The SLA cron scans for pending approvals that have not alerted yet.
CREATE INDEX IF NOT EXISTS "PostApproval_status_slaAlertedAt_idx"
  ON "PostApproval"("status", "slaAlertedAt");

-- Backfill the clock for approvals already pending. createdAt is the best
-- available approximation for rows that predate this column, and leaving them
-- NULL would exclude every currently-pending unscheduled post from the SLA
-- permanently. Only PENDING rows are touched -- a resolved approval has no
-- live clock, and stamping one would be inventing history.
UPDATE "PostApproval"
   SET "submittedAt" = "createdAt"
 WHERE "status" = 'PENDING'
   AND "submittedAt" IS NULL;

COMMIT;

-- NOTE ON FIRST RUN: posts already sitting in PENDING_APPROVAL past their
-- deadline will each fire one alert on the first cron run after a workspace
-- connects a channel. That is genuine, actionable data rather than a bug, but
-- it can arrive as a small burst. Alerts fire only for workspaces that have a
-- channel with APPROVAL_SLA_BREACH enabled, so nothing fires before a customer
-- opts in.
