import { describe, expect, it } from "vitest";
import { API_PROVIDER_IDS, isProviderId, PROVIDER_IDS } from "./types";

describe("provider types", () => {
  it("recognizes supported provider IDs", () => {
    for (const providerId of PROVIDER_IDS) {
      expect(isProviderId(providerId)).toBe(true);
    }

    expect(isProviderId("ollama")).toBe(false);
  });

  it("keeps local out of the API provider set", () => {
    expect(API_PROVIDER_IDS).not.toContain("local");
  });
});
