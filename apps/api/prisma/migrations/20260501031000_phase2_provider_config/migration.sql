-- AlterTable
ALTER TABLE "Task" ADD COLUMN "providerOverride" TEXT;

-- CreateTable
CREATE TABLE "ProviderConfig" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "primaryModel" TEXT NOT NULL,
    "fallbackOrder" INTEGER NOT NULL,
    "authMode" TEXT NOT NULL DEFAULT 'apiKey',
    "baseURL" TEXT,
    "modelName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderConfig_pkey" PRIMARY KEY ("id")
);

-- SeedData
INSERT INTO "ProviderConfig" ("id", "enabled", "primaryModel", "fallbackOrder", "authMode", "baseURL", "modelName", "updatedAt")
VALUES
    ('openai', false, 'gpt-5.2', 1, 'apiKey', NULL, 'GPT-5.2', CURRENT_TIMESTAMP),
    ('anthropic', false, 'claude-sonnet-4-5', 2, 'apiKey', NULL, 'Claude Sonnet 4.5', CURRENT_TIMESTAMP),
    ('qwen', false, 'qwen-max', 3, 'apiKey', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'Qwen Max', CURRENT_TIMESTAMP),
    ('kimi', false, 'moonshot-v1-128k', 4, 'apiKey', 'https://api.moonshot.cn/v1', 'Kimi Moonshot', CURRENT_TIMESTAMP),
    ('xai', false, 'grok-4', 5, 'apiKey', 'https://api.x.ai/v1', 'Grok 4', CURRENT_TIMESTAMP),
    ('local', false, 'llama3.2', 6, 'apiKey', 'http://127.0.0.1:11434/v1', 'Local LLM', CURRENT_TIMESTAMP);
