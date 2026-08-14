-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_socialAccountId_fkey";

-- DropTable
DROP TABLE "Review";

