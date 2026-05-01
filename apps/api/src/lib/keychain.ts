import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const KEYCHAIN_SERVICE = "com.perlantir.handle";

export interface SecurityCommandResult {
  stderr?: string;
  stdout?: string;
}

export type SecurityCommandRunner = (
  command: string,
  args: string[],
) => Promise<SecurityCommandResult>;

export interface KeychainClientOptions {
  runSecurity?: SecurityCommandRunner;
  service?: string;
}

function isNotFoundError(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err.code === 44 || err.code === "44")
  );
}

function keychainError(action: string, account: string, err: unknown) {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String(err.code)
      : "unknown";
  const reason = `security command exited with code ${code}`;
  return new Error(`Keychain ${action} failed for ${account}: ${reason}`);
}

async function defaultRunSecurity(command: string, args: string[]) {
  const { stderr, stdout } = await execFileP(command, args);
  return { stderr, stdout };
}

export function createKeychainClient({
  runSecurity = defaultRunSecurity,
  service = KEYCHAIN_SERVICE,
}: KeychainClientOptions = {}) {
  return {
    async deleteCredential(account: string): Promise<void> {
      try {
        await runSecurity("security", [
          "delete-generic-password",
          "-s",
          service,
          "-a",
          account,
        ]);
      } catch (err) {
        if (isNotFoundError(err)) return;
        throw keychainError("delete", account, err);
      }
    },

    async getCredential(account: string): Promise<string> {
      try {
        const { stdout = "" } = await runSecurity("security", [
          "find-generic-password",
          "-s",
          service,
          "-a",
          account,
          "-w",
        ]);
        return stdout.trim();
      } catch (err) {
        if (isNotFoundError(err)) {
          throw new Error(`Credential not found: ${account}`);
        }
        throw keychainError("read", account, err);
      }
    },

    async setCredential(account: string, value: string): Promise<void> {
      try {
        await runSecurity("security", [
          "add-generic-password",
          "-s",
          service,
          "-a",
          account,
          "-w",
          value,
          "-U",
        ]);
      } catch (err) {
        throw keychainError("write", account, err);
      }
    },
  };
}

const defaultClient = createKeychainClient();

export async function deleteCredential(account: string): Promise<void> {
  return defaultClient.deleteCredential(account);
}

export async function getCredential(account: string): Promise<string> {
  return defaultClient.getCredential(account);
}

export async function setCredential(
  account: string,
  value: string,
): Promise<void> {
  return defaultClient.setCredential(account, value);
}
