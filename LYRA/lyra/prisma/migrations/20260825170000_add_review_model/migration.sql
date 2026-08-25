-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "zernioReviewId" TEXT NOT NULL,
    "rating" INTEGER,
    "authorName" TEXT,
    "text" TEXT,
    "sentiment" "Sentiment",
    "status" "CommentStatus" NOT NULL DEFAULT 'PENDING',
    "aiDraftResponse" TEXT,
    "finalResponse" TEXT,
    "respondedAt" TIMESTAMP(3),
    "platformCreatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Review_workspaceId_createdAt_idx" ON "Review"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_workspaceId_status_idx" ON "Review"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Review_socialAccountId_zernioReviewId_key" ON "Review"("socialAccountId", "zernioReviewId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

