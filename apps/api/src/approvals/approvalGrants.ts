import type { ApprovalPayload } from '@handle/shared';
import { logger } from '../lib/logger';

type GrantScope = {
  projectId?: string | null;
  taskId: string;
};

const grantsByScope = new Map<string, Set<string>>();

function scopeKey(scope: GrantScope) {
  return scope.projectId ? `project:${scope.projectId}` : `task:${scope.taskId}`;
}

export function approvalGrantKey(request: ApprovalPayload) {
  switch (request.type) {
    case 'shell_exec':
      return request.command ? `shell_exec:${request.command}` : null;
    case 'file_write_outside_workspace':
      return request.path ? `file_write:${request.path}` : null;
    case 'file_delete':
      return request.path ? `file_delete:${request.path}` : null;
    case 'risky_browser_action':
      return request.action && request.target
        ? `browser:${request.action}:${request.target}`
        : null;
    default:
      return null;
  }
}

export function registerApprovalGrant(scope: GrantScope, request: ApprovalPayload) {
  const key = approvalGrantKey(request);
  if (!key) return false;

  const bucketKey = scopeKey(scope);
  const bucket = grantsByScope.get(bucketKey) ?? new Set<string>();
  bucket.add(key);
  grantsByScope.set(bucketKey, bucket);
  logger.info(
    { approvalGrantKey: key, projectId: scope.projectId ?? null, taskId: scope.taskId },
    'Approval grant registered',
  );
  return true;
}

export function hasApprovalGrant(scope: GrantScope, request: ApprovalPayload) {
  const key = approvalGrantKey(request);
  if (!key) return false;

  return (
    (scope.projectId ? grantsByScope.get(`project:${scope.projectId}`)?.has(key) : false) ||
    grantsByScope.get(`task:${scope.taskId}`)?.has(key) ||
    false
  );
}

export function clearApprovalGrantsForTest() {
  grantsByScope.clear();
}
