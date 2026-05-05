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
        directMessage: true,
        goal: "Hello",
        message: "Hello",
      },
      name: "Daily Hello email",
      outputTarget: {
        channel: "EMAIL",
      },
      targetRef: {
        directMessage: true,
        goal: "Hello",
        message: "Hello",
      },
      targetType: "TASK",
      timezone: "America/Chicago",
    });
    expect(parsed.nextRuns.slice(0, 3)).toHaveLength(3);
  });

  it("extracts the message body from email-me-at-time phrasing", () => {
    const parsed = parseNaturalSchedule({
      text: "email me at 4:43PM daily and say hello",
      timezone: "America/Chicago",
    });

    expect(parsed).toMatchObject({
      cronExpression: "43 16 * * *",
      explanation: "Every day at 4:43 PM",
      input: {
        directMessage: true,
        goal: "Hello",
        message: "Hello",
      },
      name: "Daily Hello email",
      outputTarget: {
        channel: "EMAIL",
      },
      targetRef: {
        directMessage: true,
        goal: "Hello",
        message: "Hello",
      },
      targetType: "TASK",
      timezone: "America/Chicago",
    });
  });

  it("extracts arbitrary literal messages without special-casing hello", () => {
    const parsed = parseNaturalSchedule({
      text: "email me daily at 4:59PM and say automated delivery test from handle",
      timezone: "America/Chicago",
    });

    expect(parsed).toMatchObject({
      cronExpression: "59 16 * * *",
      input: {
        directMessage: true,
        goal: "Automated delivery test from handle",
        message: "Automated delivery test from handle",
      },
      name: "Daily Automated delivery test from handle email",
      outputTarget: {
        channel: "EMAIL",
      },
      targetRef: {
        directMessage: true,
        goal: "Automated delivery test from handle",
        message: "Automated delivery test from handle",
      },
      targetType: "TASK",
    });
  });
});
