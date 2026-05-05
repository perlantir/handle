import { describe, expect, it } from "vitest";
import { parseVoiceApproval, parseVoiceCommand } from "./parser";

describe("voice parser", () => {
  it("rejects vague high-risk approval phrases without code", () => {
    const result = parseVoiceApproval({
      confirmationCode: "4821",
      target: "emails",
      transcript: "yeah sure",
    });

    expect(result.decision).toBe("REJECTED");
    expect(result.rejectionReason).toBe("missing explicit approve or deny verb");
  });

  it("rejects approval without exact confirmation code", () => {
    const result = parseVoiceApproval({
      confirmationCode: "4821",
      target: "emails",
      transcript: "approve emails",
    });

    expect(result.decision).toBe("REJECTED");
    expect(result.rejectionReason).toBe("missing confirmation code");
  });

  it("accepts approval with verb, target, and exact code", () => {
    const result = parseVoiceApproval({
      confirmationCode: "4821",
      target: "emails",
      transcript: "approve emails 4821",
    });

    expect(result.decision).toBe("EXECUTED");
    expect(result.commandType).toBe("APPROVE_ACTION");
  });

  it("parses status queries as low-risk executable commands", () => {
    const result = parseVoiceCommand("What is the status?");

    expect(result.commandType).toBe("STATUS_QUERY");
    expect(result.riskLevel).toBe("LOW");
    expect(result.decision).toBe("EXECUTED");
  });
});
