#!/usr/bin/env node
const { emitInitialPlan } = await import("../../apps/api/src/agent/plan.ts");
const { providerRegistry } = await import("../../apps/api/src/providers/registry.ts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const phrasings = [
  "Remember that my project is named Handle.",
  "Please save to memory that my preferred theme is dark.",
  "Remember that I drive a Tacoma.",
  "Store this project fact: Handle uses Zep for memory.",
  "Remember that my favorite color is teal.",
];

await providerRegistry.initialize();
const configuredProviders = providerRegistry
  .list()
  .filter((provider) => provider.id !== "local");
const enabledProviders = providerRegistry
  .getEnabled()
  .filter((provider) => provider.id !== "local");
const providers = enabledProviders.length > 0 ? enabledProviders : configuredProviders;

assert(providers.length > 0, "No API providers configured for cross-provider memory-save smoke");

const results = [];
for (const provider of providers) {
  const available = await provider.isAvailable();
  if (!available) {
    results.push({ providerId: provider.id, status: "skipped-unavailable" });
    continue;
  }

  const model = await provider.createModel(undefined, {
    diagnostics: { label: "memory-save-cross-provider" },
    streaming: false,
  });

  for (const [index, phrasing] of phrasings.entries()) {
    await emitInitialPlan(
      `memory-save-cross-provider-${provider.id}-${Date.now()}-${index}`,
      phrasing,
      {
        llm: model,
        provider: {
          id: provider.id,
          model: provider.config.primaryModel,
        },
      },
    );
  }
  results.push({ providerId: provider.id, status: "passed" });
}

assert(
  results.some((result) => result.status === "passed"),
  `No provider was available for cross-provider memory-save smoke: ${JSON.stringify(results)}`,
);

console.log(`[memory-save-cross-provider] PASS ${JSON.stringify(results)}`);
