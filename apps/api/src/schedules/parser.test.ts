import { describe, expect, it } from "vitest";
import { parseNaturalSchedule } from "./parser";

describe("parseNaturalSchedule", () => {
  it("fills the full schedule payload for a weekday company research digest", () => {
    const parsed = parseNaturalSchedule({
      text: "every weekday at 9am, research OpenAI and email me the report",
      timezone: "America/Chicago",
    });

    expect(parsed).toMatchObject({
      cronExpression: "0 9 * * 1-5",
      input: {
        company: "OpenAI",
        depth: "standard",
      },
      name: "Research OpenAI weekday digest",
      outputTarget: {
        channel: "EMAIL",
      },
      targetRef: {
        skillSlug: "research-company",
      },
      targetType: "SKILL",
      timezone: "America/Chicago",
    });
    expect(parsed.nextRuns.slice(0, 3)).toHaveLength(3);
  });
});
