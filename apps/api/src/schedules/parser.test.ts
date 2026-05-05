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
      name: "Research OpenAI weekday digest email",
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

  it("parses everyday wall-clock email automations without falling back to monthly", () => {
    const parsed = parseNaturalSchedule({
      text: "everyday at 4:09PM Central standard time email me hello",
      timezone: "America/Los_Angeles",
    });

    expect(parsed).toMatchObject({
      confidence: 0.86,
      cronExpression: "9 16 * * *",
      explanation: "Every day at 4:09 PM",
      input: {
        goal: "Hello",
      },
      name: "Daily Hello email",
      outputTarget: {
        channel: "EMAIL",
      },
      targetRef: {
        goal: "Hello",
      },
      targetType: "TASK",
      timezone: "America/Chicago",
    });
    expect(parsed.nextRuns.slice(0, 3)).toHaveLength(3);
  });
});
