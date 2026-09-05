-- AlterTable
ALTER TABLE "users" ADD COLUMN     "verifiedSchool" TEXT;

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "streakCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "streakLastDate" TEXT;

-- AlterTable
ALTER TABLE "square_posts" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "replyToId" TEXT;

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "badgeColor" TEXT,
ADD COLUMN     "badgeText" TEXT,
ADD COLUMN     "badgeUrl" TEXT;

-- CreateTable
CREATE TABLE "message_likes" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_likes_messageId_idx" ON "message_likes"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "message_likes_messageId_userId_key" ON "message_likes"("messageId", "userId");

-- CreateIndex
CREATE INDEX "square_posts_lat_lng_idx" ON "square_posts"("lat", "lng");

-- CreateIndex
CREATE INDEX "messages_replyToId_idx" ON "messages"("replyToId");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "message_likes" ADD CONSTRAINT "message_likes_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_likes" ADD CONSTRAINT "message_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 存量已认证用户回填 verifiedSchool：他们通过审核时管理员看到的就是当时的
-- profile.school，以此为快照与历史事实一致；未认证/审核中/被驳回的一律留空。
UPDATE "users" u
SET "verifiedSchool" = p."school"
FROM "profiles" p
WHERE p."userId" = u."id"
  AND u."verificationStatus" = 'verified'
  AND p."school" IS NOT NULL
  AND p."school" <> '';
