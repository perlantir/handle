import type { ApprovalPolicy, RuntimePolicy, ToolPolicy } from "./types";

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  destructiveRequiresApproval: true,
  externalWriteRequiresApproval: true,
  highRiskVoiceApprovalRequiresCode: true,
};

export function mergeToolPolicies(...policies: ToolPolicy[]): ToolPolicy {
  const allowed = new Set<string>();
  const denied = new Set<string>();
  const requiresApproval = new Set<string>();

  for (const policy of policies) {
    policy.allowedToolPrefixes.forEach((item) => allowed.add(item));
    policy.deniedToolPrefixes.forEach((item) => denied.add(item));
    policy.requiresApprovalFor.forEach((item) => requiresApproval.add(item));
  }

  return {
    allowedToolPrefixes: Array.from(allowed).filter((prefix) => !Array.from(denied).some((deniedPrefix) => prefix.startsWith(deniedPrefix))),
    deniedToolPrefixes: Array.from(denied),
    requiresApprovalFor: Array.from(requiresApproval),
  };
}

export function strictestRuntimePolicy(...policies: RuntimePolicy[]): RuntimePolicy {
  return {
    maxIterations: Math.min(...policies.map((policy) => policy.maxIterations)),
    maxToolCalls: Math.min(...policies.map((policy) => policy.maxToolCalls)),
    requiresVerifier: policies.some((policy) => policy.requiresVerifier),
  };
}

export function isToolAllowed(toolName: string, policy: ToolPolicy) {
  if (policy.deniedToolPrefixes.some((prefix) => toolName.startsWith(prefix))) return false;
  return policy.allowedToolPrefixes.some((prefix) => toolName.startsWith(prefix));
}

export function toolRequiresApproval(toolName: string, policy: ToolPolicy) {
  return policy.requiresApprovalFor.some((prefix) => toolName.startsWith(prefix));
}

export function externalWriteRequiresApproval(toolName: string, policy: ToolPolicy, approvalPolicy = DEFAULT_APPROVAL_POLICY) {
  if (toolRequiresApproval(toolName, policy)) return true;
  if (!approvalPolicy.externalWriteRequiresApproval) return false;
  return /^(gmail\.send|slack\.send|github\.(create|update|comment)|drive\.(create|copy)|notion\.(create|update))/.test(toolName);
}
