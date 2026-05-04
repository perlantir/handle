ALTER TABLE "AgentRun" ADD COLUMN "userId" TEXT;

CREATE INDEX "AgentRun_userId_idx" ON "AgentRun"("userId");
