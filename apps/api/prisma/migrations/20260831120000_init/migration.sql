-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "QuestionnaireType" AS ENUM ('ROMANTIC', 'FRIEND');

-- CreateEnum
CREATE TYPE "MatchMode" AS ENUM ('ROMANTIC', 'FRIEND');

-- CreateEnum
CREATE TYPE "EnergyTxType" AS ENUM ('RECHARGE', 'CONSUME', 'REFUND', 'CLAIM');

-- CreateEnum
CREATE TYPE "SquareBoard" AS ENUM ('RECOMMEND', 'CAMPUS_WALL');

-- CreateEnum
CREATE TYPE "SquareAuthorType" AS ENUM ('USER', 'STUDENT_UNION', 'TEAM', 'SPONSOR');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER', 'STUDENT_UNION', 'TEAM', 'SPONSOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BANNED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SCALE', 'TEXT');

-- CreateEnum
CREATE TYPE "MatchJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('MATCHED_ROMANTIC', 'ROMANTIC_CONFIRMING', 'RELATIONSHIP_ROMANTIC', 'MATCHED_FRIEND', 'FRIEND_CONFIRMING', 'FRIEND_CONFIRMED', 'REJECTED', 'DISSOLVED', 'EXPIRED', 'PENDING_CONFIRM', 'MATCHED', 'RELATIONSHIP_MODE');

-- CreateEnum
CREATE TYPE "AdPricingModel" AS ENUM ('BUYOUT', 'CPM', 'CPC');

