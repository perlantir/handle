import { describe, expect, it, vi } from "vitest";
import { createKeychainClient, KEYCHAIN_SERVICE } from "./keychain";
import type { SecurityCommandRunner } from "./keychain";

describe("keychain client", () => {
  it("reads credentials through the macOS security CLI shape", async () => {
    const runSecurity = vi
      .fn<
        Parameters<SecurityCommandRunner>,
        ReturnType<SecurityCommandRunner>
      >()
      .mockResolvedValue({
        stdout: "test-key-not-real\n",
      });
    const keychain = createKeychainClient({ runSecurity });

    await expect(keychain.getCredential("openai:apiKey")).resolves.toBe(
      "test-key-not-real",
    );
    expect(runSecurity).toHaveBeenCalledWith("security", [
      "find-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      "openai:apiKey",
      "-w",
    ]);
  });

  it("writes credentials without invoking the real security CLI in tests", async () => {
    const runSecurity = vi
      .fn<
        Parameters<SecurityCommandRunner>,
        ReturnType<SecurityCommandRunner>
      >()
      .mockResolvedValue({});
    const keychain = createKeychainClient({ runSecurity });

    await keychain.setCredential("anthropic:apiKey", "test-key-not-real");

    expect(runSecurity).toHaveBeenCalledWith("security", [
      "add-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      "anthropic:apiKey",
      "-w",
      "test-key-not-real",
      "-U",
    ]);
  });

  it("deletes credentials and ignores missing entries", async () => {
    const notFound = Object.assign(new Error("not found"), { code: 44 });
    const runSecurity = vi
      .fn<
        Parameters<SecurityCommandRunner>,
        ReturnType<SecurityCommandRunner>
      >()
      .mockRejectedValue(notFound);
    const keychain = createKeychainClient({ runSecurity });

    await expect(keychain.deleteCredential("openrouter:apiKey")).resolves.toBe(
      undefined,
    );
  });

  it("returns a credential-not-found error for missing reads", async () => {
    const notFound = Object.assign(new Error("not found"), { code: 44 });
    const runSecurity = vi
      .fn<
        Parameters<SecurityCommandRunner>,
        ReturnType<SecurityCommandRunner>
      >()
      .mockRejectedValue(notFound);
    const keychain = createKeychainClient({ runSecurity });

    await expect(keychain.getCredential("kimi:apiKey")).rejects.toThrow(
      "Credential not found: kimi:apiKey",
    );
  });
});
