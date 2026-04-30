import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

export async function expireStalePendingApprovals({ olderThanMs = 60 * 60 * 1000 } = {}) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const result = await prisma.approvalRequest.updateMany({
    data: {
      respondedAt: new Date(),
      status: 'timeout',
    },
    where: {
      createdAt: { lt: cutoff },
      status: 'pending',
    },
  });

  if (result.count > 0) {
    logger.warn({ count: result.count }, 'Marked stale pending approvals as timed out');
  }

  return result.count;
}