-- CreateEnum
CREATE TYPE "AdCampaignStatus" AS ENUM ('DRAFT', 'PENDING_UNION_REVIEW', 'PENDING_PLATFORM_REVIEW', 'REJECTED', 'PENDING_PAYMENT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'SUSPENDED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('AD_SHARE', 'SPONSOR_GRANT', 'WITHDRAWAL', 'ADJUSTMENT', 'CONVERSION_OUT', 'EVENT_TICKET');

-- CreateEnum
CREATE TYPE "SponsorLedgerType" AS ENUM ('TOPUP', 'CAMPAIGN_LOCK', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "SchoolCashLedgerType" AS ENUM ('CONVERSION_IN', 'WITHDRAWAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ConversionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContactThreadSide" AS ENUM ('SPONSOR', 'UNION');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "PublicSubmissionType" AS ENUM ('WAITLIST', 'SPONSOR');

-- CreateEnum
CREATE TYPE "PublicSubmissionStatus" AS ENUM ('PENDING', 'CONTACTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "studentCardUrl" TEXT,
    "schoolEmail" TEXT,
    "verifyCode" TEXT,
    "verifyCodeExpiresAt" TIMESTAMP(3),
    "verifyCodeAttempts" INTEGER NOT NULL DEFAULT 0,
    "connectCode" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_codes" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole",
    "schoolId" TEXT,
    "organizationName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "sourcedBySchoolId" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "invitedByCodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_mode_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "matchState" TEXT NOT NULL DEFAULT 'idle',
    "matchSearchingSince" TIMESTAMP(3),
    "weeklyMatchNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_mode_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energy_balances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalEnergy" INTEGER NOT NULL DEFAULT 0,
    "usedEnergy" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "energy_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "energy_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "EnergyTxType" NOT NULL,
    "amountEnergy" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "relatedMatchId" TEXT,
    "relatedMatchMode" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "energy_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nickname" TEXT,
    "realName" TEXT,
    "familyName" TEXT,
    "givenName" TEXT,
    "school" TEXT,
    "grade" TEXT,
    "gender" TEXT,
    "genderPref" TEXT,
    "age" INTEGER,
    "birthday" TEXT,
    "city" TEXT,
    "interests" TEXT[],
    "bio" TEXT,
    "avatarUrl" TEXT,
    "socialLinks" JSONB,
    "signature" TEXT,
    "coverUrl" TEXT,
    "tags" TEXT[],
    "major" TEXT,
    "mbti" TEXT,
    "nationality" TEXT,
    "studentId" TEXT,
    "realPhotos" TEXT[],
    "zodiac" TEXT,
    "wishGifts" TEXT[],
    "extraData" JSONB,
    "relationshipScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profileCompleteness" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couple_member_states" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT,
    "craving" TEXT,
    "schedule" TEXT,
    "loveYouCount" INTEGER NOT NULL DEFAULT 0,
    "loveYouDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "couple_member_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couple_anniversaries" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "image" TEXT,
    "images" TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "couple_anniversaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couple_bucket_items" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "doneBy" TEXT,
    "doneNote" TEXT,
    "doneImage" TEXT,
    "doneImages" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "couple_bucket_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couple_schedule_entries" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "couple_schedule_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couple_craving_entries" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "couple_craving_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_match_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "requireSameCity" BOOLEAN NOT NULL DEFAULT false,
    "requireSameUniversity" BOOLEAN NOT NULL DEFAULT false,
    "requireSameMajor" BOOLEAN NOT NULL DEFAULT false,
    "preferredNationalities" TEXT[],
    "preferredMbti" TEXT[],
    "preferredGender" TEXT,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "universityStage" TEXT,
    "preferredInterests" TEXT[],
    "preferredActivities" TEXT[],
    "friendRequirements" TEXT,
    "enhancedModeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "friendEnhancedCells" INTEGER DEFAULT 1,
    "matchBasis" TEXT DEFAULT 'both',
    "extraMatchInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_match_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_versions" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "type" "QuestionnaireType" NOT NULL DEFAULT 'ROMANTIC',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaire_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT,
    "description" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "group" TEXT,
    "code" TEXT,
    "semantics" TEXT NOT NULL DEFAULT 'similar',
    "hardness" TEXT NOT NULL DEFAULT 'soft',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "target" TEXT NOT NULL DEFAULT 'self',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelEn" TEXT,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionnaireVersionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_configs" (
    "id" TEXT NOT NULL,
    "cronExpr" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_jobs" (
    "id" TEXT NOT NULL,
    "status" "MatchJobStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "totalCandidates" INTEGER NOT NULL DEFAULT 0,
    "totalMatched" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "matchJobId" TEXT,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "mode" "MatchMode" NOT NULL DEFAULT 'ROMANTIC',
    "status" "MatchStatus" NOT NULL DEFAULT 'MATCHED_ROMANTIC',
    "score" DOUBLE PRECISION,
    "metadata" JSONB,
    "enhancedMode" TEXT,
    "enhancedUserEnergy" INTEGER,
    "enhancedAttemptedAt" TIMESTAMP(3),
    "userAConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "userBConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "relationshipStartedAt" TIMESTAMP(3),
    "compatibilityScore" DOUBLE PRECISION,
    "interactionStreak" INTEGER NOT NULL DEFAULT 0,
    "growthScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "empathyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dissolvedBy" TEXT,
    "dissolvedAt" TIMESTAMP(3),
    "dissolveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couple_posts" (
    "id" TEXT NOT NULL,
    "matchId" TEXT,
    "authorUserId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "images" TEXT[],
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "couple_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "parentCommentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_likes" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "square_posts" (
    "id" TEXT NOT NULL,
    "board" "SquareBoard" NOT NULL DEFAULT 'RECOMMEND',
    "authorType" "SquareAuthorType" NOT NULL DEFAULT 'USER',
    "authorUserId" TEXT,
    "adminId" TEXT,
    "school" TEXT,
    "coupleMatchId" TEXT,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "isSponsored" BOOLEAN NOT NULL DEFAULT false,
    "postType" TEXT NOT NULL DEFAULT 'normal',
    "pollOptions" JSONB,
    "reviewStatus" TEXT NOT NULL DEFAULT 'approved',
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "eventId" TEXT,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "deletedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deleteReason" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "pinnedAt" TIMESTAMP(3),
    "pinnedOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "square_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "square_post_comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "parentCommentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "square_post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "square_comment_likes" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "square_comment_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "square_post_likes" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "square_post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "square_poll_votes" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "square_poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "school" TEXT,
    "venue" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER,
    "ticketsSold" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published',
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_tickets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pricePaidCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'valid',
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contact" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "platformShareBps" INTEGER,
    "selfSourcedShareBps" INTEGER,
    "buyoutDailyPriceCents" INTEGER,
    "cpmPriceCents" INTEGER,
    "cpcPriceCents" INTEGER,
    "bankAccountName" TEXT,
    "bankName" TEXT,
    "bankAccountNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_campaigns" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "images" TEXT[],
    "landingUrl" TEXT,
    "pricingModel" "AdPricingModel" NOT NULL,
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "budgetCents" INTEGER,
    "totalPriceCents" INTEGER NOT NULL DEFAULT 0,
    "spendCents" INTEGER NOT NULL DEFAULT 0,
    "priceSnapshot" JSONB,
    "sourcedBySchoolId" TEXT,
    "paymentConfirmedByAdminId" TEXT,
    "paymentNote" TEXT,
    "paidAt" TIMESTAMP(3),
    "unionReviewedByAdminId" TEXT,
    "platformReviewedByAdminId" TEXT,
    "reviewNote" TEXT,
    "rejectedReason" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "suspendReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_placements" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "buyoutPriceCents" INTEGER,

    CONSTRAINT "ad_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_daily_stats" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spendCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ad_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_ledger_entries" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "bankSnapshot" JSONB NOT NULL,
    "requestedByAdminId" TEXT NOT NULL,
    "reviewedByAdminId" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_energy_ledger" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "type" "SponsorLedgerType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsor_energy_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_cash_ledger_entries" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" "SchoolCashLedgerType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_cash_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_conversion_requests" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "status" "ConversionStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "requestedByAdminId" TEXT NOT NULL,
    "reviewedByAdminId" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "school_conversion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_invite_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdByAdminId" TEXT NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "maxUses" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsor_invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_threads" (
    "id" TEXT NOT NULL,
    "sponsorAdminId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdBySide" "ContactThreadSide" NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sponsorUnreadCount" INTEGER NOT NULL DEFAULT 0,
    "schoolUnreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderAdminId" TEXT NOT NULL,
    "senderSide" "ContactThreadSide" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_exposures" (
    "id" TEXT NOT NULL,
    "matchId" TEXT,
    "matchJobId" TEXT,
    "mode" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "shownToUserId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "algorithmVersion" TEXT NOT NULL DEFAULT '',
    "constitutionVersion" TEXT NOT NULL DEFAULT '',
    "modelVersions" JSONB NOT NULL DEFAULT '{}',
    "featureSnapshot" JSONB NOT NULL,
    "finalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_exposures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_behavior_events" (
    "id" TEXT NOT NULL,
    "matchId" TEXT,
    "exposureId" TEXT,
    "mode" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_behavior_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_suggestion_dismisses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_suggestion_dismisses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_submissions" (
    "id" TEXT NOT NULL,
    "type" "PublicSubmissionType" NOT NULL,
    "email" TEXT NOT NULL,
    "organization" TEXT,
    "message" TEXT,
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PublicSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "handledByAdminId" TEXT,
    "handledAt" TIMESTAMP(3),
    "handleNote" TEXT,
    "convertedAdminId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_connectCode_key" ON "users"("connectCode");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_codes_email_purpose_key" ON "email_verification_codes"("email", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_role_schoolId_idx" ON "admin_users"("role", "schoolId");

-- CreateIndex
CREATE INDEX "admin_users_sourcedBySchoolId_idx" ON "admin_users"("sourcedBySchoolId");

-- CreateIndex
CREATE INDEX "admin_users_invitedByCodeId_idx" ON "admin_users"("invitedByCodeId");

-- CreateIndex
CREATE INDEX "user_mode_states_userId_mode_matchState_idx" ON "user_mode_states"("userId", "mode", "matchState");

-- CreateIndex
CREATE UNIQUE INDEX "user_mode_states_userId_mode_key" ON "user_mode_states"("userId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "energy_balances_userId_key" ON "energy_balances"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "energy_transactions_dedupeKey_key" ON "energy_transactions"("dedupeKey");

-- CreateIndex
CREATE INDEX "energy_transactions_userId_createdAt_idx" ON "energy_transactions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "energy_transactions_relatedMatchId_idx" ON "energy_transactions"("relatedMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- CreateIndex
CREATE INDEX "couple_member_states_matchId_idx" ON "couple_member_states"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "couple_member_states_matchId_userId_key" ON "couple_member_states"("matchId", "userId");

-- CreateIndex
CREATE INDEX "couple_anniversaries_matchId_idx" ON "couple_anniversaries"("matchId");

-- CreateIndex
CREATE INDEX "couple_bucket_items_matchId_idx" ON "couple_bucket_items"("matchId");

-- CreateIndex
CREATE INDEX "couple_schedule_entries_matchId_idx" ON "couple_schedule_entries"("matchId");

-- CreateIndex
CREATE INDEX "couple_craving_entries_matchId_idx" ON "couple_craving_entries"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "user_match_preferences_userId_mode_key" ON "user_match_preferences"("userId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_versions_version_key" ON "questionnaire_versions"("version");

-- CreateIndex
CREATE UNIQUE INDEX "answers_userId_questionnaireVersionId_questionId_key" ON "answers"("userId", "questionnaireVersionId", "questionId");

-- CreateIndex
CREATE INDEX "matches_mode_status_idx" ON "matches"("mode", "status");

-- CreateIndex
CREATE INDEX "matches_userAId_mode_status_idx" ON "matches"("userAId", "mode", "status");

-- CreateIndex
CREATE INDEX "matches_userBId_mode_status_idx" ON "matches"("userBId", "mode", "status");

-- CreateIndex
CREATE UNIQUE INDEX "matches_userAId_userBId_mode_key" ON "matches"("userAId", "userBId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "post_likes_postId_userId_key" ON "post_likes"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "square_posts_eventId_key" ON "square_posts"("eventId");

-- CreateIndex
CREATE INDEX "square_posts_board_createdAt_idx" ON "square_posts"("board", "createdAt");

-- CreateIndex
CREATE INDEX "square_posts_board_school_idx" ON "square_posts"("board", "school");

-- CreateIndex
CREATE INDEX "square_posts_authorType_createdAt_idx" ON "square_posts"("authorType", "createdAt");

-- CreateIndex
CREATE INDEX "square_posts_isHidden_createdAt_idx" ON "square_posts"("isHidden", "createdAt");

-- CreateIndex
CREATE INDEX "square_posts_reviewStatus_school_createdAt_idx" ON "square_posts"("reviewStatus", "school", "createdAt");

-- CreateIndex
CREATE INDEX "square_posts_school_pinnedAt_pinnedOrder_idx" ON "square_posts"("school", "pinnedAt", "pinnedOrder");

-- CreateIndex
CREATE INDEX "square_posts_coupleMatchId_idx" ON "square_posts"("coupleMatchId");

-- CreateIndex
CREATE INDEX "square_post_comments_postId_createdAt_idx" ON "square_post_comments"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "square_comment_likes_commentId_idx" ON "square_comment_likes"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "square_comment_likes_commentId_userId_key" ON "square_comment_likes"("commentId", "userId");

-- CreateIndex
CREATE INDEX "square_post_likes_postId_idx" ON "square_post_likes"("postId");

-- CreateIndex
CREATE INDEX "square_post_likes_userId_idx" ON "square_post_likes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "square_post_likes_postId_userId_key" ON "square_post_likes"("postId", "userId");

-- CreateIndex
CREATE INDEX "square_poll_votes_postId_optionIndex_idx" ON "square_poll_votes"("postId", "optionIndex");

-- CreateIndex
CREATE UNIQUE INDEX "square_poll_votes_postId_userId_key" ON "square_poll_votes"("postId", "userId");

-- CreateIndex
CREATE INDEX "events_status_startAt_idx" ON "events"("status", "startAt");

-- CreateIndex
CREATE INDEX "events_school_startAt_idx" ON "events"("school", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "event_tickets_code_key" ON "event_tickets"("code");

-- CreateIndex
CREATE INDEX "event_tickets_userId_createdAt_idx" ON "event_tickets"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "event_tickets_eventId_status_idx" ON "event_tickets"("eventId", "status");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

-- CreateIndex
CREATE INDEX "messages_matchId_createdAt_idx" ON "messages"("matchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "schools_name_key" ON "schools"("name");

-- CreateIndex
CREATE INDEX "ad_campaigns_status_startDate_idx" ON "ad_campaigns"("status", "startDate");

-- CreateIndex
CREATE INDEX "ad_campaigns_advertiserId_createdAt_idx" ON "ad_campaigns"("advertiserId", "createdAt");

-- CreateIndex
CREATE INDEX "ad_campaigns_sourcedBySchoolId_status_idx" ON "ad_campaigns"("sourcedBySchoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ad_placements_campaignId_schoolId_key" ON "ad_placements"("campaignId", "schoolId");

-- CreateIndex
CREATE INDEX "ad_daily_stats_schoolId_date_idx" ON "ad_daily_stats"("schoolId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ad_daily_stats_campaignId_schoolId_date_key" ON "ad_daily_stats"("campaignId", "schoolId", "date");

-- CreateIndex
CREATE INDEX "school_ledger_entries_schoolId_createdAt_idx" ON "school_ledger_entries"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "withdrawal_requests_schoolId_createdAt_idx" ON "withdrawal_requests"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_idx" ON "withdrawal_requests"("status");

-- CreateIndex
CREATE INDEX "sponsor_energy_ledger_adminId_createdAt_idx" ON "sponsor_energy_ledger"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "sponsor_energy_ledger_refId_idx" ON "sponsor_energy_ledger"("refId");

-- CreateIndex
CREATE INDEX "school_cash_ledger_entries_schoolId_createdAt_idx" ON "school_cash_ledger_entries"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "school_conversion_requests_schoolId_createdAt_idx" ON "school_conversion_requests"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "school_conversion_requests_status_idx" ON "school_conversion_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_invite_codes_code_key" ON "sponsor_invite_codes"("code");

-- CreateIndex
CREATE INDEX "sponsor_invite_codes_schoolId_createdAt_idx" ON "sponsor_invite_codes"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "contact_threads_schoolId_lastMessageAt_idx" ON "contact_threads"("schoolId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "contact_threads_sponsorAdminId_lastMessageAt_idx" ON "contact_threads"("sponsorAdminId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "contact_threads_sponsorAdminId_schoolId_key" ON "contact_threads"("sponsorAdminId", "schoolId");

-- CreateIndex
CREATE INDEX "contact_messages_threadId_createdAt_idx" ON "contact_messages"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "match_exposures_mode_shownAt_idx" ON "match_exposures"("mode", "shownAt");

-- CreateIndex
CREATE INDEX "match_exposures_userAId_idx" ON "match_exposures"("userAId");

-- CreateIndex
CREATE INDEX "match_exposures_userBId_idx" ON "match_exposures"("userBId");

-- CreateIndex
CREATE INDEX "match_exposures_matchId_idx" ON "match_exposures"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "match_exposures_matchJobId_matchId_key" ON "match_exposures"("matchJobId", "matchId");

-- CreateIndex
CREATE INDEX "match_behavior_events_mode_at_idx" ON "match_behavior_events"("mode", "at");

-- CreateIndex
CREATE INDEX "match_behavior_events_actorId_idx" ON "match_behavior_events"("actorId");

-- CreateIndex
CREATE INDEX "match_behavior_events_matchId_idx" ON "match_behavior_events"("matchId");

-- CreateIndex
CREATE INDEX "user_suggestion_dismisses_userId_createdAt_idx" ON "user_suggestion_dismisses"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_suggestion_dismisses_userId_targetUserId_key" ON "user_suggestion_dismisses"("userId", "targetUserId");

-- CreateIndex
CREATE INDEX "public_submissions_type_status_createdAt_idx" ON "public_submissions"("type", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "public_submissions_type_email_key" ON "public_submissions"("type", "email");

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_sourcedBySchoolId_fkey" FOREIGN KEY ("sourcedBySchoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_mode_states" ADD CONSTRAINT "user_mode_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_balances" ADD CONSTRAINT "energy_balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "energy_transactions" ADD CONSTRAINT "energy_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_match_preferences" ADD CONSTRAINT "user_match_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "questionnaire_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_questionnaireVersionId_fkey" FOREIGN KEY ("questionnaireVersionId") REFERENCES "questionnaire_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_matchJobId_fkey" FOREIGN KEY ("matchJobId") REFERENCES "match_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couple_posts" ADD CONSTRAINT "couple_posts_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couple_posts" ADD CONSTRAINT "couple_posts_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "couple_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "post_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "couple_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "square_posts" ADD CONSTRAINT "square_posts_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "square_posts" ADD CONSTRAINT "square_posts_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "square_posts" ADD CONSTRAINT "square_posts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "square_post_comments" ADD CONSTRAINT "square_post_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "square_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "square_post_comments" ADD CONSTRAINT "square_post_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "square_post_comments" ADD CONSTRAINT "square_post_comments_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "square_post_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "square_comment_likes" ADD CONSTRAINT "square_comment_likes_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "square_post_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "square_comment_likes" ADD CONSTRAINT "square_comment_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "square_post_likes" ADD CONSTRAINT "square_post_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "square_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "square_post_likes" ADD CONSTRAINT "square_post_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "square_poll_votes" ADD CONSTRAINT "square_poll_votes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "square_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "square_poll_votes" ADD CONSTRAINT "square_poll_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_placements" ADD CONSTRAINT "ad_placements_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_placements" ADD CONSTRAINT "ad_placements_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_daily_stats" ADD CONSTRAINT "ad_daily_stats_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_ledger_entries" ADD CONSTRAINT "school_ledger_entries_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_energy_ledger" ADD CONSTRAINT "sponsor_energy_ledger_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_cash_ledger_entries" ADD CONSTRAINT "school_cash_ledger_entries_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_conversion_requests" ADD CONSTRAINT "school_conversion_requests_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_invite_codes" ADD CONSTRAINT "sponsor_invite_codes_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_threads" ADD CONSTRAINT "contact_threads_sponsorAdminId_fkey" FOREIGN KEY ("sponsorAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_threads" ADD CONSTRAINT "contact_threads_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "contact_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_senderAdminId_fkey" FOREIGN KEY ("senderAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

