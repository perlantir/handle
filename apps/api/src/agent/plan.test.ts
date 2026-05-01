import { describe, expect, it } from "vitest";
import { parsePlanSteps } from "./plan";

describe("parsePlanSteps", () => {
  it("parses a JSON plan object into pending steps", () => {
    expect(
      parsePlanSteps('{"steps":["Write script","Run script","Read output"]}'),
    ).toEqual([
      { id: "plan-1", title: "Write script", state: "pending" },
      { id: "plan-2", title: "Run script", state: "pending" },
      { id: "plan-3", title: "Read output", state: "pending" },
    ]);
  });

  it("extracts JSON from a fenced response", () => {
    expect(parsePlanSteps('```json\n["A","B"]\n```')).toHaveLength(2);
  });
});
