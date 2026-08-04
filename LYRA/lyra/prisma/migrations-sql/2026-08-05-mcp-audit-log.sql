-- LYRA/lyra/prisma/migrations-sql/2026-08-05-mcp-audit-log.sql
CREATE TYPE "McpAuditOutcome" AS ENUM ('SUCCESS', 'ERROR');

CREATE TABLE "McpAuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "toolName" TEXT NOT NULL,
  "params" JSONB,
  "outcome" "McpAuditOutcome" NOT NULL,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "McpAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "McpAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "McpAuditLog_workspaceId_idx" ON "McpAuditLog"("workspaceId");
CREATE INDEX "McpAuditLog_userId_idx" ON "McpAuditLog"("userId");
CREATE INDEX "McpAuditLog_createdAt_idx" ON "McpAuditLog"("createdAt");
