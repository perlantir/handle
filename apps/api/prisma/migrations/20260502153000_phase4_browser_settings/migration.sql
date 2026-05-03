CREATE TABLE "BrowserSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "mode" TEXT NOT NULL DEFAULT 'separate-profile',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrowserSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "BrowserSettings" ("id", "mode", "updatedAt")
VALUES ('global', 'separate-profile', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
