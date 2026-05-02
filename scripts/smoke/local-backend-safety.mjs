import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SafetyGovernor } from "../../apps/api/src/execution/safetyGovernor";

const root = await fs.mkdtemp(join(tmpdir(), "handle-local-safety-"));
const workspaceDir = join(root, "workspace");
await fs.mkdir(workspaceDir, { recursive: true });

function assertDecision(label, result, expectedDecision, expectedPattern) {
  if (result.decision !== expectedDecision) {
    throw new Error(`${label}: expected ${expectedDecision}, got ${result.decision} (${result.reason})`);
  }
  if (expectedPattern && result.matchedPattern !== expectedPattern) {
    throw new Error(`${label}: expected pattern ${expectedPattern}, got ${result.matchedPattern ?? "<none>"}`);
  }
}

try {
  const governor = new SafetyGovernor({
    auditLogPath: join(root, "audit.log"),
    taskId: "smoke-local-safety",
    workspaceDir,
  });

  const forbiddenPathCases = [
    ["/System/Library/Foo", "/System"],
    ["/private/etc/passwd", "/private"],
    ["/usr/include/something", "/usr-not-local"],
    ["/etc/hosts", "/etc"],
    ["/var/log/system.log", "/var"],
    ["/Library/Preferences/com.apple.foo.plist", "/Library"],
    ["/Applications/Calculator.app/Contents", "/Applications"],
    ["~/.ssh/id_rsa", "~/.ssh"],
    ["~/.aws/credentials", "~/.aws"],
    ["~/.config/anything-not-handle/foo.txt", "~/.config-not-handle"],
  ];

  for (const [path, pattern] of forbiddenPathCases) {
    assertDecision(`path ${path}`, await governor.checkFileWrite(path), "deny", pattern);
  }

  const safeWorkspacePath = join(workspaceDir, "safe.txt");
  assertDecision("workspace write", await governor.checkFileWrite(safeWorkspacePath), "allow");

  const shellCases = [
    ["sudo cat /etc/passwd", "sudo"],
    ["echo hi && sudo cat /etc/passwd", "sudo"],
    ["doas echo hi", "doas"],
    ["pkexec echo hi", "pkexec"],
    ["$SUDO foo", "sudo-variable"],
    ["${SUDO} foo", "sudo-variable"],
    ["rm -rf /", "rm-recursive-root"],
    ["rm -rf /*", "rm-recursive-root"],
    ["rm -rf ~", "rm-recursive-root"],
    ["mkfs.ext4 /tmp/disk.img", "mkfs"],
    ["dd if=/dev/zero of=/dev/disk0", "dd-disk-write"],
  ];

  for (const [command, pattern] of shellCases) {
    assertDecision(`command ${command}`, governor.checkShellExec(command), "deny", pattern);
  }

  assertDecision("safe command", governor.checkShellExec("echo hello"), "allow");
  assertDecision("approval command", governor.checkShellExec("echo hi && echo bye"), "approve", "pipe-or-chain");

  console.log(`[local-backend-safety] PASS ${forbiddenPathCases.length + shellCases.length + 3} checks`);
} finally {
  await fs.rm(root, { force: true, recursive: true });
}
