ALTER TABLE "NotificationSettings"
  ADD COLUMN "emailLastTestStatus" TEXT,
  ADD COLUMN "emailLastTestedAt" TIMESTAMP(3),
  ADD COLUMN "emailLastTestError" TEXT,
  ADD COLUMN "slackLastTestStatus" TEXT,
  ADD COLUMN "slackLastTestedAt" TIMESTAMP(3),
  ADD COLUMN "slackLastTestError" TEXT,
  ADD COLUMN "webhookLastTestStatus" TEXT,
  ADD COLUMN "webhookLastTestedAt" TIMESTAMP(3),
  ADD COLUMN "webhookLastTestError" TEXT;
