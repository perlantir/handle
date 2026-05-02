-- Remove retired Phase 2 provider seeds.
DELETE FROM "ProviderConfig"
WHERE "id" IN ('qwen', 'xai');

-- Keep fallback ordering contiguous after replacing QWEN and xAI.
UPDATE "ProviderConfig"
SET "fallbackOrder" = 3
WHERE "id" = 'kimi';

UPDATE "ProviderConfig"
SET "fallbackOrder" = 5
WHERE "id" = 'local';

-- Add OpenRouter as the final API provider.
INSERT INTO "ProviderConfig" ("id", "enabled", "primaryModel", "fallbackOrder", "authMode", "baseURL", "modelName", "updatedAt")
VALUES ('openrouter', false, 'openrouter/auto', 4, 'apiKey', 'https://openrouter.ai/api/v1', 'OpenRouter Auto', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE
SET
    "enabled" = EXCLUDED."enabled",
    "primaryModel" = EXCLUDED."primaryModel",
    "fallbackOrder" = EXCLUDED."fallbackOrder",
    "authMode" = EXCLUDED."authMode",
    "baseURL" = EXCLUDED."baseURL",
    "modelName" = EXCLUDED."modelName",
    "updatedAt" = CURRENT_TIMESTAMP;
