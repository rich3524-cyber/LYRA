-- AlterEnum
BEGIN;
CREATE TYPE "CommentStatus_new" AS ENUM ('PENDING', 'AI_DRAFTED', 'APPROVED', 'RESPONDED', 'ESCALATED', 'IGNORED');
ALTER TABLE "Comment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Comment" ALTER COLUMN "status" TYPE "CommentStatus_new" USING ("status"::text::"CommentStatus_new");
ALTER TYPE "CommentStatus" RENAME TO "CommentStatus_old";
ALTER TYPE "CommentStatus_new" RENAME TO "CommentStatus";
DROP TYPE "CommentStatus_old";
ALTER TABLE "Comment" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

